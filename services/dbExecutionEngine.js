const jsonAdapter = require('../lib/dbAdapters/jsonAdapter');
let mysqlAdapter = null;
try { mysqlAdapter = require('../lib/dbAdapters/mysqlAdapter'); } catch (e) { mysqlAdapter = null; }

async function exec(step, params, context, execMeta) {
  // choose adapter: prefer mysqlAdapter if pool present
  const adapter = (global && global.pool && mysqlAdapter) ? mysqlAdapter : jsonAdapter;
  const action = step.action || 'query';
  try {
    // If using mysqlAdapter and global.transactionManager and step requests transactional behavior,
    // use transaction manager and adapter.execWithConnection
    if (adapter && adapter.execWithConnection && global.transactionManager && step && step.transactional && execMeta) {
      const tx = await global.transactionManager.beginTransaction(execMeta.executionId, execMeta.stepId);
      try {
        const res = await adapter.execWithConnection(tx.connection, action, step.resource, params || {});
        await global.transactionManager.commitTransaction(execMeta.executionId, execMeta.stepId);
        return { ok: true, data: res.data || null, meta: res.meta || null };
      } catch (e) {
        try { await global.transactionManager.rollbackTransaction(execMeta.executionId, execMeta.stepId); } catch (er) {}
        return { ok: false, error: e.message || String(e) };
      }
    }

    // non-transactional path — if mysqlAdapter and pool exists, pass pool for convenience
    if (adapter === mysqlAdapter && global.pool) {
      const res = await adapter.exec(action, step.resource, params || {}, global.pool);
      return { ok: res.success !== false, data: res.data || null, meta: res.meta || null, error: res.error };
    }

    // fallback to json adapter
    const res = await jsonAdapter.exec(action, step.resource, params || {});
    return { ok: res.success !== false, data: res.data || null, meta: res.meta || null, error: res.error };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = { exec };
