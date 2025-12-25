/*
  Centralized Event Registry
  - Maintains a list of discovered event bindings with example payloads and a simple payloadSchema
  - Exposes helper to read values via friendly dot/bracket notation
  - Keeps `globalThis.eventBindings` in sync for use by eventBridge and other modules
*/
(function () {
  const bindings = []; // array of { eventName, module, examplePayload, payloadSchema }
  let db = null;
  const path = require('path');
  const level = (() => { try { return require('level'); } catch (e) { return null; } })();
  const DB_PATH = process.env.EVENT_REGISTRY_DB || path.join(__dirname, '..', 'storage', 'event_registry_db');

  function _typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  function _flatten(obj, maxDepth = 6, prefix = '') {
    const out = {};
    if (obj === null || obj === undefined) return out;
    if (maxDepth <= 0) return out;
    if (typeof obj !== 'object') return out;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const path = prefix ? `${prefix}.${k}` : k;
      out[path] = v;
      if (v && typeof v === 'object') {
        if (Array.isArray(v)) {
          if (v.length > 0 && typeof v[0] === 'object') {
            const nested = _flatten(v[0], maxDepth - 1, `${path}[0]`);
            Object.assign(out, nested);
          }
        } else {
          const nested = _flatten(v, maxDepth - 1, path);
          Object.assign(out, nested);
        }
      }
    }
    return out;
  }

  function buildPayloadSchema(payload) {
    const primaryFields = {};
    try {
      const root = payload || {};
      const flat = _flatten(root, 6, '');
      // include top-level keys explicitly
      Object.keys(root).forEach((k) => {
        const v = root[k];
        primaryFields[k] = { sample: v, path: k, type: _typeOf(v) };
      });
      // include flattened nested keys
      Object.keys(flat).forEach((p) => {
        if (primaryFields[p]) return; // preserve top-level mapping
        const v = flat[p];
        primaryFields[p] = { sample: v, path: p, type: _typeOf(v) };
      });
    } catch (e) {}
    return { primaryFields, metadataFields: {} };
  }

  function normalizeEventName(evt) {
    if (!evt) return null;
    return (evt.canonicalEvent || evt.event || evt.name || evt.type || '').toString();
  }

  function ingestEvent(evt) {
    try {
      if (!evt) return null;
      const name = normalizeEventName(evt);
      const module = evt.module || evt.domain || (name ? String(name).split(':')[0] : 'unknown');
      const payload = (evt.payload !== undefined) ? evt.payload : (evt.detail !== undefined ? evt.detail : (evt || {}));

      if (!name) return null;

      // find existing binding
      let b = bindings.find((x) => x.eventName === name);
      if (!b) {
        b = { eventName: name, module, examplePayload: payload, payloadSchema: buildPayloadSchema(payload), seen: Date.now() };
        bindings.push(b);
      } else {
        try {
          const merged = Object.assign({}, b.examplePayload || {}, payload || {});
          b.examplePayload = merged;
          b.payloadSchema = buildPayloadSchema(b.examplePayload || payload || {});
          b.seen = Date.now();
        } catch (e) {}
      }

      // persist binding (best-effort)
      try {
        if (level && !db) {
          db = level(DB_PATH, { valueEncoding: 'json' });
        }
        if (db) {
          const key = `binding:${name}`;
          db.put(key, b).catch(() => {});
        }
      } catch (e) {}

      // expose globally for eventBridge and other consumers
      try { globalThis.eventBindings = bindings.slice(); } catch (e) {}
      // also expose a friendly registry object
      try { globalThis.eventRegistry = globalThis.eventRegistry || {}; globalThis.eventRegistry.getBindings = () => bindings.slice(); } catch (e) {}

      return b;
    } catch (e) { return null; }
  }

  function getBindings() { return bindings.slice(); }

  function getBindingByName(name) {
    if (!name) return null;
    return bindings.find((b) => b.eventName === name || b.eventId === name) || null;
  }

  // friendly accessor: supports dot and bracket notation (e.g. 'customer.address[0].street')
  function getValue(payload, path) {
    if (!path) return undefined;
    const segments = [];
    // split on dot but keep bracket indices
    const regex = /([^.\[\]]+)|(\[\d+\])/g;
    let m;
    while ((m = regex.exec(path)) !== null) {
      if (m[1]) segments.push(m[1]);
      else if (m[2]) segments.push(m[2].slice(1, -1));
    }
    let cur = payload;
    for (const s of segments) {
      if (cur === undefined || cur === null) return undefined;
      if (Object.prototype.hasOwnProperty.call(cur, s)) cur = cur[s];
      else {
        // try numeric index on arrays
        const idx = Number(s);
        if (!Number.isNaN(idx) && Array.isArray(cur) && cur.length > idx) cur = cur[idx];
        else return undefined;
      }
    }
    return cur;
  }

  function init(opts) {
    try {
      // initialize persistent DB if available
      try {
        if (level && !db) db = level(DB_PATH, { valueEncoding: 'json' });
      } catch (e) { db = null; }

      if (db) {
        // load existing bindings from DB into memory (non-blocking)
        const stream = db.createReadStream();
        stream.on('data', ({ key, value }) => {
          try {
            if (key && key.indexOf('binding:') === 0) {
              bindings.push(value);
            }
          } catch (e) {}
        });
        stream.on('error', () => {});
      }

      if (opts && opts.existingRegistry) {
        const reg = opts.existingRegistry || {};
        Object.keys(reg).forEach((mod) => {
          const evs = reg[mod] && reg[mod].events ? Object.keys(reg[mod].events || {}) : [];
          evs.forEach((evName) => {
            const fake = { module: mod, canonicalEvent: evName, payload: {} };
            ingestEvent(fake);
          });
        });
      }
    } catch (e) {}
  }

  async function searchBindings(q) {
    if (!q) return [];
    q = q.toString();
    const out = [];
    const lower = q.toLowerCase();
    for (const b of bindings) {
      if (!b) continue;
      if ((b.eventName || '').toLowerCase().indexOf(lower) !== -1) out.push(b);
      else if ((b.module || '').toLowerCase().indexOf(lower) !== -1) out.push(b);
      else {
        // search flattened keys
        const flat = _flatten(b.examplePayload || {}, 6, '');
        for (const k of Object.keys(flat)) {
          if (k.toLowerCase().indexOf(lower) !== -1) { out.push(b); break; }
        }
      }
    }
    return out;
  }

  function extractSelectedFields(payload, selectedFields) {
    if (!selectedFields || !Array.isArray(selectedFields)) return {};
    const out = {};
    for (const f of selectedFields) {
      try {
        const val = getValue(payload, f);
        out[f] = val === undefined ? null : val;
      } catch (e) { out[f] = null; }
    }
    return out;
  }

  // Removal helpers for consistency when events are purged
  function removeBinding(name) {
    if (!name) return false;
    const idx = bindings.findIndex((b) => b.eventName === name || b.eventId === name);
    if (idx === -1) return false;
    const b = bindings.splice(idx, 1)[0];
    try {
      if (db) db.del(`binding:${name}`).catch(()=>{});
    } catch (e) {}
    try { globalThis.eventBindings = bindings.slice(); } catch (e) {}
    return true;
  }

  function removeBindingsByModule(module) {
    if (!module) return 0;
    let removed = 0;
    for (let i = bindings.length - 1; i >= 0; i--) {
      if (bindings[i].module === module) {
        const name = bindings[i].eventName;
        bindings.splice(i, 1);
        try { if (db) db.del(`binding:${name}`).catch(()=>{}); } catch (e) {}
        removed++;
      }
    }
    try { globalThis.eventBindings = bindings.slice(); } catch (e) {}
    return removed;
  }

  function clear() {
    const count = bindings.length;
    bindings.length = 0;
    try {
      if (db) {
        // best-effort: iterate keys and delete binding: prefixed entries
        const stream = db.createReadStream();
        stream.on('data', ({ key }) => { try { if (key && key.indexOf('binding:') === 0) db.del(key).catch(()=>{}); } catch(e){} });
        stream.on('error', ()=>{});
      }
    } catch (e) {}
    try { globalThis.eventBindings = bindings.slice(); } catch (e) {}
    return count;
  }

  // reconciliation: compare persisted bindings with in-memory and sync
  async function reconcile() {
    const summary = { loaded: 0, removed: 0, added: 0, errors: [] };
    try {
      if (!level) return { ok: false, reason: 'level-not-available' };
      if (!db) db = level(DB_PATH, { valueEncoding: 'json' });
      const seen = new Set();
      // load persisted bindings
      await new Promise((resolve) => {
        const stream = db.createReadStream();
        stream.on('data', ({ key, value }) => {
          try {
            if (!key || key.indexOf('binding:') !== 0) return;
            const name = key.slice(8);
            seen.add(name);
            const existing = bindings.find((b) => b.eventName === name);
            if (!existing) {
              bindings.push(value);
              summary.added++;
            } else {
              // refresh in-memory from persisted
              Object.assign(existing, value);
            }
            summary.loaded++;
          } catch (e) { summary.errors.push(String(e)); }
        });
        stream.on('error', (e) => { summary.errors.push(String(e)); resolve(); });
        stream.on('end', () => resolve());
      });

      // remove in-memory entries that no longer exist in DB
      for (let i = bindings.length - 1; i >= 0; i--) {
        try {
          const b = bindings[i];
          if (!b || !b.eventName) { bindings.splice(i, 1); summary.removed++; continue; }
          if (!seen.has(b.eventName)) { bindings.splice(i, 1); summary.removed++; }
        } catch (e) { summary.errors.push(String(e)); }
      }

      try { globalThis.eventBindings = bindings.slice(); } catch (e) { summary.errors.push(String(e)); }
    } catch (e) {
      summary.errors.push(String(e));
    }
    return { ok: true, summary };
  }

  // export
  const api = { ingestEvent, getBindings, getBindingByName, getValue, init, searchBindings, extractSelectedFields, removeBinding, removeBindingsByModule, clear, reconcile };
  try { module.exports = api; } catch (e) { /* ignore in browser */ }
  try { globalThis.eventRegistry = api; globalThis.eventBindings = globalThis.eventBindings || []; } catch (e) {}
})();
