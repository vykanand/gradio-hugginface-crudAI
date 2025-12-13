const path = require('path');
const fs = require('fs').promises;

const STORE_DIR = path.join(__dirname, '..', 'storage', 'orchestrations');
const STORE_FILE = path.join(STORE_DIR, 'idempotency.json');

async function ensureStore() {
  await fs.mkdir(STORE_DIR, { recursive: true });
  try { await fs.access(STORE_FILE); } catch (e) { await fs.writeFile(STORE_FILE, '{}'); }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(STORE_FILE, 'utf8');
  try { return JSON.parse(raw || '{}'); } catch (e) { return {}; }
}

async function writeStore(obj) {
  await ensureStore();
  await fs.writeFile(STORE_FILE, JSON.stringify(obj, null, 2));
}

// Lookup an idempotency key -> executionId mapping. Returns {executionId, status, expiresAt} or null
async function lookup(key) {
  if (!key) return null;
  const store = await readStore();
  const v = store[key];
  if (!v) return null;
  if (v.expiresAt && new Date(v.expiresAt) < new Date()) {
    // expired
    delete store[key];
    await writeStore(store);
    return null;
  }
  return v;
}

// Reserve a key if not present. Returns true if reserved, false if already exists.
async function reserve(key, executionId, ttlMs = 1000 * 60 * 60) {
  if (!key) return false;
  const store = await readStore();
  const now = Date.now();
  const existing = store[key];
  if (existing && (!existing.expiresAt || new Date(existing.expiresAt) > new Date())) return false;
  store[key] = { executionId: executionId || null, status: 'running', reservedAt: new Date(now).toISOString(), expiresAt: new Date(now + (ttlMs||0)).toISOString() };
  await writeStore(store);
  return true;
}

// Mark key as completed and attach executionId
async function complete(key, executionId, ttlMs = 1000 * 60 * 60 * 24) {
  if (!key) return false;
  const store = await readStore();
  const now = Date.now();
  store[key] = { executionId: executionId || null, status: 'complete', completedAt: new Date(now).toISOString(), expiresAt: new Date(now + (ttlMs||0)).toISOString() };
  await writeStore(store);
  return true;
}

// Remove a key
async function remove(key) {
  if (!key) return false;
  const store = await readStore();
  if (store[key]) { delete store[key]; await writeStore(store); }
  return true;
}

// Periodic cleanup of expired entries
let cleanupTimer = null;
function startCleanup(intervalMs = 60 * 1000) {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(async () => {
    try {
      const store = await readStore();
      const now = new Date();
      let changed = false;
      for (const k of Object.keys(store)) {
        const v = store[k];
        if (v && v.expiresAt && new Date(v.expiresAt) < now) { delete store[k]; changed = true; }
      }
      if (changed) await writeStore(store);
    } catch (e) { /* ignore */ }
  }, intervalMs);
}

startCleanup();

module.exports = { lookup, reserve, complete, remove, startCleanup };
