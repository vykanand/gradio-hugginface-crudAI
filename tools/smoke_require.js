// smoke_require.js - require core modules to surface runtime require-time errors
try {
  const wf = require('../services/workflowEngine');
  const exec = require('../services/executionOrchestrator');
  const db = require('../services/dbExecutionEngine');
  const tx = require('../services/transactionManager');
  const q = require('../services/queue');
  console.log('modules required:', typeof wf, typeof exec, typeof db, typeof tx, typeof q);
} catch (e) {
  console.error('require-time error:', e && e.stack ? e.stack : e);
  process.exit(2);
}
console.log('smoke require OK');
