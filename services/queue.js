const { Kafka } = require('kafkajs');
const sc = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const kafka = new Kafka({ brokers: KAFKA_BROKERS });
let producer = null;
let consumerRunning = false;

async function ensureProducer() {
  if (producer) return producer;
  producer = kafka.producer();
  await producer.connect();
  return producer;
}

async function publishJob(payload) {
  try {
    await ensureProducer();
    const topic = 'ORCHESTRATIONS_JOBS';
    const key = (payload && payload.executionId) || null;
    const res = await producer.send({ topic, messages: [{ key, value: sc(payload) }] });
    console.log('[queue:kafka] published job', { topic, result: res });
    return res;
  } catch (e) {
    console.error('[queue:kafka] publishJob error', e && e.stack ? e.stack : e);
    throw e;
  }
}

async function publishEvent(executionId, event) {
  try {
    await ensureProducer();
    const topic = 'ORCHESTRATIONS_EVENTS';
    // embed subject like previous NATS style so monitor UI can show it
    const message = Object.assign({}, event, { executionId, subject: event && event.subject ? event.subject : `executions.${executionId}.events` });
    const res = await producer.send({ topic, messages: [{ key: executionId, value: sc(message) }] });
    console.log('[queue:kafka] published event', { topic, result: res });
    return res;
  } catch (e) {
    console.error('[queue:kafka] publishEvent error', e && e.stack ? e.stack : e);
    throw e;
  }
}

// Subscribe to jobs using a consumer group; handler(payload) expected.
async function subscribeJobs(handler, opts = {}) {
  const topic = 'ORCHESTRATIONS_JOBS';
  const groupId = opts.groupId || 'orchestrator_worker';
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });
  consumerRunning = true;
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const value = message.value ? message.value.toString() : null;
        const payload = value ? JSON.parse(value) : null;
        await handler(payload);
      } catch (e) {
        console.error('[queue:kafka] handler error', e && e.stack ? e.stack : e);
        // In Kafka, failed message handling often requires manual policy (DLQ topic)
        try {
          await ensureProducer();
          await producer.send({ topic: 'ORCHESTRATIONS_DLQ', messages: [{ key: null, value: sc({ error: e.message || String(e), original: message.value ? message.value.toString() : null }) }] });
        } catch (ee) { console.error('[queue:kafka] DLQ publish failed', ee && ee.stack ? ee.stack : ee); }
      }
    }
  });
}

module.exports = { publishJob, publishEvent, subscribeJobs };

