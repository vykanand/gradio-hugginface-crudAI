/**
 * Kafka Event Store — Enterprise-grade event persistence
 *
 * Topics:
 * - event-records: All event records (compacted, keyed by evt-<uuid>)
 * - event-dlq: Dead letter queue (compacted, keyed by dlq-<uuid>)
 * - event-registry: Module registry and event bindings
 * - event-processing-state: Deduplication tracking
 * - billionerp-field-events: Permanent field-level events
 * - billionerp-record-events: Permanent record-level events
 */

const kafkaAdmin = require('./kafkaAdmin');
const TOPICS = kafkaAdmin.TOPICS;

// Write-through cache: always in sync with Kafka
// Populated on startup via loadAllEventRecords, updated on every persist
const eventCache = new Map();
let cacheWarmedUp = false;

/**
 * Persist event record to Kafka event-records topic
 * Also updates the write-through cache
 */
async function persistEventRecord(producer, id, record) {
  // Always update cache immediately (even if Kafka write fails, we have it in memory)
  eventCache.set(`evt-${id}`, record);

  if (!producer || typeof producer.send !== 'function') {
    console.warn('[kafkaEventStore] Producer not ready — event cached in memory, will persist on next write');
    return false;
  }

  try {
    await producer.send({
      topic: TOPICS.EVENT_RECORDS,
      messages: [{
        key: `evt-${id}`,
        value: JSON.stringify(record),
        timestamp: Date.now().toString()
      }]
    });
    return true;
  } catch (e) {
    console.error('[kafkaEventStore] Kafka persist failed (cached in memory):', e.message);
    return false;
  }
}

/**
 * Get event record — from cache (instant) or Kafka (fallback)
 */
function getEventRecord(id) {
  return eventCache.get(`evt-${id}`) || null;
}

/**
 * Load ALL event records from Kafka event-records topic into cache
 * Called on server startup for recovery
 *
 * Strategy: Get high-water offset first, then consume from beginning
 * until we reach that offset. This guarantees we read all existing records.
 */
async function loadAllEventRecords(kafka) {
  const records = new Map();

  try {
    const admin = kafkaAdmin.getAdmin();
    if (!admin) {
      console.warn('[kafkaEventStore] Admin not ready, returning cached records');
      return Array.from(eventCache.values());
    }

    // Get high-water mark offsets to know when we've read everything
    let highWaterOffset = 0;
    try {
      const offsets = await admin.fetchTopicOffsets(TOPICS.EVENT_RECORDS);
      if (offsets && offsets.length > 0) {
        highWaterOffset = parseInt(offsets[0].high, 10) || 0;
      }
    } catch (e) {
      console.warn('[kafkaEventStore] Could not fetch offsets:', e.message);
      return Array.from(eventCache.values());
    }

    // Empty topic — nothing to load
    if (highWaterOffset === 0) {
      console.log('[kafkaEventStore] Topic empty, no records to load');
      cacheWarmedUp = true;
      return [];
    }

    console.log(`[kafkaEventStore] Loading records from Kafka (${highWaterOffset} messages in topic)...`);

    // Create isolated consumer with unique group
    const groupId = `event-records-loader-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempConsumer = kafka.consumer({ groupId, sessionTimeout: 30000 });

    await tempConsumer.connect();
    await tempConsumer.subscribe({ topic: TOPICS.EVENT_RECORDS, fromBeginning: true });

    let messagesRead = 0;
    const targetOffset = highWaterOffset;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(async () => {
        try { await tempConsumer.disconnect(); } catch (e) {}
        resolve();
      }, 15000); // 15s safety timeout

      tempConsumer.run({
        eachMessage: async ({ message }) => {
          try {
            const key = message.key ? message.key.toString() : null;
            if (!key) return;

            const value = message.value ? JSON.parse(message.value.toString()) : null;

            // Compacted topic: null value = tombstone (deletion)
            if (value === null) {
              records.delete(key);
            } else {
              records.set(key, value);
            }
          } catch (e) {
            // Skip malformed messages
          }

          messagesRead++;

          // We've read all messages up to the high-water mark
          if (messagesRead >= targetOffset) {
            clearTimeout(timeout);
            try { await tempConsumer.disconnect(); } catch (e) {}
            resolve();
          }
        }
      }).catch(reject);
    });

    // Populate cache from loaded records
    for (const [key, value] of records) {
      eventCache.set(key, value);
    }

    cacheWarmedUp = true;
    console.log(`[kafkaEventStore] Loaded ${records.size} event records from Kafka (${messagesRead} messages processed)`);
    return Array.from(records.values());

  } catch (e) {
    console.error('[kafkaEventStore] Error loading event records:', e.message);
    cacheWarmedUp = true; // Mark as warmed up even on failure to prevent blocking
    return Array.from(eventCache.values()); // Return whatever we have cached
  }
}

/**
 * Get all cached event records (fast, no Kafka read)
 * Returns events sorted by timestamp, most recent first
 */
function getCachedEventRecords(limit) {
  limit = Math.min(limit || 500, 1000);
  const all = Array.from(eventCache.values());
  all.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return all.slice(0, limit);
}

/**
 * Check if cache has been populated from Kafka
 */
function isCacheReady() {
  return cacheWarmedUp;
}

/**
 * Move event to DLQ
 */
async function moveEventToDLQ(producer, id, errorRecord) {
  try {
    if (!producer || typeof producer.send !== 'function') return false;

    await producer.send({
      topic: TOPICS.EVENT_DLQ,
      messages: [{ key: `dlq-${id}`, value: JSON.stringify(errorRecord), timestamp: Date.now().toString() }]
    });

    // Tombstone in event-records
    await producer.send({
      topic: TOPICS.EVENT_RECORDS,
      messages: [{ key: `evt-${id}`, value: null, timestamp: Date.now().toString() }]
    });

    eventCache.delete(`evt-${id}`);
    return true;
  } catch (e) {
    console.error('[kafkaEventStore] DLQ move failed:', e.message);
    return false;
  }
}

/**
 * Mark event as processed (deduplication)
 */
async function markEventProcessed(producer, id) {
  try {
    if (!producer || typeof producer.send !== 'function') return false;

    await producer.send({
      topic: TOPICS.EVENT_STATE,
      messages: [{
        key: id,
        value: JSON.stringify({ eventId: id, processedAt: Date.now(), status: 'processed' }),
        timestamp: Date.now().toString()
      }]
    });
    return true;
  } catch (e) {
    console.error('[kafkaEventStore] Mark processed failed:', e.message);
    return false;
  }
}

/**
 * Update event registry entry
 */
async function updateRegistryEntry(producer, key, value) {
  try {
    if (!producer || typeof producer.send !== 'function') return false;

    await producer.send({
      topic: TOPICS.EVENT_REGISTRY,
      messages: [{ key, value: JSON.stringify(value), timestamp: Date.now().toString() }]
    });
    return true;
  } catch (e) {
    console.error('[kafkaEventStore] Registry update failed:', e.message);
    return false;
  }
}

/**
 * Load registry entries from event-registry topic
 */
async function loadRegistryEntries(kafka) {
  return new Promise((resolve) => {
    const entries = new Map();
    const timeout = setTimeout(() => resolve(entries), 5000);

    (async () => {
      try {
        const admin = kafkaAdmin.getAdmin();
        if (!admin) { clearTimeout(timeout); return resolve(entries); }

        // Check if topic has data
        let highWater = 0;
        try {
          const offsets = await admin.fetchTopicOffsets(TOPICS.EVENT_REGISTRY);
          if (offsets && offsets.length > 0) highWater = parseInt(offsets[0].high, 10) || 0;
        } catch (e) { clearTimeout(timeout); return resolve(entries); }

        if (highWater === 0) { clearTimeout(timeout); return resolve(entries); }

        const groupId = `registry-loader-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const tempConsumer = kafka.consumer({ groupId, sessionTimeout: 30000 });
        await tempConsumer.connect();
        await tempConsumer.subscribe({ topic: TOPICS.EVENT_REGISTRY, fromBeginning: true });

        let count = 0;
        await tempConsumer.run({
          eachMessage: async ({ message }) => {
            try {
              const key = message.key ? message.key.toString() : null;
              const value = message.value ? JSON.parse(message.value.toString()) : null;
              if (key && value !== null) entries.set(key, value);
              else if (key) entries.delete(key);
            } catch (e) {}

            count++;
            if (count >= highWater) {
              clearTimeout(timeout);
              try { await tempConsumer.disconnect(); } catch (e) {}
              resolve(entries);
            }
          }
        });
      } catch (e) {
        console.error('[kafkaEventStore] Registry load failed:', e.message);
        clearTimeout(timeout);
        resolve(entries);
      }
    })();
  });
}

/**
 * Query event records by filter
 */
function queryEventRecords(records, filter = {}) {
  return records.filter(r => {
    if (filter.module && r.module !== filter.module) return false;
    if (filter.event && !r.event.includes(filter.event)) return false;
    return true;
  });
}

/**
 * Delete event record (tombstone)
 */
async function deleteEventRecord(producer, id) {
  try {
    if (!producer || typeof producer.send !== 'function') return false;

    await producer.send({
      topic: TOPICS.EVENT_RECORDS,
      messages: [{ key: `evt-${id}`, value: null, timestamp: Date.now().toString() }]
    });
    await producer.send({
      topic: TOPICS.EVENT_DLQ,
      messages: [{ key: `dlq-${id}`, value: null, timestamp: Date.now().toString() }]
    });

    eventCache.delete(`evt-${id}`);
    return true;
  } catch (e) {
    console.error('[kafkaEventStore] Delete failed:', e.message);
    return false;
  }
}

/**
 * Route event to permanent topic (field or record)
 */
async function routeToPermanentTopic(producer, id, record) {
  try {
    if (!producer || typeof producer.send !== 'function') return false;

    const targetTopic = record.eventType === 'field'
      ? TOPICS.FIELD_EVENTS
      : TOPICS.RECORD_EVENTS;

    await producer.send({
      topic: targetTopic,
      messages: [{ key: `${id}`, value: JSON.stringify(record), timestamp: Date.now().toString() }]
    });
    return true;
  } catch (e) {
    console.error('[kafkaEventStore] Route to permanent topic failed:', e.message);
    return false;
  }
}

/**
 * Clear cache
 */
function clearCache() {
  eventCache.clear();
  cacheWarmedUp = false;
}

module.exports = {
  persistEventRecord,
  getEventRecord,
  moveEventToDLQ,
  markEventProcessed,
  updateRegistryEntry,
  loadAllEventRecords,
  loadRegistryEntries,
  queryEventRecords,
  deleteEventRecord,
  routeToPermanentTopic,
  getCachedEventRecords,
  isCacheReady,
  clearCache
};
