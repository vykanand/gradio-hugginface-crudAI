const fs = require('fs').promises;
const path = require('path');

const AUDIT_DIR = path.join(__dirname, '..', 'storage', 'orchestrations');
const AUDIT_FILE = path.join(AUDIT_DIR, 'audit.json');

async function ensureAudit() {
  await fs.mkdir(AUDIT_DIR, { recursive: true });
  try { await fs.access(AUDIT_FILE); } catch (e) { await fs.writeFile(AUDIT_FILE, '[]'); }
}

async function write(entry) {
  try {
    await ensureAudit();
    const raw = await fs.readFile(AUDIT_FILE, 'utf8');
    const arr = JSON.parse(raw || '[]');
    arr.push(Object.assign({ ts: new Date().toISOString() }, entry));
    await fs.writeFile(AUDIT_FILE, JSON.stringify(arr, null, 2));
  } catch (e) {
    console.error('[audit] write failed', e && e.message ? e.message : e);
  }
}

module.exports = { write };
