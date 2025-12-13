const path = require('path');
const fs = require('fs').promises;

const EXAMPLES_DIR = path.join(__dirname, '..', 'metadata', 'examples');

async function listExampleTables() {
  const files = await fs.readdir(EXAMPLES_DIR);
  const tables = [];
  for (const f of files) {
    if (f.endsWith('.json')) {
      try {
        const data = JSON.parse(await fs.readFile(path.join(EXAMPLES_DIR, f), 'utf8'));
        tables.push(data);
      } catch (e) {}
    }
  }
  return tables;
}

function inferSchema(tableObj) {
  const schema = { tableName: tableObj.tableName || 'unknown', columns: [] };
  if (Array.isArray(tableObj.columns) && tableObj.columns.length) return tableObj; // already provided
  const rows = tableObj.rows || [];
  if (!rows.length) return schema;
  const sample = rows[0];
  for (const k of Object.keys(sample)) {
    const v = sample[k];
    const t = typeof v === 'number' ? (Number.isInteger(v)?'integer':'number') : (typeof v === 'string' ? 'string' : typeof v);
    schema.columns.push({ name: k, type: t });
  }
  return schema;
}

async function getModels() {
  const tables = await listExampleTables();
  return tables.map(t => inferSchema(t));
}

module.exports = { getModels };
