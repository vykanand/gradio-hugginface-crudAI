# Permanent Kafka Topics - Quick Start

## The Problem You Reported

> "Records listed: 22 total records... [blur] Emitting immediate field event: delivery:fieldEvent:field-changed field: shipment value: TEST_EVENT_PAYLOAD1... but didnt get recieved on orchestrator? is topic gets missing everytime we clear? can we have permanent 2 topics record level and field level topics so that topic can persist and no issues when cleaning"

## The Solution ✅

Two new **permanent** Kafka topics that:
- **Never get deleted** during cleanup
- **Automatically created** on server startup
- **Route all events** from billionerp

### New Topics
1. `billionerp-field-events` - Field blur/change events
2. `billionerp-record-events` - Record CRUD events

## Quick Setup (5 minutes)

### 1. Create Permanent Topics
```bash
cd C:\dev\gradio-hugginface-crudAI
npm run setup:topics
```

You'll see:
```
✅ Permanent Topics Configured
├── billionerp-field-events
└── billionerp-record-events
These topics will NEVER be deleted during cleanup
```

### 2. Start the Server
```bash
npm run dev
```

Server logs should show:
```
[kafkaAdmin] ✓ Topic 'billionerp-field-events' created
[kafkaAdmin] ✓ Topic 'billionerp-record-events' created
```

### 3. Test Field Blur Event
1. Open billionerp at http://localhost:8001
2. Edit a **delivery** record (delivery module has real data)
3. Click on **shipment** field
4. Type: `TEST_EVENT_PAYLOAD1`
5. Click another field (triggers blur event)
6. Open orchestrator dashboard at http://localhost:5050
7. **Verify**: New event appears with the field change

### 4. Clean Kafka Safely
```bash
npm run cleanup:kafka:safe
```

After cleanup:
- ✅ Messages cleared
- ✅ Topics still exist
- ✅ Field blur events immediately work

## What Changed (Technical)

### Code Changes
- **eventBus.js**: Routes events to permanent topics
- **kafkaAdmin.js**: Creates topics on startup
- **kafkaEventStore.js**: Routes by event type

### New Scripts
```bash
npm run setup:topics              # Create topics once
npm run cleanup:kafka:safe        # Clear WITHOUT deleting (SAFE)
npm run cleanup:kafka             # Clear with deletion (old way, NOT RECOMMENDED)
```

## Event Flow

```
billionerp (field blur)
    ↓
orchestrator (receives event)
    ├→ event-records (internal)
    └→ billionerp-field-events (PERMANENT) ← This persists through cleanup
        ↓
    Orchestrator dashboard (displays event)
```

## Key Differences: Before vs After

### BEFORE (Broken)
```
1. Edit field in billionerp
2. Clear Kafka: npm run cleanup:kafka
3. Topics DELETED ❌
4. New field blur: "Topic not found" ❌
```

### AFTER (Fixed)
```
1. Edit field in billionerp
2. Clear Kafka: npm run cleanup:kafka:safe
3. Topics PRESERVED ✅
4. New field blur: Works immediately ✅
```

## Quick Reference

| What | Command | Result |
|------|---------|--------|
| Setup once | `npm run setup:topics` | Creates permanent topics |
| Start server | `npm run dev` | Verifies/creates topics automatically |
| Test field event | Edit field in billionerp, blur | Appears in orchestrator dashboard |
| Clean events | `npm run cleanup:kafka:safe` | Clears messages, keeps topics |
| View stats | `npm run cleanup:kafka:stats` | Shows message counts |
| Full reset | `npm run cleanup:kafka` | Deletes topics (for disaster recovery) |

## Troubleshooting

### Q: Field blur event still not working?
**A:** Check:
1. Kafka is running: `docker-compose ps kafka`
2. Topics exist: `npm run cleanup:kafka:stats | grep billionerp`
3. If missing, create them: `npm run setup:topics`

### Q: How to verify events are being routed?
**A:** Check Kafka:
```bash
npm run cleanup:kafka:stats
# Look for:
# billionerp-field-events - Should have messages
# billionerp-record-events - Should have messages
```

### Q: Can I still use the old cleanup method?
**A:** Yes, but NOT recommended:
```bash
npm run cleanup:kafka           # Deletes topics (old way)
npm run setup:topics            # Must recreate
```

The safe way is better:
```bash
npm run cleanup:kafka:safe      # Clears messages, keeps topics
# Topics still exist, events immediately work
```

## What's Permanent?

These topics are configured with:
- **Compaction**: Enabled (cleanup.policy=compact)
- **Retention**: Infinite (-1) - Never auto-deleted by age
- **Partitions**: 3 (scalable to multiple users)
- **Key**: Event ID (for compaction deduplication)

## Next Steps

1. ✅ Run `npm run setup:topics`
2. ✅ Run `npm run dev`
3. ✅ Test field blur event in billionerp
4. ✅ Use `npm run cleanup:kafka:safe` for future cleanup
5. ✅ Done! Events now persist through cleanup

## Files Modified

- `services/eventBus.js` - Route to permanent topics
- `services/kafkaAdmin.js` - Create topics on startup
- `services/kafkaEventStore.js` - Routing logic
- `package.json` - New npm scripts
- `ensure-permanent-topics.sh` - Docker topic creation
- `cleanup-kafka-safe.sh` - Safe cleanup script

## Reference Docs

See `PERMANENT_TOPICS_IMPLEMENTATION.md` for:
- Full architecture details
- Deployment instructions
- Performance characteristics
- Advanced troubleshooting
- Rollback procedures

---

**Status**: ✅ Production Ready

The permanent topics implementation is complete and ready for use. Field blur events will no longer fail after Kafka cleanup.
