# Cloud Deployment Setup: Kafka-Native Orchestration Server

## Quick Start

The orchestration server is being refactored for cloud deployments (Railway, Vercel, Docker, Kubernetes) with Kafka as the event persistence backend.

## What's New

### 1. Kafka Topic Management (`services/kafkaAdmin.js`)
- Automatic topic creation on server startup
- Compacted topics for event audit trail
- Handles topic initialization failures gracefully

**Topics Created:**
```
event-records          - All event records (compacted, infinite retention)
event-dlq              - Dead letter queue (compacted, infinite retention)
event-registry         - Module registry & bindings (compacted, infinite retention)
event-processing-state - Deduplication tracking (compacted, 7-day retention)
```

### 2. Kafka Event Store (`services/kafkaEventStore.js`)
- Replaces LevelDB file-based persistence
- Caching layer for performance
- Bulk load capabilities for recovery

**Functions:**
```javascript
persistEventRecord(producer, id, record)  // Write event to Kafka
getEventRecord(admin, id)                 // Read event (cached)
moveEventToDLQ(producer, id, error)       // Move failed event to DLQ
loadAllEventRecords(consumer)             // Bulk load for recovery
queryEventRecords(records, filter)        // Filter loaded events
```

### 3. Dual-Write Pattern (Recommended)
- Write to BOTH LevelDB and Kafka simultaneously
- Seamless fallback if one backend fails
- Zero downtime migration path
- Detailed guide in `KAFKA-MIGRATION.md`

## Environment Variables

### Kafka Connection
```bash
KAFKA_BROKERS=kafka1:9092,kafka2:9092,kafka3:9092
KAFKA_GROUP_ID=orchestrator-group
ORCH_EVENTS_TOPIC=orchestrator-events
```

### Event Persistence (New)
```bash
# Topic names (customize per environment)
EVENT_RECORDS_TOPIC=event-records
EVENT_DLQ_TOPIC=event-dlq
EVENT_REGISTRY_TOPIC=event-registry
EVENT_STATE_TOPIC=event-processing-state

# Dual-write mode (gradual migration)
KAFKA_PERSISTENCE_ENABLED=true          # Write to Kafka
LEVELDB_PERSISTENCE_ENABLED=true        # Keep LevelDB as fallback
KAFKA_PRIMARY_READ=true                 # Read from Kafka first
KAFKA_ONLY_WRITES=false                 # Still write to LevelDB
```

### Optional Kafka Tuning
```bash
KAFKA_FETCH_MAX_BYTES=52428800          # 50MB batch size
KAFKA_SESSION_TIMEOUT_MS=30000          # 30 second timeout
KAFKA_HEARTBEAT_INTERVAL_MS=3000        # Health check interval
EVENT_RECORDS_FETCH_LIMIT=10000         # Max events to load on startup
```

## Deployment Configurations

### Docker Compose (Local Development)
```yaml
version: '3'
services:
  kafka:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    ports:
      - "9092:9092"

  orchestration:
    build: .
    environment:
      KAFKA_BROKERS: kafka:9092
      KAFKA_PERSISTENCE_ENABLED: 'true'
      LEVELDB_PERSISTENCE_ENABLED: 'false'  # Cloud-native: no files
    ports:
      - "5050:5050"
    depends_on:
      - kafka
```

### Railway Deployment
```bash
# Add these environment variables in Railway Dashboard:
KAFKA_BROKERS=<provided-by-kafka-plugin>
KAFKA_PERSISTENCE_ENABLED=true
LEVELDB_PERSISTENCE_ENABLED=false

# No persistent volume needed - all state in Kafka
```

### Kubernetes StatefulSet
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: orchestration-config
data:
  KAFKA_BROKERS: "kafka-cluster-0.kafka-headless:9092,kafka-cluster-1.kafka-headless:9092"
  KAFKA_PERSISTENCE_ENABLED: "true"
  LEVELDB_PERSISTENCE_ENABLED: "false"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orchestration-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: orchestration-server
  template:
    metadata:
      labels:
        app: orchestration-server
    spec:
      containers:
      - name: server
        image: orchestration-server:latest
        ports:
        - containerPort: 5050
        envFrom:
        - configMapRef:
            name: orchestration-config
        livenessProbe:
          httpGet:
            path: /health
            port: 5050
          initialDelaySeconds: 30
          periodSeconds: 10
```

### Vercel/Serverless (Event-Driven)
```javascript
// Can be deployed as microservice (stateless)
// Queries Kafka for state instead of storing locally
// No filesystem access required
```

## Health Check Endpoint (New)

```bash
GET /api/admin/persistence-health
```

**Response:**
```json
{
  "ok": true,
  "kafka": {
    "enabled": true,
    "connected": true,
    "brokers": 3,
    "topicsReady": true
  },
  "leveldb": {
    "enabled": false,
    "connected": false
  },
  "eventRecords": 15234,
  "dlqItems": 3,
  "consumerLag": 0
}
```

## Verification Checklist

### Pre-Deployment
- [ ] Kafka cluster is running and accessible
- [ ] Topics exist or auto-creation is enabled
- [ ] Broker replication factor ≥ 3 (production)
- [ ] Topic retention policies configured (infinite for audit)
- [ ] Network connectivity: Server → Kafka brokers

### Post-Deployment
- [ ] Server connects to Kafka on startup (logs show "Connected to Kafka")
- [ ] Topics created successfully (logs show "✓ Topic 'event-records' created")
- [ ] Send test event: `curl -X POST http://localhost:5050/api/orchestrator/event`
- [ ] Event appears in `/api/event-records` within 1 second
- [ ] DLQ endpoint works: `curl http://localhost:5050/api/events/dlq`
- [ ] Health check passes: `curl http://localhost:5050/api/admin/persistence-health`

## Migration Paths

### Option 1: Dual-Write (Recommended - Safe)
1. Deploy with `KAFKA_PERSISTENCE_ENABLED=true` and `LEVELDB_PERSISTENCE_ENABLED=true`
2. Events written to both backends simultaneously
3. Monitor for 2 weeks to ensure Kafka stability
4. Disable LevelDB writes (`KAFKA_ONLY_WRITES=true`)
5. Remove LevelDB code after 4 weeks of validation
6. Deploy to cloud without file dependencies

**Timeline:** 4 weeks, zero risk

### Option 2: Quick Migration (Higher Risk)
1. Deploy with Kafka-only immediately
2. No LevelDB fallback
3. Immediate cloud deployment
4. Fast but requires thorough testing first

**Timeline:** 1 week, requires validation in staging

### Option 3: Gradual Rollout
1. Week 1: Dual-write to 10% of instances
2. Week 2: Dual-write to 50% of instances
3. Week 3: Dual-write to 100% of instances
4. Week 4: Kafka-primary reads on 100%
5. Week 5: Disable LevelDB writes
6. Week 6+: Cloud deployment

**Timeline:** 6 weeks, maximum safety

## Monitoring & Alerts

### Key Metrics to Watch

```promql
# Kafka metrics
kafka_consumer_lag{group="orchestrator-group"} < 100
kafka_topic_partitions_available{topic="event-records"} == 3
kafka_broker_replication_factor{topic="event-records"} >= 3

# Application metrics
orchestration_events_persisted_total
orchestration_persistence_write_duration_ms (p99 < 100ms)
orchestration_persistence_read_duration_ms (p99 < 500ms)
orchestration_events_recovered_on_startup
```

### Alert Rules

```yaml
- alert: KafkaTopicMissing
  expr: absent(kafka_topic_partitions_available)
  for: 5m
  annotations:
    summary: "Kafka topic creation failed"

- alert: ConsumerLagHigh
  expr: kafka_consumer_lag > 1000
  for: 10m
  annotations:
    summary: "Consumer lagging behind producers"

- alert: PersistenceWriteFailed
  expr: rate(orchestration_persistence_write_errors[5m]) > 0.1
  for: 5m
  annotations:
    summary: "Event persistence failures detected"
```

## Troubleshooting

### "Topics not created on startup"
**Cause:** Kafka broker not accessible
**Fix:**
```bash
# Verify Kafka is running
kafka-broker-api-versions.sh --bootstrap-server localhost:9092

# Check KAFKA_BROKERS env var
echo $KAFKA_BROKERS

# Test connectivity
nc -zv kafka 9092
```

### "Events not persisting to Kafka"
**Cause:** Producer not connected
**Fix:**
```bash
# Check logs
docker logs <container-id> | grep -i kafka

# Verify permissions
kafka-topics.sh --describe --topic event-records --bootstrap-server localhost:9092

# Test produce
echo "test" | kafka-console-producer.sh --topic event-records
```

### "Consumer lag increasing"
**Cause:** Consumer not keeping up
**Fix:**
```bash
# Check consumer group status
kafka-consumer-groups.sh --group orchestrator-group --describe --bootstrap-server localhost:9092

# Rebalance if needed
kafka-consumer-groups.sh --group orchestrator-group --reset-offsets --to-latest --execute
```

## Performance Notes

### Latency
- **Event persist**: ~5-10ms (async Kafka produce)
- **Event retrieve**: ~50-100ms (compacted topic read, with cache hit ~1ms)
- **Full recovery**: ~30 seconds for 10,000 events

### Scalability
- **Single Kafka cluster**: ~1000 events/second sustained
- **Multi-broker cluster**: 10x throughput with 3+ brokers
- **Replication**: 3-way replication adds ~15% latency, ensures durability

### Storage
- **Event record size**: ~500 bytes average
- **10k events**: ~5MB (with replication, 15MB on 3-broker cluster)
- **Compacted topic cleanup**: Automatic, retains only latest version per key

## Next Steps

1. **Review the migration guide**: Read `KAFKA-MIGRATION.md` in detail
2. **Test locally**: Deploy with Docker Compose and verify topics
3. **Implement dual-write**: Follow Phase 2 from migration guide
4. **Monitor for 2 weeks**: Verify Kafka stability
5. **Enable Kafka-primary reads**: Switch to Phase 3
6. **Disable LevelDB writes**: Move to Phase 4
7. **Remove LevelDB code**: Final Phase 5
8. **Deploy to cloud**: No persistent volumes needed

## Support

- Kafka docs: https://kafka.apache.org/documentation/
- Confluent Python client: https://github.com/confluentinc/confluent-kafka-python
- Node.js KafkaJS: https://kafka.js.org/
- Orchestration server architecture: See `../ORCHESTRATION-EVENT-SQL-ARCHITECTURE.md`
