const fs = require('fs').promises;
const path = require('path');

const EXAMPLES_DIR = path.join(__dirname, '..', '..', 'metadata', 'examples');

async function readTableFile(tableName) {
  const file = path.join(EXAMPLES_DIR, `${tableName}.json`);
  const data = await fs.readFile(file, 'utf8');
  return JSON.parse(data);
}

async function writeTableFile(tableName, obj) {
  const file = path.join(EXAMPLES_DIR, `${tableName}.json`);
  await fs.writeFile(file, JSON.stringify(obj, null, 2));
}

module.exports = {
  async exec(action, resource, params) {
    // resource is tableName
    const table = await readTableFile(resource);
    let rows = table.rows || [];

    if (action === 'query') {
      // params.filter is a simple object to match equality
      if (!params || !params.filter) return { success: true, data: rows };
      const f = params.filter;
      const result = rows.filter(r => {
        return Object.keys(f).every(k => String(r[k]) === String(f[k]));
      });
      return { success: true, data: result };
    }

    if (action === 'create') {
      const record = params.record || {};
      // infer id
      const maxId = rows.reduce((m, r) => Math.max(m, r.id || 0), 0);
      record.id = record.id || (maxId + 1);
      rows.push(record);
      table.rows = rows;
      await writeTableFile(resource, table);
      return { success: true, data: record };
    }

    if (action === 'update') {
      const { filter, patch } = params;
      let updated = [];
      rows = rows.map(r => {
        const match = Object.keys(filter || {}).every(k => String(r[k]) === String(filter[k]));
        if (match) {
          const nr = { ...r, ...patch };
          updated.push(nr);
          return nr;
        }
        return r;
      });
      table.rows = rows;
      await writeTableFile(resource, table);
      return { success: true, data: updated };
    }

    if (action === 'delete') {
      const { filter } = params;
      const remaining = rows.filter(r => !Object.keys(filter || {}).every(k => String(r[k]) === String(filter[k])));
      const removed = rows.length - remaining.length;
      table.rows = remaining;
      await writeTableFile(resource, table);
      return { success: true, data: { removed } };
    }

    return { success: false, error: 'unknown action' };
  }
};

// Provide execWithConnection for interface compatibility; acts as non-transactional wrapper
module.exports.execWithConnection = async function(connection, action, resource, params) {
  // This JSON adapter doesn't support DB connections; emulate behavior by calling exec
  return module.exports.exec(action, resource, params);
};
