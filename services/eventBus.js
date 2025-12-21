const { Kafka } = require('kafkajs');
const level = require('level');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const kafkaBrokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const kafka = new Kafka({ clientId: 'orchestrator-server', brokers: kafkaBrokers });
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID || 'orchestrator-group' });

const TOPIC = process.env.ORCH_EVENTS_TOPIC || 'orchestrator-events';
const DB_PATH = process.env.EVENT_DB_PATH || path.join(__dirname, '..', 'storage', 'event_registry_db');

// In-memory registry: module -> { events: { name: count }, total: number }
const registry = {};
const sseClients = new Set();

// Track recently seen event ids to avoid double-counting when we both
// update registry on publish AND receive the same record via Kafka consumer.
const seenEventMap = new Map(); // id -> timestamp
const SEEN_TTL_MS = 24 * 60 * 60 * 1000; // keep seen ids for 24 hours
setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of seenEventMap) {
    if (now - ts > SEEN_TTL_MS) seenEventMap.delete(id);
  }
}, 60 * 60 * 1000);

// Pending send queue (in-memory indexes into DB). Keeps track of event ids
const pendingSends = new Set();

const MAX_SEND_ATTEMPTS = parseInt(process.env.EVENT_MAX_SEND_ATTEMPTS || '6', 10);
const RETRY_BASE_MS = parseInt(process.env.EVENT_RETRY_BASE_MS || '1000', 10); // exponential backoff base

let db = null;

async function _connectDB() {
  try {
    db = level(DB_PATH, { valueEncoding: 'json' });
    // load existing keys into registry
    return new Promise((resolve) => {
      const stream = db.createReadStream();
      stream.on('data', ({ key, value }) => {
        try {
          if (!key || typeof key !== 'string') return;
          // skip persisted event records and DLQ entries
          if (key.indexOf('evt:') === 0 || key.indexOf('dlq:') === 0) return;
          // only load module registry entries (value should be an object with events or total)
          if (value && typeof value === 'object' && (value.events || value.total !== undefined)) {
            registry[key] = value;
          }
        } catch (e) {}
      });
      stream.on('error', (e) => { console.warn('level read error', e && e.message ? e.message : e); resolve(false); });
      stream.on('end', () => resolve(true));
    });
  } catch (e) {
    console.warn('level open failed', e && e.message ? e.message : e);
    db = null;
    return false;
  }
}

async function _persistModule(mod) {
  try {
    if (!db) return false;
    await db.put(mod, registry[mod] || {});
    return true;
  } catch (e) {
    console.warn('persistModule failed', e && e.message ? e.message : e);
    return false;
  }
}

async function init() {
  try {
    await producer.connect();
  } catch (e) { console.warn('Kafka producer connect failed', e && e.message ? e.message : e); }
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
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

  // try connect local level DB (best-effort)
  try { await _connectDB(); } catch (e) { /* ignore */ }

  // recover any pending events from DB so delivery resumes after restart
  try { await recoverPendingEvents(); } catch (e) { console.warn('recoverPendingEvents failed', e && e.message ? e.message : e); }
}

// scan DB for evt: keys and enqueue pending/retrying events
async function recoverPendingEvents() {
  if (!db) return;
  return new Promise((resolve) => {
    const stream = db.createReadStream();
    stream.on('data', async ({ key, value }) => {
      try {
        if (!key || typeof key !== 'string') return;
        if (key.indexOf('evt:') === 0) {
          const id = key.slice(4);
          const rec = value;
          if (rec && rec.status && rec.status !== 'published') {
            // re-enqueue for send
            _enqueueSend(id);
          }
        }
      } catch (e) {}
    });
    stream.on('error', (e) => { resolve(false); });
    stream.on('end', () => resolve(true));
  });
}

// Return arrays of pending events (non-published) and DLQ events
async function listPendingEvents() {
  const out = [];
  if (!db) return out;
  return new Promise((resolve) => {
    const stream = db.createReadStream();
    stream.on('data', ({ key, value }) => {
      try {
        if (key && key.indexOf('evt:') === 0) {
          const id = key.slice(4);
          const rec = value;
          if (rec && rec.status !== 'published') {
            out.push(rec);
          }
        }
      } catch (e) {}
    });
    stream.on('error', () => resolve(out));
    stream.on('end', () => resolve(out));
  });
}

// list all persisted evt: records (optionally filter by module/event)
async function listAllEventRecords(filter) {
  const out = [];
  if (!db) return out;
  filter = filter || {};
  const modFilter = filter.module || null;
  const eventFilter = filter.event || null;
  return new Promise((resolve) => {
    const stream = db.createReadStream();
    stream.on('data', ({ key, value }) => {
      try {
        if (key && key.indexOf('evt:') === 0) {
          const rec = value;
          if (modFilter && rec.module !== modFilter) return;
          if (eventFilter) {
            // tolerant matching: match stored event OR canonicalEvent, or substring match
            const ef = String(eventFilter);
            const matches = (rec.event && rec.event === ef) || (rec.canonicalEvent && rec.canonicalEvent === ef) || (rec.event && String(rec.event).indexOf(ef) !== -1) || (rec.canonicalEvent && String(rec.canonicalEvent).indexOf(ef) !== -1);
            if (!matches) return;
          }
          out.push(rec);
        }
      } catch (e) {}
    });
    stream.on('error', () => resolve(out));
    stream.on('end', () => resolve(out));
  });
}

// delete a persisted event record by id (evt:<id> and dlq:<id>)
async function deleteEventRecord(id) {
  if (!db || !id) return false;
  try {
    await db.del('evt:' + id).catch(() => {});
    await db.del('dlq:' + id).catch(() => {});
    return true;
  } catch (e) { return false; }
}

// delete persisted events matching module and/or event name. Returns number deleted.
async function deleteEventsByFilter(filter) {
  if (!db) return 0;
  filter = filter || {};
  const modFilter = filter.module || null;
  const eventFilter = filter.event || null;
  let removed = 0;
  return new Promise((resolve) => {
    const ops = [];
    const stream = db.createReadStream();
    stream.on('data', ({ key, value }) => {
      try {
        if (key && key.indexOf('evt:') === 0) {
          const rec = value;
          if (modFilter && rec.module !== modFilter) return;
          if (eventFilter && rec.event !== eventFilter) return;
          ops.push({ type: 'del', key });
          // also attempt to delete associated dlq key
          if (rec.id) ops.push({ type: 'del', key: 'dlq:' + rec.id });
          removed++;
        }
      } catch (e) {}
    });
    stream.on('error', async () => {
      if (ops.length) await db.batch(ops).catch(()=>{});
      resolve(removed);
    });
    stream.on('end', async () => {
      if (ops.length) await db.batch(ops).catch(()=>{});
      resolve(removed);
    });
  });
}

// clear module registry counts (in-memory + persisted module key)
async function clearModuleRegistry(module) {
  if (!module) return false;
  try {
    delete registry[module];
    if (db) await db.del(module).catch(()=>{});
    return true;
  } catch (e) { return false; }
}

async function listDLQEvents() {
  const out = [];
  if (!db) return out;
  return new Promise((resolve) => {
    const stream = db.createReadStream();
    stream.on('data', ({ key, value }) => {
      try {
        if (key && key.indexOf('dlq:') === 0) {
          out.push(value);
        }
      } catch (e) {}
    });
    stream.on('error', () => resolve(out));
    stream.on('end', () => resolve(out));
  });
}

// requeue a DLQ event back into pending queue
async function requeueDLQ(id) {
  if (!db || !id) return false;
  try {
    const dlqKey = 'dlq:' + id;
    const rec = await db.get(dlqKey).catch(() => null);
    if (!rec) return false;
    // reset attempts/status and move back to evt:<id>
    rec.attempts = 0; rec.status = 'pending'; rec.lastError = null;
    await db.put('evt:' + id, rec).catch(()=>{});
    await db.del(dlqKey).catch(()=>{});
    _enqueueSend(id);
    return true;
  } catch (e) { return false; }
}

async function publishEvent(obj, opts) {
  // New behavior: persist event first, update registry immediately for discovery,
  // enqueue for reliable Kafka delivery with retries and DLQ.
  try {
    const evt = (typeof obj === 'string') ? JSON.parse(obj) : (obj || {});
    opts = opts || {};
    const headers = opts.headers || {};

    // prefer client-provided id when present (client canonical envelope)
    const id = evt.id || uuidv4();

    // derive canonical fields and enrich from headers when missing
    const canonicalEvent = evt.event || evt.name || evt.type || null;
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
    const actor = actorFromEvt || (actorFromHeaders.user || actorFromHeaders.role || actorFromHeaders.group ? actorFromHeaders : null);

    const rec = {
      id,
      event: canonicalEvent || (moduleName + ':event'),
      module: moduleName,
      domain: evt.domain || moduleName,
      version: version,
      detail: evt.detail || evt || {},
      ts: ts,
      producer: producer,
      actor: actor,
      status: 'pending',
      attempts: 0
    };

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

    // persist durable event record
    try {
      if (db) await db.put('evt:' + id, rec);
    } catch (e) {
      console.error('Failed to persist event to DB', e && e.message ? e.message : e);
      // If persistence fails, still update registry and broadcast (best-effort),
      // but return failure so caller can know.
      try { _updateRegistryAndBroadcast(rec); } catch(e2){}
      return { ok: false, error: 'persist_failed' };
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
  if (!db) { pendingSends.delete(id); return; }
  try {
    const key = 'evt:' + id;
    const rec = await db.get(key).catch(() => null);
    if (!rec) { pendingSends.delete(id); return; }
    if (rec.status === 'published') { pendingSends.delete(id); return; }

    // attempt send
    try {
      if (producer && producer.send) {
        await producer.send({ topic: TOPIC, messages: [{ key: rec.module, value: JSON.stringify(rec) }] });
      } else {
        throw new Error('producer-not-available');
      }

      // mark published
      rec.status = 'published';
      rec.publishedTs = Date.now();
      await db.put(key, rec).catch(()=>{});
      pendingSends.delete(id);
      return;
    } catch (e) {
      rec.attempts = (rec.attempts || 0) + 1;
      rec.lastError = (e && e.message) ? e.message : String(e);
      // update record
      try { await db.put(key, rec).catch(()=>{}); } catch(e2){}
      if ((rec.attempts || 0) >= MAX_SEND_ATTEMPTS) {
        // move to DLQ
        try { await db.put('dlq:' + id, rec).catch(()=>{}); } catch(e3){}
        try { await db.del(key).catch(()=>{}); } catch(e4){}
        pendingSends.delete(id);
        console.error('Event moved to DLQ', id, rec.lastError);
        // broadcast failure notice to SSE clients
        const payload = JSON.stringify({ ts: Date.now(), module: rec.module, event: rec.event, id, status: 'failed', detail: rec });
        for (const res of sseClients) {
          try { res.write(`data: ${payload}\n\n`); } catch(e5){}
        }
        return;
      }

      // schedule retry with exponential backoff
      const backoff = Math.min(300000, RETRY_BASE_MS * Math.pow(2, rec.attempts));
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

    // persist module counts to local DB (best-effort)
    try { _persistModule(module).catch(()=>{}); } catch(e){}

    const payload = JSON.stringify({ ts: Date.now(), module, event: evName, level: evt.level || 'domain', detail: evt });
    // broadcast to SSE clients
    for (const res of sseClients) {
      try {
        res.write(`data: ${payload}\n\n`);
      } catch (e) { /* ignore per-client errors */ }
    }
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
  clearModuleRegistry
};
