const path = require('path');
const fs = require('fs').promises;
const dbEngine = require('./dbExecutionEngine');
const logicEngine = require('./logicalExecutionEngine');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const queue = require('./queue');
const idempotency = require('./idempotencyStore');

const emitter = new EventEmitter();

const STORAGE_DIR = path.join(__dirname, '..', 'storage', 'orchestrations');
const EXEC_FILE = path.join(STORAGE_DIR, 'executions.json');

async function ensureStorage() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  try { await fs.access(EXEC_FILE); } catch (e) { await fs.writeFile(EXEC_FILE, '[]'); }
}

async function appendExecutionRecord(record) {
  await ensureStorage();
  const raw = await fs.readFile(EXEC_FILE, 'utf8');
  const arr = JSON.parse(raw || '[]');
  arr.push(record);
  await fs.writeFile(EXEC_FILE, JSON.stringify(arr, null, 2));
}

function resolveParamTemplates(obj, context) {
  if (!obj) return obj;
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_, expr) => {
      try {
        const parts = expr.split('.');
        if (parts[0] === 'inputs') return getByPath(context.inputs, parts.slice(1)) || '';
        if (parts[0] === 'steps') return getByPath(context.stepsOutputs, parts.slice(1)) || '';
        return '';
      } catch (e) { return ''; }
    });
  }
  if (Array.isArray(obj)) return obj.map(i=>resolveParamTemplates(i, context));
  if (typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = resolveParamTemplates(obj[k], context);
    return out;
  }
  return obj;
}

function getByPath(obj, parts) {
  if (!obj) return undefined;
  let cur = obj;
  for (const p of parts) {
    if (p === 'output') continue;
    if (cur === undefined || cur === null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function timeoutPromise(p, ms) {
  if (!ms) return p;
  return Promise.race([p, new Promise((_, rej)=>setTimeout(()=>rej(new Error('timeout')), ms))]);
}

async function findExistingByIdempotency(key) {
  if (!key) return null;
  // first try idempotency store for fast path
  try {
    const rec = await idempotency.lookup(key);
    if (rec && rec.executionId) {
      const e = await getExecution(rec.executionId).catch(()=>null);
      if (e) return e;
    }
  } catch (e) { /* ignore */ }
  // fallback to scanning executions file
  if (!key) return null;
  await ensureStorage();
  const raw = await fs.readFile(EXEC_FILE, 'utf8');
  const arr = JSON.parse(raw || '[]');
  const found = arr.find(r => r.inputs && r.inputs.idempotencyKey === key) || null;
  if (found) {
    try { await idempotency.complete(key, found.executionId); } catch (e) {}
  }
  return found;
}

async function execute(metadata, inputs, opts = {}) {
  const idempotencyKey = (opts && opts.idempotencyKey) || (inputs && inputs.idempotencyKey) || null;
  const execId = (opts && opts.executionId) || uuidv4();
  if (idempotencyKey) {
    // try to reserve idempotency key to avoid duplicate runs
    try {
      const existing = await findExistingByIdempotency(idempotencyKey);
      if (existing) {
        return { success: existing.success, message: 'idempotent: returning previous result', outputs: existing.outputs || {}, steps: existing.steps, executionId: existing.executionId };
      }
      // reserve mapping to this executionId
      await idempotency.reserve(idempotencyKey, execId, 1000 * 60 * 60);
    } catch (e) {
      // ignore reserve failures and proceed (best-effort)
    }
  }
  const start = new Date().toISOString();
  const context = { inputs: inputs || {}, stepsOutputs: {} };
  const steps = metadata.steps || [];
  const stepsStatus = [];
  let overallSuccess = true;
  const errors = [];

  // emit start
  const startEvent = { executionId: execId, type: 'execution.started', timestamp: new Date().toISOString(), metadataId: metadata.id || null };
  emitter.emit('event', startEvent);
  try { await queue.publishEvent(execId, startEvent); } catch (e) { /* best-effort */ }

  for (const step of steps) {
    const stepStart = new Date().toISOString();
    const stepStartedEvent = { executionId: execId, stepId: step.id, type: 'step.started', timestamp: stepStart };
    emitter.emit('event', stepStartedEvent);
    try { await queue.publishEvent(execId, stepStartedEvent); } catch (e) {}
    let result = null;
    try {
      const params = resolveParamTemplates(step.params || {}, context);

      // Prepare action execution with retry/backoff
      const maxAttempts = (step.retryPolicy && step.retryPolicy.maxAttempts) || 1;
      const backoff = (step.retryPolicy && step.retryPolicy.backoff) || 'fixed';
      let attempt = 0;
      let lastErr = null;

      while (attempt < maxAttempts) {
        try {
          attempt++;
          if (step.type === 'data') {
            const p = dbEngine.exec(step, params, context, { executionId: execId, stepId: step.id });
            const res = await timeoutPromise(p, step.timeoutMs || 0);
            if (!res.ok) throw new Error(res.error || 'data error');
            result = res.data;
          } else if (step.type === 'logic') {
            const snippet = step.snippet || step.action || 'return null;';
            const p = logicEngine.evalSnippet(snippet, { inputs: context.inputs, steps: context.stepsOutputs });
            const res = await timeoutPromise(p, step.timeoutMs || 0);
            if (!res.ok) throw new Error(res.error || 'logic error');
            result = res.output;
          } else {
            throw new Error('unknown step type ' + step.type);
          }
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt < maxAttempts) {
            const wait = backoff === 'exponential' ? Math.pow(2, attempt) * 100 : 200;
            await new Promise(r => setTimeout(r, wait));
            continue;
          }
        }
      }

      if (lastErr) throw lastErr;

      // store
      context.stepsOutputs[step.id] = { output: result };
      stepsStatus.push({ stepId: step.id, status: 'success', start: stepStart, end: new Date().toISOString(), output: result });
      const stepSucceededEvent = { executionId: execId, stepId: step.id, type: 'step.succeeded', timestamp: new Date().toISOString(), output: result };
      emitter.emit('event', stepSucceededEvent);
      try { await queue.publishEvent(execId, stepSucceededEvent); } catch (e) {}
    } catch (e) {
      overallSuccess = false;
      const msg = e.message || String(e);
      errors.push({ stepId: step.id, message: msg });
      stepsStatus.push({ stepId: step.id, status: 'failed', start: stepStart, end: new Date().toISOString(), error: msg });
      const stepFailedEvent = { executionId: execId, stepId: step.id, type: 'step.failed', timestamp: new Date().toISOString(), error: msg };
      emitter.emit('event', stepFailedEvent);
      try { await queue.publishEvent(execId, stepFailedEvent); } catch (e) {}

      // run compensation for executed steps in reverse order within same transactionalGroup or per-step compensation
      const toCompensate = [];
      for (const s of stepsStatus.slice().reverse()) {
        const originalStep = steps.find(x => x.id === s.stepId);
        if (originalStep && originalStep.compensation) toCompensate.push(...(originalStep.compensation));
      }
        for (const comp of toCompensate) {
        try {
          const cparams = resolveParamTemplates(comp.params || {}, context);
          if (comp.type === 'data') await dbEngine.exec(comp, cparams, context, { executionId: execId, stepId: comp.id || step.id });
          else if (comp.type === 'logic') await logicEngine.evalSnippet(comp.snippet || comp.action, { inputs: context.inputs, steps: context.stepsOutputs });
          const compEvent = { executionId: execId, type: 'compensation.succeeded', compId: comp.id || null };
        } catch (ce) {
          errors.push({ stepId: comp.id || 'compensation', message: 'compensation failed: ' + (ce.message || String(ce)) });
          const compFailEvent = { executionId: execId, type: 'compensation.failed', message: ce.message || String(ce) };
          emitter.emit('event', compFailEvent);
          try { await queue.publishEvent(execId, compFailEvent); } catch (e) {}
        }
      }

      break; // stop executing further steps on failure
    }
  }

  const record = {
    executionId: execId,
    metadataId: metadata.id || null,
    name: metadata.name || null,
    start,
    end: new Date().toISOString(),
    success: overallSuccess,
    inputs: context.inputs,
    steps: stepsStatus,
    errors,
    outputs: (function(){
      const outs = {};
      for (const k of Object.keys(context.stepsOutputs)) outs[k] = context.stepsOutputs[k].output;
      return outs;
    })()
  };


  try { await appendExecutionRecord(record); } catch (e) { /* ignore */ }

  // mark idempotency key as completed
  try { if (idempotencyKey) await idempotency.complete(idempotencyKey, execId); } catch (e) {}

  const finalEvent = { executionId: execId, type: overallSuccess ? 'execution.succeeded' : 'execution.failed', timestamp: new Date().toISOString(), errors };
  emitter.emit('event', finalEvent);
  try { await queue.publishEvent(execId, finalEvent); } catch (e) { /* best-effort */ }

  const response = {
    success: overallSuccess,
    message: overallSuccess ? 'Execution completed' : 'Execution failed',
    errors,
    outputs: record.outputs,
    steps: stepsStatus,
    executionId: execId
  };

  return response;
}

async function listExecutions() {
  await ensureStorage();
  const raw = await fs.readFile(EXEC_FILE, 'utf8');
  return JSON.parse(raw || '[]');
}

async function getExecution(id) {
  const all = await listExecutions();
  return all.find(e => e.executionId === id) || null;
}

async function saveExecutionRecord(record) {
  await appendExecutionRecord(record);
}

module.exports = { execute, listExecutions, getExecution, emitter, saveExecutionRecord };
