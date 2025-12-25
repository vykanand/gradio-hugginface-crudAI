/*
  eventBridge.js
  Reusable bridge layer for parsing event payloads and resolving SQL templates.
  Exposes `globalThis.eventBridge` with methods:
    - resolveQuery(query, payload, binding, eventBindings)
    - getValueFromPayload(payload, fieldPath)
    - parseDomainMapping(binding)

  Designed to be framework-agnostic and used across the application.
*/
(function () {
  function getValueFromPayload(payload, fieldPath) {
    if (!payload) return undefined;
    const parts = String(fieldPath || "").split(".");
    let v = payload;
    for (const p of parts) {
      if (v && Object.prototype.hasOwnProperty.call(v, p)) v = v[p];
      else {
        v = undefined;
        break;
      }
    }
    if (v !== undefined) return v;
    return undefined;
  }

  function quoteForSQL(value) {
    if (value === null) return "NULL";
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
    return `'${JSON.stringify(value)}'`;
  }

  function parseDomainMapping(binding) {
    const primary = binding?.payloadSchema?.primaryFields || {};
    const meta = binding?.payloadSchema?.metadataFields || {};
    const domain = meta.domain?.sample || meta.module?.sample || binding?.eventName?.split(":")[0] || null;
    const fieldName = primary.field?.sample || null;
    const valueField = primary.value ? "value" : null;
    return { domain, fieldName, valueField, primaryFields: primary, metadataFields: meta };
  }

  function resolveQuery(query, payload, binding, eventBindings) {
    // Prefer non-throwing resolver: use tryResolveQuery and throw on error for backwards compatibility
    const out = tryResolveQuery(query, payload, binding, eventBindings);
    if (out && out.error) throw new Error(out.error);
    return out.sql;
  }

  // Best-effort, non-throwing resolver that returns the resolved SQL and any missing-field error message.
  // Replaces missing values with a clear marker so callers can surface the actual executed text.
  function tryResolveQuery(query, payload, binding, eventBindings) {
    if (!query) return { sql: query, error: null };
    const bindings = eventBindings || globalThis.eventBindings || [];
    const paramRegex = /\{\{([^\.\}]+)\.([^}]+)\}\}/g;
    let missingErr = null;

    const bestEffort = query.replace(paramRegex, (match, eventName, fieldPath) => {
      let sourceBinding = bindings.find((b) => b.eventName === eventName || b.eventId === eventName);
      if (!sourceBinding && binding && (binding.eventName === eventName || binding.eventId === eventName)) sourceBinding = binding;
      if (!sourceBinding && bindings.length === 1) sourceBinding = bindings[0];

      if (!sourceBinding) {
        missingErr = missingErr || `No event binding found for ${eventName} (used in ${match})`;
        return `/*MISSING_BINDING:${eventName}*/`;
      }

      let value = undefined;
      try { value = getValueFromPayload(payload, fieldPath); } catch (e) { value = undefined; }

      if (value === undefined) {
        const primary = sourceBinding.payloadSchema?.primaryFields || {};
        const meta = sourceBinding.payloadSchema?.metadataFields || {};
        if (primary[fieldPath] && primary[fieldPath].sample !== undefined) value = primary[fieldPath].sample;
        else if (meta[fieldPath] && meta[fieldPath].sample !== undefined) value = meta[fieldPath].sample;

        if (value === undefined && fieldPath === 'value' && primary.field && primary.field.sample) {
          const inferredKey = primary.field.sample;
          const tryPaths = [inferredKey, `detail.${inferredKey}`, `data.${inferredKey}`];
          for (const p of tryPaths) {
            const v2 = getValueFromPayload(payload, p);
            if (v2 !== undefined) { value = v2; break; }
          }
        }
      }

      if (value === undefined) {
        missingErr = missingErr || `Missing field "${fieldPath}" in event payload (looking for ${match})`;
        return `/*MISSING:${eventName}.${fieldPath}*/`;
      }

      return quoteForSQL(value);
    });

    return { sql: bestEffort, error: missingErr };
  }

  // Expose bridge
  globalThis.eventBridge = globalThis.eventBridge || {};
  globalThis.eventBridge.getValueFromPayload = getValueFromPayload;
  globalThis.eventBridge.resolveQuery = resolveQuery;
  globalThis.eventBridge.parseDomainMapping = parseDomainMapping;
  globalThis.eventBridge.quoteForSQL = quoteForSQL;
  globalThis.eventBridge.tryResolveQuery = tryResolveQuery;

  // Backwards compatibility: same name used in builder
  globalThis.eventBridge.resolveQueryWithBindings = function (query, payload, binding) {
    return resolveQuery(query, payload, binding, globalThis.eventBindings);
  };
  globalThis.eventBridge.tryResolveQueryWithBindings = function (query, payload, binding) {
    return tryResolveQuery(query, payload, binding, globalThis.eventBindings);
  };
})();
