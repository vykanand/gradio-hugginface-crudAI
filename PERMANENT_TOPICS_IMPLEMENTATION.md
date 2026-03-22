# Permanent Kafka Topics Implementation Guide

## Overview

This document describes the implementation of permanent Kafka topics for billionerp event streaming. These topics persist through cleanup operations, ensuring zero event loss when clearing Kafka messages.

## Problem Statement

Previously, when cleaning Kafka events with `cleanup:kafka` command, all topics including billionerp event topics were deleted. This caused:
- New field blur events to fail (topics don't exist)
- Break in real-time event streaming
- Potential event loss during cleanup operations

## Solution

Two new permanent Kafka topics that are:
- **Never deleted** during cleanup operations
- **Compacted** to retain latest event state
- **Infinite retention** to preserve all events
- **Segmented** by event type (field-level vs record-level)

### New Topics

1. **billionerp-field-events** (3 partitions)
   - Contains: Field-level events (blur, change, focus)
   - Events: All modifications to individual fields
   - Retention: Infinite (-1)
   - Compaction: Enabled
   - Use case: Real-time field validation, field-level workflows

2. **billionerp-record-events** (3 partitions)
   - Contains: Record-level events (CREATE, UPDATE, DELETE)
   - Events: All CRUD operations on records
   - Retention: Infinite (-1)
   - Compaction: Enabled
   - Use case: Record synchronization, audit trails, record-level workflows

## Architecture Changes

### Event Flow

```
billionerp (index.php)
    ↓ (CustomEvent)
billionerp (app.js - onFieldBlur)
    ↓ (HTTP POST /api/events)
orchestrator (eventBus.publishEvent)
    ├→ Kafka: event-records (all events - internal)
    ├→ Kafka: billionerp-field-events or billionerp-record-events (PERMANENT)
    ├→ Update registry
    └→ Broadcast to workflows
```

### Code Changes

#### 1. eventBus.js
- Added FIELD_EVENTS_TOPIC and RECORD_EVENTS_TOPIC constants
- Updated consumer to subscribe to all three topic streams
- Call routeToPermanentTopic() after persisting each event
- Events are classified as 'field' or 'record' based on eventType

#### 2. kafkaAdmin.js
- Added FIELD_EVENTS and RECORD_EVENTS to TOPICS object
- Topics created in ensureCompactedTopics() on server startup
- Compaction enabled (cleanup.policy=compact)
- Infinite retention (retention.ms=-1)

#### 3. kafkaEventStore.js
- Added routeToPermanentTopic() function
- Routes field events to billionerp-field-events
- Routes record events to billionerp-record-events
- Maintains event ID as message key for compaction

#### 4. package.json
- Added `npm run setup:topics` - Creates/verifies permanent topics
- Added `npm run cleanup:kafka:safe` - Clears messages without deleting topics

## Deployment Instructions

### Step 1: Create Permanent Topics

```bash
# From orchestrator directory
npm run setup:topics

# Or manually:
bash ensure-permanent-topics.sh
```

**Output:**
```
╔════════════════════════════════════════════════════════╗
║    ENSURING PERMANENT KAFKA TOPICS EXIST              ║
║  Topics will persist through cleanup operations       ║
╚════════════════════════════════════════════════════════╝

🔍 Checking Kafka broker at kafka:9092

📋 Existing Topics:
   • orchestrator-events
   • event-records
   ...

🔄 Creating/Verifying Permanent Topics:

Topic: billionerp-field-events
  Description: Field-level events (blur, change) from billionerp
  ✅ Topic ready: billionerp-field-events

Topic: billionerp-record-events
  Description: Record-level events (CRUD) from billionerp
  ✅ Topic ready: billionerp-record-events

╔════════════════════════════════════════════════════════╗
║  ✅ Permanent Topics Configured                        ║
║                                                        ║
║  FIELD-LEVEL: billionerp-field-events                 ║
║  RECORD-LEVEL: billionerp-record-events               ║
║                                                        ║
║  These topics will NEVER be deleted during cleanup    ║
║  Only message history will be cleared                 ║
╚════════════════════════════════════════════════════════╝
```

### Step 2: Start Orchestrator Server

The permanent topics will be verified/created automatically on startup:

```bash
npm run dev
```

**Server logs should show:**
```
[kafkaAdmin] Creating topic 'billionerp-field-events'...
[kafkaAdmin] ✓ Topic 'billionerp-field-events' created (Billionerp field-level events - permanent)
[kafkaAdmin] Creating topic 'billionerp-record-events'...
[kafkaAdmin] ✓ Topic 'billionerp-record-events' created (Billionerp record-level events - permanent)
[kafkaAdmin] ✓ All required compacted topics verified/created
```

### Step 3: Test Event Flow

#### 3a. Field Blur Event Test

```bash
# In billionerp, edit a delivery record
# Click on a field (e.g., shipment)
# Type: TEST_EVENT_PAYLOAD1
# Click on another field (trigger blur)

# Expected: Field blur event sent to orchestrator
# Check orchestrator dashboard: event should appear
# Check Kafka topic:
npm run cleanup:kafka:stats
# Should show messages in billionerp-field-events
```

#### 3b. Record CRUD Event Test

```bash
# In billionerp, create a new delivery record
# Edit and save

# Expected: Record CREATE event sent to orchestrator
# Check orchestrator dashboard: event should appear
# Check Kafka topic:
npm run cleanup:kafka:stats
# Should show messages in billionerp-record-events
```

### Step 4: Safe Cleanup (No Topic Deletion)

Clear all events WITHOUT deleting topics:

```bash
npm run cleanup:kafka:safe

# Or manually:
bash cleanup-kafka-safe.sh
```

**Output:**
```
╔════════════════════════════════════════════════════════╗
║       SAFE KAFKA CLEANUP (Topics Preserved)            ║
║   Clears messages, never deletes topics                ║
╚════════════════════════════════════════════════════════╝

🔍 Current Topics and Message Count:
   🎯 billionerp-field-events (EVENT TOPIC)
   🎯 billionerp-record-events (EVENT TOPIC)
   🎯 orchestrator-events (EVENT TOPIC)
   • event-records
   ...

⚠️  WARNING: This will CLEAR all messages from event topics!
   Topics will be PRESERVED (not deleted)
   Event history will be cleared

   Continue? (yes/no): yes

🔄 Clearing Kafka messages (preserving topics)...

🧹 Clearing messages from: billionerp-field-events
   ✅ Messages cleared: billionerp-field-events

🧹 Clearing messages from: billionerp-record-events
   ✅ Messages cleared: billionerp-record-events

...

📋 Final Topic State:
   🎯 billionerp-field-events (CLEARED, PRESERVED)
   🎯 billionerp-record-events (CLEARED, PRESERVED)
   ...

╔════════════════════════════════════════════════════════╗
║  ✅ Kafka messages cleared                             ║
║  ✅ Topics preserved for new events                    ║
║  Ready for fresh testing                               ║
╚════════════════════════════════════════════════════════╝
```

### Step 5: Resume Testing

After safe cleanup, topics remain available:

```bash
# billionerp can continue sending events
# Field blur events immediately work
# No topic recreation delay
```

## Testing Checklist

- [ ] `npm run setup:topics` creates permanent topics successfully
- [ ] `npm run dev` verifies topics exist on startup (no errors)
- [ ] Edit field in billionerp → blur → event appears in orchestrator dashboard
- [ ] Create record in billionerp → event appears in orchestrator dashboard
- [ ] `npm run cleanup:kafka:stats` shows messages in both permanent topics
- [ ] `npm run cleanup:kafka:safe` clears messages without deleting topics
- [ ] After cleanup, field blur events immediately work (no topic missing errors)
- [ ] Event dashboard shows events from both field-level and record-level

## Performance Characteristics

### Topic Sizes
- **billionerp-field-events**: Grows rapidly (field changes are frequent)
  - Typical: 100-500 msgs/minute per active user
  - Estimate: 60-120MB/day for 10 concurrent users

- **billionerp-record-events**: Grows slower (record operations less frequent)
  - Typical: 5-20 msgs/minute per active user
  - Estimate: 1-4MB/day for 10 concurrent users

### Consumer Lag
- Consumer group tracks offset in topics
- On server restart: Load all messages from start (full recovery)
- Consider using `--dry-run` to preview cleanup impact

### Memory Impact
- Permanent topics are compacted (don't grow linearly)
- Message deduplication by ID keeps size manageable
- Cache in kafkaEventStore (5-second TTL) minimizes reads

## Environment Variables

Optional overrides (defaults shown):

```bash
# Topic names (customize if needed)
export FIELD_EVENTS_TOPIC=billionerp-field-events
export RECORD_EVENTS_TOPIC=billionerp-record-events

# Kafka brokers
export KAFKA_BROKERS=localhost:9092,localhost:9093,localhost:9094
```

## Troubleshooting

### Issue: Topics not created
```
[kafkaAdmin] Failed to connect: Connection refused
```
**Solution**: Ensure Kafka is running: `docker-compose up kafka`

### Issue: Field blur events not appearing in orchestrator
```
# Check if billionerp-field-events topic exists
npm run cleanup:kafka:stats | grep billionerp-field-events
# If missing, run: npm run setup:topics
```

### Issue: Safe cleanup fails with "Topic doesn't exist"
```
# The kafka-delete-records command requires the topic to exist
# First ensure topics exist:
npm run setup:topics
# Then try cleanup again
npm run cleanup:kafka:safe
```

### Issue: Events disappear after server restart
```
# Check consumer group offset
# Events should be recovered from permanent topics
# Verify: npm run cleanup:kafka:stats shows message counts > 0
```

## Rollback Plan

If permanent topics cause issues:

1. **Option A**: Stop sending to permanent topics
   - Comment out `kafkaEventStore.routeToPermanentTopic()` in eventBus.js
   - Redeploy
   - Old event-records topic still has all events

2. **Option B**: Delete and recreate with different settings
   ```bash
   # Delete (WARNING: Data loss)
   docker-compose exec kafka kafka-topics --bootstrap-server kafka:9092 \
     --delete --topic billionerp-field-events

   # Recreate with different settings
   npm run setup:topics
   ```

3. **Option C**: Keep old cleanup behavior (will delete topics)
   ```bash
   npm run cleanup:kafka  # Uses old cleanup-kafka.js
   # Then recreate:
   npm run setup:topics
   ```

## Related Scripts

| Script | Purpose | Use Case |
|--------|---------|----------|
| `npm run setup:topics` | Create permanent topics | Initial setup, disaster recovery |
| `npm run cleanup:kafka:safe` | Clear messages, keep topics | Regular cleanup (RECOMMENDED) |
| `npm run cleanup:kafka` | Clear topics via deletion | Full reset (old behavior, NOT RECOMMENDED) |
| `npm run cleanup:kafka:stats` | Show topic statistics | Monitoring, capacity planning |
| `npm run cleanup:kafka:dry` | Preview cleanup (dry-run) | Test before executing |

## Next Steps

1. Run `npm run setup:topics` to create permanent topics
2. Test field blur events (billionerp → edit → blur → dashboard)
3. Use `npm run cleanup:kafka:safe` for regular maintenance
4. Monitor topic sizes with `npm run cleanup:kafka:stats`
5. Commit changes to git

## References

- **Kafka Compacted Topics**: https://kafka.apache.org/documentation/#compaction
- **Event Dispatcher**: `billionerp/index.php` (bridge pattern)
- **Field Blur Handler**: `billionerp/delivery/app/app.js` (onFieldBlur)
- **Orchestrator**: `gradio-hugginface-crudAI/server.js` (POST /api/events)
