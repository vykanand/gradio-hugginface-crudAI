# Kafka Event Persistence Migration Guide

## Overview

This document guides the migration from LevelDB file-based persistence to Kafka-native event persistence for the orchestration server. This makes the application cloud-ready for Railway, Vercel, Docker, Kubernetes, etc.

## Migration Strategy: Dual-Write Pattern

To ensure zero data loss and easy rollback, we use a **dual-write** approach:

1. **Phase 1** (Complete ✅): Initialize Kafka topics and admin functions
2. **Phase 2** (Dual-Write): Write all events to BOTH LevelDB and Kafka
3. **Phase 3** (Kafka-Read): Start reading from Kafka (keep LevelDB as fallback)
4. **Phase 4** (Kafka-Only): Remove LevelDB code after validation
5. **Phase 5** (Optimize): Use Kafka streams and compacted topic queries

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                 Orchestration Server                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Express API (no changes needed)                             │
│      ↓                                                       │
│  eventBus.js (publishEvent, _processSend, etc.)             │
│      ↓                                                       │
│  ┌─────────────────────────────────────────────────┐        │
│  │ DualWriter (Smart Persistence Layer)            │        │
│  ├─────────────────────────────────────────────────┤        │
│  │ • Writes to LevelDB (legacy)                    │        │
│  │ • Writes to Kafka topics (new)                  │        │
│  │ • Feature flag to switch backends               │        │
│  └─────────────────────────────────────────────────┘        │
│      ↙         ↙                                             │
│  LevelDB    Kafka                                            │
│  (Fallback) (Primary)                                        │
│                                                              │
│  Kafka Topics (Compacted):                                   │
│  • event-records: All events                                │
│  • event-dlq: Failed events                                 │
│  • event-registry: Module registry                          │
│  • event-processing-state: Dedup tracking                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Implementation: DualWriter Wrapper

Create a wrapper object that handles both backends transparently:

```javascript
// services/persistenceLayer.js

class DualWriter {
  constructor(kafkaProducer, leveldb) {
    this.kafka = kafkaProducer;
    this.leveldb = leveldb;
    this.kafkaEnabled = process.env.KAFKA_PERSISTENCE_ENABLED !== 'false';
    this.leveldbEnabled = process.env.LEVELDB_PERSISTENCE_ENABLED !== 'false';
  }

  async put(key, value) {
    const errors = [];

    if (this.leveldbEnabled && this.leveldb) {
      try {
        await this.leveldb.put(key, value);
      } catch (e) {
        errors.push(`LevelDB: ${e.message}`);
      }
    }

    if (this.kafkaEnabled) {
      try {
        const [namespace, id] = key.split(':');
        const topic = this._getTopic(namespace);
        if (topic) {
          await kafkaEventStore.persistEventRecord(this.kafka, id, value);
        }
      } catch (e) {
        errors.push(`Kafka: ${e.message}`);
        // Don't fail if Kafka write fails - fallback to LevelDB
      }
    }

    if (errors.length > 0) {
      console.warn('[persistenceLayer] Partial write failed:', errors);
    }

    return true;
  }

  async get(key) {
    // Try Kafka first (if enabled), fall back to LevelDB
    if (this.kafkaEnabled) {
      try {
        const [namespace, id] = key.split(':');
        if (namespace === 'evt') {
          const record = await kafkaEventStore.getEventRecord(null, id);
          if (record) return record;
        }
      } catch (e) {
        console.warn('[persistenceLayer] Kafka read failed, falling back:', e.message);
      }
    }

    if (this.leveldbEnabled && this.leveldb) {
      return await this.leveldb.get(key);
    }

    throw new Error('not_found');
  }

  async del(key) {
    const errors = [];

    if (this.leveldbEnabled && this.leveldb) {
      try {
        await this.leveldb.del(key);
      } catch (e) {
        errors.push(`LevelDB: ${e.message}`);
      }
    }

    if (this.kafkaEnabled) {
      try {
        const [namespace, id] = key.split(':');
        if (namespace === 'evt' || namespace === 'dlq') {
          await kafkaEventStore.deleteEventRecord(this.kafka, id);
        }
      } catch (e) {
        console.warn('[persistenceLayer] Kafka delete warning:', e.message);
      }
    }

    return true;
  }

  createReadStream() {
    // Switch to Kafka stream if enabled
    if (this.kafkaEnabled) {
      return this._createKafkaStream();
    }
    return this.leveldb.createReadStream();
  }

  _getTopic(namespace) {
    const topicMap = {
      'evt': kafkaAdmin.TOPICS.EVENT_RECORDS,
      'dlq': kafkaAdmin.TOPICS.EVENT_DLQ,
      'binding': kafkaAdmin.TOPICS.EVENT_REGISTRY
    };
    return topicMap[namespace];
  }

  _createKafkaStream() {
    // Returns a stream-like object compatible with existing code
    return {
      on: (event, handler) => {
        if (event === 'data') {
          // Load from Kafka topic and emit data events
          kafkaEventStore.loadAllEventRecords(consumer).then(records => {
            records.forEach(r => handler({ key: `evt:${r.id}`, value: r }));
            handler(null);  // End signal
          });
        }
        return this;
      }
    };
  }
}

module.exports = DualWriter;
```

## Environment Variables (New)

```bash
# Kafka Persistence Control
KAFKA_PERSISTENCE_ENABLED=true          # Enable Kafka writes
LEVELDB_PERSISTENCE_ENABLED=true        # Keep LevelDB as fallback (gradual migration)

# Topics
EVENT_RECORDS_TOPIC=event-records
EVENT_DLQ_TOPIC=event-dlq
EVENT_REGISTRY_TOPIC=event-registry
EVENT_STATE_TOPIC=event-processing-state

# Fetch limits
EVENT_RECORDS_FETCH_LIMIT=10000
```

## Migration Phases (Detailed)

### Phase 2: Dual-Write Implementation

**Steps:**
1. Replace `db` with `DualWriter` instance in eventBus.js
2. All `db.put()` → `dualWriter.put()`
3. All `db.get()` → `dualWriter.get()`
4. All `db.del()` → `dualWriter.del()`
5. All `db.createReadStream()` → `dualWriter.createReadStream()`
6. Monitor logs for errors in either backend

**Configuration:**
```bash
# Start with: both enabled (dual-write)
KAFKA_PERSISTENCE_ENABLED=true
LEVELDB_PERSISTENCE_ENABLED=true
```

**Code Change:**
```javascript
// In eventBus.js init():
const DualWriter = require('./persistenceLayer');
let db = new DualWriter(producer, leveldbInstance);
```

### Phase 3: Switch to Kafka Reads

**Steps:**
1. Verify Kafka topics have all events (compare counts)
2. Set environment variable to read from Kafka first
3. Monitor for missing events (fallback to LevelDB)
4. Keep dual-write enabled for a week

**Configuration:**
```bash
# Verify Kafka first, fallback to LevelDB
KAFKA_PERSISTENCE_ENABLED=true
LEVELDB_PERSISTENCE_ENABLED=true
KAFKA_PRIMARY_READ=true  # New flag
```

### Phase 4: Disable LevelDB Writes

**Steps:**
1. After 2 weeks of Kafka-primary reads with no issues
2. Disable LevelDB writes (keep reads as fallback)
3. Monitor for any anomalies
4. Run on Kafka-only for another week

**Configuration:**
```bash
KAFKA_PERSISTENCE_ENABLED=true
LEVELDB_PERSISTENCE_ENABLED=true  # Only reads
KAFKA_PRIMARY_READ=true
KAFKA_ONLY_WRITES=true  # Don't write to LevelDB
```

### Phase 5: Remove LevelDB Entirely

**Steps:**
1. Remove all `level` npm dependency code
2. Remove `_connectDB()` function
3. Remove InMemoryDB class
4. Remove storage directory initialization
5. Deploy to cloud (no persistent volumes needed)

**Configuration:**
```bash
KAFKA_PERSISTENCE_ENABLED=true
LEVELDB_PERSISTENCE_ENABLED=false
KAFKA_PRIMARY_READ=true
```

## Validation Checklist

### Before Each Phase

- [ ] No events lost in Kafka (compare counts with old system)
- [ ] Event records queryable via `/api/event-records`
- [ ] DLQ items visible via `/api/events/dlq`
- [ ] Registry updated in `/api/event-registry`
- [ ] Server restart recovery works
- [ ] No increase in CPU/memory usage
- [ ] No increase in p99 latency

### After Each Phase

- [ ] All endpoints returning expected data
- [ ] No errors in logs related to persistence
- [ ] Consumer lag healthy (< 10 messages behind)
- [ ] Kafka topic sizes stable

## Quick Start: Enable Dual-Write Now

```bash
# Update eventBus.js (at line 11):
const persistenceLayer = require('./persistenceLayer');

# Update init() (at line ~188):
let db = new persistenceLayer.DualWriter(producer, db);

# Add env vars:
export KAFKA_PERSISTENCE_ENABLED=true
export LEVELDB_PERSISTENCE_ENABLED=true

# Restart server
```

This enables Kafka writes immediately while keeping LevelDB as fallback, giving you 4 weeks to safely migrate.

## Monitoring

Add these metrics:

```javascript
// Monitor persistence layer health
app.get('/api/admin/persistence-health', (req, res) => {
  res.json({
    kafka: {
      enabled: process.env.KAFKA_PERSISTENCE_ENABLED === 'true',
      connected: producer.isConnected(),
      topicsReady: kafkaAdmin.getAdmin() !== null
    },
    leveldb: {
      enabled: process.env.LEVELDB_PERSISTENCE_ENABLED === 'true',
      connected: db !== null
    },
    eventRecords: recordCountFromKafka,
    dlqItems: dlqCountFromKafka,
    consumerLag: consumerGroupLag
  });
});
```

## Troubleshooting

### "Event not found after Kafka write"
- [ ] Check Kafka topic exists: `kafka-topics.sh --list`
- [ ] Check compaction enabled: `cleanup.policy=compact`
- [ ] Check record was actually produced: `kafka-console-consumer.sh`

### "Inconsistent counts between Kafka and LevelDB"
- [ ] This is expected during dual-write migration
- [ ] Kafka becomes source of truth
- [ ] Use `GET /api/admin/persistence-health` to verify

### "Kafka write failures in logs"
- [ ] Keep LevelDB enabled as fallback
- [ ] Don't disable LevelDB until Kafka is stable for 2 weeks
- [ ] Check Kafka broker health and replication

## Rollback Plan

If major issues discovered:

```bash
# Immediately revert to LevelDB-only:
KAFKA_PERSISTENCE_ENABLED=false
LEVELDB_PERSISTENCE_ENABLED=true

# Or switch to Kafka-read-only (no new writes):
KAFKA_PERSISTENCE_ENABLED=false
LEVELDB_PERSISTENCE_ENABLED=true
KAFKA_ONLY_WRITES=false
```

## Cloud Deployment Benefits

Once Kafka-only (Phase 5):

```bash
# Docker: No volumes needed
docker run -e KAFKA_BROKERS=kafka:9092 orchestration-server

# Railway: Automatic redeployment without data loss
# All state in Kafka, no persistent storage needed

# Kubernetes: Stateless pods
kubectl scale deployment/orchestration --replicas=3

# Vercel Functions: Query Kafka for state, no local files
```

## Timeline

- **Week 1**: Dual-write (Phase 2)
- **Week 2-3**: Monitor and validate
- **Week 4**: Kafka-primary reads (Phase 3)
- **Week 5-6**: Monitor and validate
- **Week 7**: Disable LevelDB writes (Phase 4)
- **Week 8**: Remove LevelDB entirely (Phase 5)
- **Week 9**: Deploy to cloud without persistent volumes

## Files Modified

1. `services/kafkaAdmin.js` - NEW (topic management)
2. `services/kafkaEventStore.js` - NEW (persistence operations)
3. `services/persistenceLayer.js` - NEW (dual-write wrapper)
4. `services/eventBus.js` - Modified (use persistenceLayer)
5. `server.js` - Minor (topic verification on startup)

## Next Steps

1. Review and approve this migration strategy
2. Implement `persistenceLayer.js`
3. Update eventBus.js to use DualWriter
4. Test locally with dual-write enabled
5. Deploy to staging environment
6. Monitor for 2 weeks before proceeding to Phase 3
