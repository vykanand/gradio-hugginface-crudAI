const { Kafka } = require('kafkajs');
const queue = require('../services/queue');
const fs = require('fs').promises;
const path = require('path');

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const kafka = new Kafka({ brokers: KAFKA_BROKERS });
const DLQ_TOPIC = 'ORCHESTRATIONS_DLQ';
const ARCHIVE_DIR = path.join(__dirname, '..', 'storage', 'orchestrations', 'dlq-archive');

async function ensureArchive() {
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
}

async function startConsumer(groupId = 'dlq_replayer') {
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  await consumer.subscribe({ topic: DLQ_TOPIC, fromBeginning: true });
  await ensureArchive();
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const raw = message.value ? message.value.toString() : '';
        // archive raw message
        const file = path.join(ARCHIVE_DIR, `${Date.now()}_${Math.floor(Math.random()*10000)}.json`);
        await fs.writeFile(file, raw);
        // attempt replay by publishing to jobs topic
        let payload = null;
        try { payload = JSON.parse(raw); } catch (e) { payload = { raw }; }
        try {
          await queue.publishJob(payload);
          console.log('[dlq] replayed message to jobs');
        } catch (e) {
          console.error('[dlq] failed to replay message', e && e.message ? e.message : e);
        }
      } catch (e) {
        console.error('[dlq] consumer handler error', e && e.message ? e.message : e);
      }
    }
  });
}

module.exports = { startConsumer };
