const queue = require('../services/queue');
const orchestrator = require('../services/executionOrchestrator');

async function handler(payload) {
  try {
    console.log('[worker] received payload', { executionId: payload && payload.executionId });
    const { metadata, inputs, executionId } = payload;
    // ensure executionId passed to orchestrator to persist with same id
    const res = await orchestrator.execute(metadata, inputs, { idempotencyKey: inputs && inputs.idempotencyKey, executionId });
    // publish final event
    try {
      await queue.publishEvent(res.executionId, { type: res.success ? 'execution.succeeded' : 'execution.failed', result: res });
    } catch (pubErr) {
      console.error('[worker] failed to publish final event:', pubErr && pubErr.stack ? pubErr.stack : pubErr);
    }
    return res;
  } catch (e) {
    console.error('[worker] handler error', e && e.stack ? e.stack : e);
    throw e;
  }
}

async function start() {
  console.log('[worker] Orchestration worker starting and subscribing to jobs...');
  let attempt = 0;
  while (true) {
    try {
      await queue.subscribeJobs(handler);
      // subscribeJobs will return only if the subscription ends; break to restart
      console.warn('[worker] queue.subscribeJobs returned, restarting subscription loop');
    } catch (e) {
      attempt++;
      const wait = Math.min(30000, 1000 * Math.pow(2, Math.min(attempt, 6))); // exponential backoff up to 30s
      console.error(`[worker] subscribeJobs failed (attempt ${attempt}). Error:`, e && e.stack ? e.stack : e);
      console.log(`[worker] retrying subscribeJobs in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    // small delay before re-subscribing
    await new Promise(r => setTimeout(r, 1000));
  }
}

if (require.main === module) {
  // global process handlers to surface errors in logs and avoid silent exits
  process.on('uncaughtException', (err) => {
    console.error('[worker] uncaughtException', err && err.stack ? err.stack : err);
    // allow the retry loop in start() to handle reconnects; do NOT crash container immediately
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[worker] unhandledRejection', reason && reason.stack ? reason.stack : reason);
  });

  start().catch(e => { console.error('[worker] fatal error', e && e.stack ? e.stack : e); process.exit(1); });
}

module.exports = { start };
