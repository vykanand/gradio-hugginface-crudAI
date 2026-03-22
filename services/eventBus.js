const { Kafka } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');
const eventRegistry = require('../lib/eventRegistry');
const kafkaAdmin = require('./kafkaAdmin');
const kafkaEventStore = require('./kafkaEventStore');

// Kafka Setup
const kafkaBrokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const kafka = new Kafka({ clientId: 'orchestrator-server', brokers: kafkaBrokers });
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID || 'orchestrator-group' });

// Topics
const TOPIC = process.env.ORCH_EVENTS_TOPIC || 'orchestrator-events';
const FIELD_EVENTS_TOPIC = process.env.FIELD_EVENTS_TOPIC || 'billionerp-field-events';
const RECORD_EVENTS_TOPIC = process.env.RECORD_EVENTS_TOPIC || 'billionerp-record-events';

// In-memory registry: module -> { events: { name: count }, total: number }
const registry = {};
const sseClients = new Set();

// Track recently seen event ids to avoid double-counting
const seenEventMap = new Map();
const SEEN_TTL_MS = 24 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of seenEventMap) {
    if (now - ts > SEEN_TTL_MS) seenEventMap.delete(id);
  }
}, 60 * 60 * 1000);

// Pending sends queue
const pendingSends = new Set();

// Configuration
const MAX_SEND_ATTEMPTS = parseInt(process.env.EVENT_MAX_SEND_ATTEMPTS || '6', 10);
const RETRY_BASE_MS = parseInt(process.env.EVENT_RETRY_BASE_MS || '1000', 10);


async function init() {
  try {
    await producer.connect();
  } catch (e) { console.warn('Kafka producer connect failed', e && e.message ? e.message : e); }
  try {
    await consumer.connect();
    // Subscribe to orchestrator events AND incoming billionerp field/record events
    await consumer.subscribe({ topics: [TOPIC, FIELD_EVENTS_TOPIC, RECORD_EVENTS_TOPIC], fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const raw = message.value ? message.value.toString() : null;
          if (!raw) return;
          const obj = JSON.parse(raw);
          _updateRegistryAndBroadcast(obj);
        } catch (e) {
          console.warn('Failed to process kafka message', e && e.message ? e.message : e);
        }
      }
    });
  } catch (e) { console.warn('Kafka consumer setup failed', e && e.message ? e.message : e); }

  // Initialize Kafka admin and create compacted topics for event persistence
  // (best-effort, don't block on failures)
  if (process.env.ENABLE_KAFKA_TOPICS !== 'false') {
    try {
      await kafkaAdmin.initKafkaAdmin(kafka);
      await kafkaAdmin.ensureCompactedTopics();
    } catch (e) {
      console.warn('Kafka topic initialization failed (may already exist):', e && e.message ? e.message : e);
    }
  }

  // seed eventRegistry from any existing in-memory registry
  try { eventRegistry.init({ existingRegistry: registry }); } catch (e) {}

  // recover any pending events from DB so delivery resumes after restart
  try { await recoverPendingEvents(); } catch (e) { console.warn('recoverPendingEvents failed', e && e.message ? e.message : e); }

  // Schedule periodic reconciliation of event registry (keeps bindings consistent with persisted DB)
  try {
    const ms = parseInt(process.env.EVENT_REGISTRY_RECONCILE_MS || String(5 * 60 * 1000), 10);
    // run initial reconcile now (best-effort)
    try { if (eventRegistry && eventRegistry.reconcile) eventRegistry.reconcile().catch(()=>{}); } catch(e) {}
    // schedule recurring
    setInterval(() => {
      try { if (eventRegistry && eventRegistry.reconcile) eventRegistry.reconcile().catch((err)=>{ console.warn('eventRegistry.reconcile failed', err && err.message ? err.message : err); }); } catch (e) {}
    }, ms);
  } catch (e) {}
}

// Load pending events from Kafka event-records topic on startup
async function recoverPendingEvents() {
  try {
    // Load event records from Kafka and re-enqueue any non-published events
    const records = await kafkaEventStore.loadAllEventRecords(kafka);
    if (records && Array.isArray(records)) {
      for (const rec of records) {
        if (rec && rec.id && rec.status !== 'published') {
          _enqueueSend(rec.id);
        }
      }
    }
    return true;
  } catch (e) {
    console.warn('recoverPendingEvents failed:', e && e.message ? e.message : e);
    return false;
  }
}

// Return list of pending event IDs (those in pendingSends queue)
async function listPendingEvents() {
  return Array.from(pendingSends);
}

// List all event records from Kafka event-records topic, optionally filtered
async function listAllEventRecords(filter) {
  try {
    const records = await kafkaEventStore.loadAllEventRecords(kafka);
    if (!records || !Array.isArray(records)) return [];

    filter = filter || {};
    const modFilter = filter.module || null;
    const eventFilter = filter.event || null;

    return records.filter(rec => {
      if (!rec) return false;
      if (modFilter && rec.module !== modFilter) return false;
      if (eventFilter) {
        const ef = String(eventFilter);
        const matches = (rec.event && rec.event === ef) ||
                       (rec.canonicalEvent && rec.canonicalEvent === ef) ||
                       (rec.event && String(rec.event).indexOf(ef) !== -1) ||
                       (rec.canonicalEvent && String(rec.canonicalEvent).indexOf(ef) !== -1);
        if (!matches) return false;
      }
      return true;
    });
  } catch (e) {
    console.warn('listAllEventRecords failed:', e && e.message ? e.message : e);
    return [];
  }
}

// Delete a persisted event record by id (sends tombstones to Kafka)
async function deleteEventRecord(id) {
  if (!id) return false;
  try {
    // Delete from Kafka by sending tombstones (null values)
    const deleted = await kafkaEventStore.deleteEventRecord(producer, id);

    // Check if other records exist for this event and remove binding if none remain
    try {
      const records = await listAllEventRecords();
      const eventName = records.find(r => r && r.id === id)?.canonicalEvent ||
                        records.find(r => r && r.id === id)?.event;
      if (eventName) {
        const remaining = records.filter(r => r && (r.canonicalEvent === eventName || r.event === eventName));
        if (!remaining || remaining.length === 0) {
          try { eventRegistry.removeBinding(eventName); } catch (e) {}
        }
      }
    } catch (e) {}

    return deleted;
  } catch (e) { return false; }
}

// Delete persisted events matching module and/or event name. Returns number deleted.
async function deleteEventsByFilter(filter) {
  try {
    const records = await listAllEventRecords(filter);
    let removed = 0;

    for (const rec of records) {
      if (rec && rec.id) {
        const deleted = await kafkaEventStore.deleteEventRecord(producer, rec.id);
        if (deleted) removed++;
      }
    }

    // Sync registry removals
    if (filter && filter.event) {
      try { eventRegistry.removeBinding(filter.event); } catch (e) {}
    } else if (filter && filter.module) {
      try { eventRegistry.removeBindingsByModule(filter.module); } catch (e) {}
    }

    return removed;
  } catch (e) {
    console.warn('deleteEventsByFilter failed:', e && e.message ? e.message : e);
    return 0;
  }
}

// Clear module registry counts (in-memory only)
async function clearModuleRegistry(module) {
  if (!module) return false;
  try {
    delete registry[module];
    try { eventRegistry.removeBindingsByModule(module); } catch (e) {}
    return true;
  } catch (e) { return false; }
}

// List all DLQ (dead letter queue) events from Kafka
async function listDLQEvents() {
  try {
    // For now, return empty array since we're still implementing DLQ reading
    // In full implementation, this would query the event-dlq Kafka topic
    return [];
  } catch (e) {
    console.warn('listDLQEvents failed:', e && e.message ? e.message : e);
    return [];
  }
}

// Requeue a DLQ event back into pending queue
async function requeueDLQ(id) {
  if (!id) return false;
  try {
    // TODO: Implement DLQ requeuing via Kafka
    // For now, just enqueue the ID
    _enqueueSend(id);
    return true;
  } catch (e) { return false; }
}

async function publishEvent(obj, opts) {
  // New behavior: persist event first, update registry immediately for discovery,
  // enqueue for reliable Kafka delivery with retries and DLQ.
  // All events use standardized payload{} structure - no detail field.
  try {
    const evt = (typeof obj === 'string') ? JSON.parse(obj) : (obj || {});
    opts = opts || {};
    const headers = Object.keys(opts.headers||{}).reduce(function(acc,k){ acc[k.toLowerCase()] = opts.headers[k]; return acc; }, {});

    // prefer client-provided id when present (client canonical envelope)
    const id = evt.id || uuidv4();

    // derive canonical fields and enrich from headers when missing
    // allow clients (UI CRUD) to supply event name via header 'X-Event-Name'
    const canonicalEvent = (headers['x-event-name'] || headers['x-event'] || headers['event-name']) || evt.event || evt.name || evt.type || null;
    const moduleName = evt.domain || evt.module || (canonicalEvent ? String(canonicalEvent).split(':')[0] : 'unknown');
    const version = evt.version || 1;
    const ts = evt.ts || Date.now();
    const producer = evt.producer || { service: 'orchestrator-server', instance: (process.env.HOSTNAME || 'server') };

    // actor: prefer event.actor, then headers (X-User, X-User-Role, X-User-Group)
    const actorFromEvt = evt.actor || null;
    const actorFromHeaders = {
      user: headers['x-user'] || headers['x-username'] || headers['x-actor'] || null,
      role: headers['x-user-role'] || headers['x-role'] || null,
      group: headers['x-user-group'] || headers['x-group'] || null
    };
    // If the client marks the event as raw UI CRUD via header 'X-UI-CRUD', avoid enriching/overwriting payload actor info.
    let actor = null;
    if (headers['x-ui-crud']) {
      actor = actorFromEvt || null;
    } else {
      actor = actorFromEvt || (actorFromHeaders.user || actorFromHeaders.role || actorFromHeaders.group ? actorFromHeaders : null);
    }

    // Normalize payload: extract from event.payload, event.detail, or wrap entire event
    // Always use payload{} structure - no detail field
    let normalizedPayload = {};
    if (evt.payload !== undefined && typeof evt.payload === 'object') {
      normalizedPayload = evt.payload;
    } else if (evt.detail !== undefined && typeof evt.detail === 'object') {
      normalizedPayload = evt.detail;
    } else {
      // Wrap any remaining fields as payload (but exclude metadata)
      normalizedPayload = { ...evt };
      delete normalizedPayload.id;
      delete normalizedPayload.event;
      delete normalizedPayload.module;
      delete normalizedPayload.domain;
      delete normalizedPayload.version;
      delete normalizedPayload.ts;
      delete normalizedPayload.producer;
      delete normalizedPayload.actor;
      delete normalizedPayload.payload;
      delete normalizedPayload.detail;
    }

    const rec = {
      id,
      event: canonicalEvent || (moduleName + ':event'),
      module: moduleName,
      domain: evt.domain || moduleName,
      version: version,
      payload: normalizedPayload,
      ts: ts,
      producer: producer,
      actor: actor,
      status: 'pending',
      attempts: 0,

      // EVENT CLASSIFICATION - For dashboard segregation and workflow routing
      eventType: evt.eventType || 'record',       // 'record' or 'field' (orchestrator classification)
      eventClass: evt.eventClass || 'unknown',    // 'buttonEvent', 'fieldEvent', 'recordEvent' (original from billionerp)
      action: evt.action || 'event',              // Specific action: 'added', 'updated', 'deleted', 'batch-updated'
      level: evt.level || 'domain',               // 'domain' or 'technical' (field-level)

      // BRIDGE METADATA - For accuracy tracking
      source: evt.source || 'unknown',            // Where event came from: 'field-level-dispatcher'
      bridgeForwarded: evt._bridgeForwarded || false,  // Was it forwarded through index.php bridge?
      bridgeReceiveTime: evt._bridgeTimestamp || null, // Timestamp when bridge received it
      receivedTime: Date.now()                    // Timestamp when orchestrator received it
    };

    // Preserve modal/session and routing metadata if present on incoming envelope
    try {
      if (evt && evt.modalSessionId) {
        rec.modalSessionId = evt.modalSessionId;
      } else if (normalizedPayload && normalizedPayload.modalSessionId) {
        rec.modalSessionId = normalizedPayload.modalSessionId;
      }
      // If incoming provided a canonicalEvent override, ensure it's reflected
      if (evt && evt.event) {
        rec.event = evt.event;
      }
      if (evt && evt.module) rec.module = evt.module;
      if (evt && evt.domain) rec.domain = evt.domain;
    } catch (e) { /* ignore */ }

    // Tag technical field-level events and derive a canonical event name
    try {
      if (rec.event && typeof rec.event === 'string') {
        // match patterns like 'module:field:email:added' or 'module:field:phone:updated'
        const m = rec.event.match(/^([^:]+):field:([^:]+):([^:]+)$/);
        if (m) {
          // m[1]=module, m[2]=field, m[3]=action
          rec.level = 'technical';
          rec.field = m[2];
          rec.canonicalEvent = `${m[1]}:${m[2]}:${m[3]}`; // e.g. module:email:added
        } else {
          // default to domain level
          rec.level = rec.level || 'domain';
        }
      }
    } catch (e) { /* ignore enrichment failures */ }

    // persist durable event record to Kafka (best-effort, don't block on failure)
    try {
      const persisted = await kafkaEventStore.persistEventRecord(producer, id, rec);
      if (!persisted) {
        console.warn('Event not persisted to Kafka but continuing:', id);
      }
    } catch (e) {
      console.warn('Error during event persistence:', e && e.message ? e.message : e);
      // Continue regardless - persistence is best-effort
    }

    // Route to permanent billionerp topics based on event type (field or record)
    // These topics persist through cleanup operations
    try {
      const routed = await kafkaEventStore.routeToPermanentTopic(producer, id, rec);
      if (!routed) {
        console.warn('Event not routed to permanent topic but continuing:', id);
      }
    } catch (e) {
      console.warn('Error routing to permanent topic:', e && e.message ? e.message : e);
      // Continue regardless - routing is best-effort
    }

    // update registry and broadcast immediately for discovery using the persisted record (has id)
    try { _updateRegistryAndBroadcast(rec); } catch(e){}

    // enqueue for background delivery
    try { _enqueueSend(id); } catch (e) { console.warn('enqueueSend failed', e && e.message ? e.message : e); }

    return { ok: true, id };
  } catch (e) {
    console.error('publishEvent failed', e && e.stack ? e.stack : e);
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

// enqueue an event id for background send attempts
function _enqueueSend(id) {
  if (!id) return;
  if (pendingSends.has(id)) return;
  pendingSends.add(id);
  // process asynchronously
  setImmediate(() => _processSend(id));
}

async function _processSend(id) {
  if (!id) return;
  try {
    // Event is already persisted to Kafka event-records topic.
    // This just marks it as available for workflow processing.
    try {
      if (producer && producer.send) {
        // Signal that this event is ready for workflow dispatch
        await producer.send({ topic: TOPIC, messages: [{ key: id, value: JSON.stringify({ id, status: 'ready' }) }] });
        pendingSends.delete(id);
        return;
      }
    } catch (e) {
      console.warn('Failed to send event via producer:', e && e.message ? e.message : e);
      // Schedule retry with exponential backoff
      const attempts = (pendingSends.has(id) ? 1 : 0);
      const backoff = Math.min(300000, RETRY_BASE_MS * Math.pow(2, attempts));
      setTimeout(() => _processSend(id), backoff);
    }
  } catch (e) {
    console.warn('processSend error', e && e.message ? e.message : e);
    pendingSends.delete(id);
  }
}

function _updateRegistryAndBroadcast(evt) {
  try {
    if (!evt) return;

    // If record has an id and we've already processed it, skip to avoid double-counting
    try {
      if (evt.id && seenEventMap.has(evt.id)) return;
      if (evt.id) seenEventMap.set(evt.id, Date.now());
    } catch (e) {}

    // prefer canonicalEvent (normalized) when available, else fall back to raw event name
    const evName = evt.canonicalEvent || evt.event || evt.name || evt.type || (evt.listener || null) || JSON.stringify(evt).slice(0,100);
    const module = (evt.module || evt.domain || (typeof evName === 'string' && evName.split(':')[0]) || 'unknown');
    registry[module] = registry[module] || { events: {}, total: 0 };
    registry[module].events[evName] = (registry[module].events[evName] || 0) + 1;
    registry[module].total = Object.values(registry[module].events).reduce((s,v)=>s+v,0);

    // update registry in Kafka (best-effort, async, don't block)
    try {
      kafkaEventStore.updateRegistryEntry(producer, `module:${module}`, registry[module]).catch(()=>{});
    } catch(e) {}

    // Ensure modalSessionId is exposed at top-level for consumers if present anywhere in the envelope
    var promotedModalSession = null;
    try {
      promotedModalSession = evt && (evt.modalSessionId || (evt.payload && evt.payload.modalSessionId)) || null;
    } catch (e) { promotedModalSession = null; }

    // Standardized envelope: use payload{} only, no detail field
    // This is broadcast to live-dashboard.html via SSE for real-time display
    const broadcastEnvelope = {
      // Core identifiers
      ts: Date.now(),
      id: evt.id,
      module: module,
      event: evName,

      // EVENT CLASSIFICATION (for segregation in UI)
      eventType: evt.eventType || 'record',      // 'record' or 'field' → segregates RECORD EVENTS vs FIELD CHANGES
      eventClass: evt.eventClass || 'unknown',   // 'buttonEvent', 'fieldEvent', 'recordEvent' → for detail logging
      action: evt.action || 'event',             // Specific action: 'added', 'updated', 'deleted', 'batch-updated'
      level: evt.level || 'domain',              // 'domain' or 'technical' → for filtering

      // ACTOR & ROUTING
      actor: evt.actor || null,
      modalSessionId: promotedModalSession,

      // DATA
      payload: evt.payload || {},

      // METADATA (for dashboard stats & monitoring)
      source: evt.source || 'unknown',           // 'field-level-dispatcher', 'webhook', etc
      bridgeForwarded: evt.bridgeForwarded || false,
      processingTime: Date.now() - (evt.receivedTime || Date.now())  // How long to process in orchestrator
    };
    const payload = JSON.stringify(broadcastEnvelope);

    // broadcast to SSE clients
    for (const res of sseClients) {
      try {
        res.write(`data: ${payload}\n\n`);
      } catch (e) { /* ignore per-client errors */ }
    }
    // ingest into centralized event registry for schemas and bindings
    try { eventRegistry.ingestEvent(evt); } catch (e) {}
  } catch (e) { console.warn('updateRegistry failed', e && e.message ? e.message : e); }
}

function getRegistry() { return registry; }

function addSSEClient(res) {
  // `res` is the http response object for SSE
  sseClients.add(res);
}

function removeSSEClient(res) {
  sseClients.delete(res);
}

/**
 * clearAllEvents - Clear all in-memory event data (for testing/debugging)
 * Useful when you want to start fresh during integration testing
 */
async function clearAllEvents() {
  try {
    // Clear registry
    for (const key in registry) {
      delete registry[key];
    }
    // Clear seen events cache
    seenEventMap.clear();
    // Clear pending sends
    pendingSends.clear();

    console.log('[eventBus] Cleared all events and registries');
    return { ok: true, message: 'All events cleared' };
  } catch (e) {
    console.error('[eventBus] clearAllEvents error:', e);
    throw e;
  }
}

module.exports = {
  init,
  publishEvent,
  getRegistry,
  addSSEClient,
  removeSSEClient,
  listPendingEvents,
  listDLQEvents,
  requeueDLQ,
  listAllEventRecords,
  deleteEventRecord,
  deleteEventsByFilter,
  clearModuleRegistry,
  clearAllEvents
};
