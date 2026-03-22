#!/usr/bin/env node

/**
 * KAFKA CLEANUP UTILITY
 *
 * Clears all Kafka topics to reset the event system
 * Usage: node cleanup-kafka.js [--topics] [--dry-run]
 */

const { Kafka, Admin } = require('kafkajs');

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const TOPICS = {
  EVENT_RECORDS: process.env.EVENT_RECORDS_TOPIC || 'event-records',
  EVENT_DLQ: process.env.EVENT_DLQ_TOPIC || 'event-dlq',
  EVENT_REGISTRY: process.env.EVENT_REGISTRY_TOPIC || 'event-registry',
  EVENT_STATE: process.env.EVENT_STATE_TOPIC || 'event-processing-state',
  ORCHESTRATOR_EVENTS: process.env.ORCH_EVENTS_TOPIC || 'orchestrator-events'
};

const kafka = new Kafka({
  clientId: 'kafka-cleanup',
  brokers: KAFKA_BROKERS,
  connectionTimeout: 10000,
  requestTimeout: 30000
});

let admin = null;

async function connectAdmin() {
  try {
    admin = kafka.admin();
    await admin.connect();
    console.log('✅ Connected to Kafka cluster');
    return true;
  } catch (e) {
    console.error('❌ Failed to connect to Kafka:', e.message);
    return false;
  }
}

async function disconnectAdmin() {
  if (admin) {
    await admin.disconnect();
  }
}

/**
 * Delete and recreate topics to clear all messages
 */
async function deleteAndRecreateTopic(topicName) {
  try {
    console.log(`\n🗑️  Deleting topic: ${topicName}`);
    await admin.deleteTopics({ topics: [topicName] });
    console.log(`   ✅ Topic deleted: ${topicName}`);

    // Wait a bit for deletion to propagate
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Recreate the topic
    console.log(`🔄 Recreating topic: ${topicName}`);
    await admin.createTopics({
      topics: [{
        name: topicName,
        numPartitions: 1,
        replicationFactor: 1,
        configEntries: [
          { name: 'cleanup.policy', value: 'compact' },
          { name: 'retention.ms', value: '-1' }
        ]
      }]
    });
    console.log(`   ✅ Topic recreated: ${topicName}`);
    return true;
  } catch (e) {
    if (e.message && e.message.includes('UNKNOWN_TOPIC_OR_PART')) {
      console.log(`   ℹ️  Topic doesn't exist (will be created on first use): ${topicName}`);
      return true;
    }
    console.error(`   ❌ Error with topic ${topicName}:`, e.message);
    return false;
  }
}

/**
 * List all topics with message counts
 */
async function listTopicsWithStats() {
  try {
    const allTopics = await admin.fetchTopicMetadata();
    console.log('\n📋 All Topics in Kafka Cluster:\n');

    const targetTopics = Object.values(TOPICS);
    let totalMessages = 0;

    for (const topic of allTopics.topics) {
      const isOurTopic = targetTopics.includes(topic.name);
      const marker = isOurTopic ? '🎯' : '  ';

      try {
        const offsets = await admin.fetchOffsets({ topics: [topic.name] });
        let messages = 0;

        for (const partition of offsets[topic.name]) {
          const high = parseInt(partition.high);
          if (high > 0) messages += high;
        }

        if (isOurTopic) totalMessages += messages;

        const status = isOurTopic ? '(EVENT SYSTEM)' : '(OTHER)';
        console.log(`${marker} ${topic.name.padEnd(30)} - ${messages.toString().padStart(6)} messages ${status}`);
      } catch (e) {
        console.log(`${marker} ${topic.name.padEnd(30)} - (error reading stats)`);
      }
    }

    console.log(`\n📊 Total EVENT SYSTEM messages: ${totalMessages}\n`);
    return totalMessages;
  } catch (e) {
    console.error('Error listing topics:', e.message);
    return 0;
  }
}

/**
 * Show cluster info
 */
async function showClusterInfo() {
  try {
    const cluster = await admin.describeCluster();
    console.log('\n🔗 Kafka Cluster Info:');
    console.log(`   Broker Count: ${cluster.brokers.length}`);
    console.log(`   Controller ID: ${cluster.controller}`);
    console.log(`   Brokers: ${cluster.brokers.map(b => `${b.host}:${b.port}`).join(', ')}\n`);
  } catch (e) {
    console.error('Error getting cluster info:', e.message);
  }
}

/**
 * Main cleanup function
 */
async function cleanup() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const showTopics = args.includes('--topics');

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║           KAFKA EVENT SYSTEM CLEANUP                   ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  // Connect to Kafka
  const connected = await connectAdmin();
  if (!connected) {
    process.exit(1);
  }

  // Show cluster info
  await showClusterInfo();

  // Show all topics before cleanup
  if (showTopics) {
    console.log('Before cleanup:');
    await listTopicsWithStats();
  } else {
    console.log('Checking event topics...');
    const msgCount = await listTopicsWithStats();
    if (msgCount === 0) {
      console.log('✅ Event system is already clean (0 messages)');
      await disconnectAdmin();
      process.exit(0);
    }
  }

  if (dryRun) {
    console.log('\n📋 DRY RUN: Would delete and recreate these topics:');
    Object.entries(TOPICS).forEach(([key, topic]) => {
      console.log(`   - ${topic}`);
    });
    console.log('\nTo execute: node cleanup-kafka.js\n');
    await disconnectAdmin();
    process.exit(0);
  }

  // Confirm before deleting
  if (process.stdin.isTTY) {
    console.log('\n⚠️  WARNING: This will DELETE all events from Kafka!');
    console.log('   All event history will be permanently lost.');
    console.log('\n   Continue? (y/n) ');
  } else {
    // Non-interactive, skip confirmation
    console.log('\n🔄 Cleaning up Kafka topics...\n');
  }

  // Delete and recreate topics
  let successCount = 0;
  const topicsList = Object.values(TOPICS);

  for (const topic of topicsList) {
    const success = await deleteAndRecreateTopic(topic);
    if (success) successCount++;
  }

  console.log(`\n✅ Cleanup complete: ${successCount}/${topicsList.length} topics processed\n`);

  // Show topics after cleanup
  console.log('After cleanup:');
  await listTopicsWithStats();

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  ✅ Kafka event system cleared                         ║');
  console.log('║  Ready for fresh testing                               ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  await disconnectAdmin();
}

// Run cleanup
cleanup().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
