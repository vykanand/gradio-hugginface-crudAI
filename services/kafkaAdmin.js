/**
 * Kafka Admin Helper
 * Manages compacted topics for event persistence
 * - event-records (all events)
 * - event-dlq (failed events)
 * - event-registry (module registry, bindings)
 * - event-processing-state (deduplication tracking)
 */

const { Admin } = require('kafkajs');

const TOPICS = {
  EVENT_RECORDS: process.env.EVENT_RECORDS_TOPIC || 'event-records',
  EVENT_DLQ: process.env.EVENT_DLQ_TOPIC || 'event-dlq',
  EVENT_REGISTRY: process.env.EVENT_REGISTRY_TOPIC || 'event-registry',
  EVENT_STATE: process.env.EVENT_STATE_TOPIC || 'event-processing-state',
  // Permanent billionerp topics (never deleted during cleanup)
  FIELD_EVENTS: process.env.FIELD_EVENTS_TOPIC || 'billionerp-field-events',
  RECORD_EVENTS: process.env.RECORD_EVENTS_TOPIC || 'billionerp-record-events'
};

let admin = null;

async function initKafkaAdmin(kafka) {
  try {
    admin = kafka.admin();
    await admin.connect();
    console.log('[kafkaAdmin] Connected to Kafka cluster');
    return true;
  } catch (e) {
    console.error('[kafkaAdmin] Failed to connect:', e && e.message ? e.message : e);
    throw e;
  }
}

async function ensureCompactedTopics() {
  if (!admin) throw new Error('Kafka admin not initialized. Call initKafkaAdmin() first');

  // Determine replication factor based on number of brokers in cluster
  const cluster = await admin.describeCluster().catch(() => ({ brokers: [{ nodeId: 1 }] }));
  const brokerCount = (cluster && cluster.brokers) ? cluster.brokers.length : 1;
  const replicationFactor = Math.min(brokerCount, 1);  // Use 1 for single-broker Docker setup

  const topicConfigs = [
    {
      name: TOPICS.EVENT_RECORDS,
      config: {
        'cleanup.policy': 'compact',
        'min.compaction.lag.ms': '0',
        'retention.ms': '-1'
      },
      partitions: 1,
      replicationFactor: replicationFactor,
      description: 'All event records (audit trail, immutable)'
    },
    {
      name: TOPICS.EVENT_DLQ,
      config: {
        'cleanup.policy': 'compact',
        'retention.ms': '-1'
      },
      partitions: 1,
      replicationFactor: replicationFactor,
      description: 'Dead letter queue (failed events)'
    },
    {
      name: TOPICS.EVENT_REGISTRY,
      config: {
        'cleanup.policy': 'compact',
        'retention.ms': '-1'
      },
      partitions: 1,
      replicationFactor: replicationFactor,
      description: 'Event registry (module counts, bindings)'
    },
    {
      name: TOPICS.EVENT_STATE,
      config: {
        'cleanup.policy': 'compact',
        'retention.ms': '604800000'  // 7 days
      },
      partitions: 1,
      replicationFactor: replicationFactor,
      description: 'Event processing state (deduplication tracking)'
    },
    // Permanent billionerp topics - never deleted, persist through cleanup
    {
      name: TOPICS.FIELD_EVENTS,
      config: {
        'cleanup.policy': 'compact',
        'min.compaction.lag.ms': '0',
        'retention.ms': '-1'
      },
      partitions: 3,
      replicationFactor: replicationFactor,
      description: 'Billionerp field-level events (blur, change) - permanent'
    },
    {
      name: TOPICS.RECORD_EVENTS,
      config: {
        'cleanup.policy': 'compact',
        'min.compaction.lag.ms': '0',
        'retention.ms': '-1'
      },
      partitions: 3,
      replicationFactor: replicationFactor,
      description: 'Billionerp record-level events (CRUD) - permanent'
    }
  ];

  const existingTopics = await admin.listTopics();

  for (const topic of topicConfigs) {
    try {
      if (existingTopics.includes(topic.name)) {
        console.log(`[kafkaAdmin] Topic '${topic.name}' already exists`);
      } else {
        console.log(`[kafkaAdmin] Creating topic '${topic.name}'...`);
        // Build topic config
        const topicObj = {
          name: String(topic.name),
          numPartitions: parseInt(topic.partitions) || 1,
          replicationFactor: parseInt(topic.replicationFactor) || 1
        };

        // Add config entries if we have any
        const configEntries = [];
        if (topic.config && typeof topic.config === 'object') {
          for (const [key, val] of Object.entries(topic.config)) {
            if (key && val !== undefined && val !== null) {
              configEntries.push({ name: String(key), value: String(val) });
            }
          }
        }
        if (configEntries.length > 0) {
          topicObj.configEntries = configEntries;
        }

        await admin.createTopics({
          topics: [topicObj],
          validateOnly: false,
          timeout: 30000
        });
        console.log(`[kafkaAdmin] ✓ Topic '${topic.name}' created (${topic.description})`);
      }
    } catch (e) {
      // Ignore "Topic already exists" errors
      if (e && (e.type === 'TOPIC_ALREADY_EXISTS' || (e.message && e.message.includes('already exists')))) {
        console.log(`[kafkaAdmin] Topic '${topic.name}' already exists (confirmed)`);
      } else {
        console.error(`[kafkaAdmin] Error creating topic '${topic.name}':`, e && e.message ? e.message : e);
        // Don't throw - continue with other topics
      }
    }
  }

  console.log('[kafkaAdmin] ✓ All required compacted topics verified/created');
}

async function describeTopics() {
  if (!admin) throw new Error('Kafka admin not initialized');

  const topics = Object.values(TOPICS);
  try {
    const descriptions = await admin.describeTopics({ topics });
    return descriptions;
  } catch (e) {
    console.error('[kafkaAdmin] Failed to describe topics:', e && e.message ? e.message : e);
    throw e;
  }
}

async function getTopicStats() {
  if (!admin) throw new Error('Kafka admin not initialized');

  try {
    const offsets = await admin.fetchOffsets({ topics: Object.values(TOPICS) });
    return offsets;
  } catch (e) {
    console.error('[kafkaAdmin] Failed to fetch topic offsets:', e && e.message ? e.message : e);
    return null;
  }
}

async function disconnect() {
  if (admin) {
    try {
      await admin.disconnect();
      console.log('[kafkaAdmin] Disconnected from Kafka');
    } catch (e) {
      console.error('[kafkaAdmin] Error disconnecting:', e && e.message ? e.message : e);
    }
  }
}

module.exports = {
  TOPICS,
  initKafkaAdmin,
  ensureCompactedTopics,
  describeTopics,
  getTopicStats,
  disconnect,
  getAdmin: () => admin
};
