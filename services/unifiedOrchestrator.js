const fs = require('fs').promises;
const path = require('path');
const customLogicEngine = require('./customLogicEngine');
let mysqlPool = null;
try { mysqlPool = global.pool || null; } catch (e) { mysqlPool = null; }

const ACTIONS_FILE = path.join(__dirname, '..', 'config', 'metadata', 'actions.json');

async function loadActionsMap() {
  try {
    const raw = await fs.readFile(ACTIONS_FILE, 'utf8');
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch (e) {
    return {};
  }
}

function topoSortNodes(nodes, edges) {
  const idToNode = new Map();
  (nodes || []).forEach((n) => {
    if (n && n.id) idToNode.set(n.id, n);
  });
  const inDegree = new Map();
  idToNode.forEach((_, id) => inDegree.set(id, 0));
  (edges || []).forEach((e) => {
    if (!e || !e.from || !e.to) return;
    if (!idToNode.has(e.to) || !idToNode.has(e.from)) return;
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
  });
  const queue = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(idToNode.get(id));
    (edges || []).forEach((e) => {
      if (e.from === id && idToNode.has(e.to)) {
        const d = (inDegree.get(e.to) || 0) - 1;
        inDegree.set(e.to, d);
        if (d === 0) queue.push(e.to);
      }
    });
  }
  if (order.length !== idToNode.size) {
    throw new Error('Workflow graph contains a cycle or invalid edges');
  }
  return order;
}

function resolvePath(path, runtime) {
  if (!path) return undefined;
  const clean = String(path).trim();
  if (!clean) return undefined;

  // Remove {{ }} if present
  const stripped = clean.replace(/^\{\{|\}\}$/g, '').trim();
  if (!stripped) return undefined;

  const segments = stripped.split('.');
  if (segments.length === 0) return undefined;

  let current = runtime;
  const first = segments[0];

  if (first === 'event') {
    current = runtime.event || (runtime.eventId && runtime.events && runtime.events[runtime.eventId]) || null;
    segments.shift();
  } else if (first === 'vars' || first === 'var') {
    current = runtime.vars || {};
    segments.shift();
  } else if (first === 'actions') {
    current = runtime.actions || {};
    segments.shift();
  } else if (first === 'logics') {
    current = runtime.logics || {};
    segments.shift();
  } else if (first && first.indexOf(':') !== -1) {
    // canonical event id root
    if (runtime.events && runtime.events[first]) {
      current = runtime.events[first];
      segments.shift();
    } else if (runtime.eventId === first && runtime.event) {
      current = runtime.event;
      segments.shift();
    }
  }

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;

    const arrayMatch = segment.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const key = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      current = current[key];
      if (Array.isArray(current)) {
        current = current[index];
      } else {
        return undefined;
      }
    } else {
      current = current[segment];
    }
  }

  return current;
}

function resolveTemplateWithRuntime(template, runtime) {
  if (!template || typeof template !== 'string') return template;
  if (template.indexOf('{{') === -1) return template;

  const regex = /\{\{([^}]+)\}\}/g;
  return template.replace(regex, (match, inner) => {
    const val = resolvePath(inner, runtime);
    return val !== undefined && val !== null ? String(val) : match;
  });
}

function extractFieldValue(obj, fieldPath) {
  if (!obj || !fieldPath) return obj;
  const parts = String(fieldPath)
    .split(/\.|\[|\]/)
    .filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      current = current ? current[parseInt(part, 10)] : undefined;
    } else {
      current = current ? current[part] : undefined;
    }
    if (current === undefined || current === null) return null;
  }
  return current;
}

async function executeWorkflow(definition, options = {}) {
  if (!definition || !Array.isArray(definition.nodes)) {
    throw new Error('Invalid workflow definition: missing nodes');
  }

  const actionsMap = await loadActionsMap();
  const nodes = definition.nodes || [];
  const edges = definition.edges || [];

  const eventId = options.eventId || (definition.trigger && definition.trigger.eventId) || null;
  const eventPayload = options.eventPayload || options.event || null;

  const runtime = {
    workflowId: definition.id || null,
    eventId,
    event: eventPayload,
    events: {},
    actions: {},
    logics: {},
    vars: {},
    steps: {}
  };

  if (eventId && eventPayload) {
    runtime.events[eventId] = eventPayload;
  }

  const orderedNodes = topoSortNodes(nodes, edges);
  const stepResults = [];

  for (const node of orderedNodes) {
    const startedAt = new Date().toISOString();
    let status = 'success';
    let output = null;
    let error = null;

    try {
      if (node.type === 'dbAction') {
        const actionId = node.actionId;
        const action = actionId ? actionsMap[actionId] : null;
        if (!action) throw new Error(`Action not found for node ${node.id}: ${actionId}`);

        const queryTemplate = node.sql || action.query || action.sql;
        if (!queryTemplate) throw new Error(`Action ${actionId} has no query defined`);

        const sql = resolveTemplateWithRuntime(queryTemplate, runtime);

        let rows = [];
        if (mysqlPool && typeof mysqlPool.query === 'function') {
          const result = await mysqlPool.query(sql);
          if (Array.isArray(result)) {
            rows = result[0] || [];
          } else if (result && Array.isArray(result.rows)) {
            rows = result.rows;
          }
        }

        output = rows;
        if (actionId) {
          runtime.actions[actionId] = rows;
        }
      } else if (node.type === 'customLogic') {
        const logicId = node.logicId;
        if (!logicId) throw new Error(`customLogic node ${node.id} missing logicId`);
        const result = await customLogicEngine.execute(logicId, runtime, mysqlPool || null);
        output = result;
        runtime.logics[logicId] = result;
      } else {
        throw new Error(`Unsupported node type: ${node.type}`);
      }

      // Expose full node output as a variable for chaining: {{vars.nodeId...}}
      if (node.id) {
        runtime.vars[node.id] = output;
      }

      // Optional fine-grained output bindings: { varName: "rows[0].field" }
      if (node.outputBindings && typeof node.outputBindings === 'object') {
        Object.keys(node.outputBindings).forEach((varName) => {
          const pathExpr = node.outputBindings[varName];
          const value = pathExpr === '$output' ? output : extractFieldValue(output, pathExpr);
          runtime.vars[varName] = value;
        });
      }
    } catch (e) {
      status = 'failed';
      error = e.message || String(e);
    }

    const finishedAt = new Date().toISOString();
    runtime.steps[node.id] = {
      nodeId: node.id,
      type: node.type,
      output,
      status,
      startedAt,
      finishedAt,
      error
    };
    stepResults.push(runtime.steps[node.id]);

    if (status === 'failed' && !definition.continueOnError) {
      break;
    }
  }

  const success = stepResults.every((s) => s.status === 'success');
  return {
    success,
    workflowId: runtime.workflowId,
    eventId: runtime.eventId,
    outputs: {
      actions: runtime.actions,
      logics: runtime.logics,
      vars: runtime.vars
    },
    steps: stepResults
  };
}

module.exports = { executeWorkflow };
