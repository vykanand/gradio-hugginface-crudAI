const fs = require("fs").promises;
const path = require("path");
const { resolveQuery } = require("../lib/eventBridge");

const LOGIC_FILE = path.join(__dirname, "../config/metadata/custom-logic.json");

class CustomLogicEngine {
  constructor() {
    this.logics = [];
    this.init();
  }

  async init() {
    try {
      const exists = await fs
        .access(LOGIC_FILE)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        await this.save();
      } else {
        const content = await fs.readFile(LOGIC_FILE, "utf8");
        this.logics = JSON.parse(content);
      }
    } catch (e) {
      console.warn("CustomLogicEngine init error:", e);
      this.logics = [];
    }
  }

  async save() {
    try {
      await fs.writeFile(LOGIC_FILE, JSON.stringify(this.logics, null, 2), "utf8");
    } catch (e) {
      console.error("Failed to save custom logic:", e);
      throw e;
    }
  }

  getLogics() {
    return this.logics;
  }

  getLogic(id) {
    return this.logics.find((l) => l.id === id);
  }

  async addLogic(logic) {
    this.logics.push(logic);
    await this.save();
    return logic;
  }

  async updateLogic(id, updates) {
    const idx = this.logics.findIndex((l) => l.id === id);
    if (idx === -1) {
      throw new Error("Logic not found");
    }
    this.logics[idx] = { ...this.logics[idx], ...updates, updatedAt: new Date().toISOString() };
    await this.save();
    return this.logics[idx];
  }

  async deleteLogic(id) {
    const idx = this.logics.findIndex((l) => l.id === id);
    if (idx === -1) {
      throw new Error("Logic not found");
    }
    this.logics.splice(idx, 1);
    await this.save();
    return true;
  }

  /**
   * Execute custom logic function with provided inputs
   * @param {string} logicId - ID of the logic to execute
   * @param {object} context - Execution context with event data, action results, etc.
   * @param {object} dbConnection - MySQL connection for fetching action results
   * @returns {Promise} - Result of the custom logic function
   */
  async execute(logicId, context, dbConnection = null) {
    const logic = this.getLogic(logicId);
    if (!logic) {
      throw new Error(`Logic ${logicId} not found`);
    }

    // Build inputs object by resolving event and action references
    const inputs = {};

    for (const input of logic.inputs || []) {
      try {
        if (input.type === "event") {
          // Extract value from event payload
          const eventData = context.events?.[input.eventId] || context.event || {};
          const evName = input.eventName || input.eventId || input.source;
          // if alias provided (backwards compat), use it
          if (input.alias) {
            inputs[input.alias] = this.extractFieldValue(eventData, input.field);
          } else {
            // nested structure: inputs.eventName or inputs.eventName.field
            inputs[evName] = inputs[evName] || {};
            if (!input.field) {
              // full event object
              inputs[evName] = eventData;
            } else {
              inputs[evName][input.field] = this.extractFieldValue(eventData, input.field);
            }
          }
        } else if (input.type === "action") {
          // Execute action or retrieve cached result
          let actionResult = context.actions?.[input.actionId];
          
          if (!actionResult && dbConnection && context.actionMetadata?.[input.actionId]) {
            // Execute action SQL to get result
            const actionMeta = context.actionMetadata[input.actionId];
            if (actionMeta.sql) {
              try {
                const resolvedSQL = resolveQuery(
                  actionMeta.sql,
                  context.event || {},
                  actionMeta.binding || {},
                  context.eventBindings || {}
                );
                const [rows] = await dbConnection.query(resolvedSQL);
                actionResult = rows;
              } catch (e) {
                console.error(`Failed to execute action ${input.actionId}:`, e);
                actionResult = null;
              }
            }
          }

          // Handle parser paths (new feature)
          if (input.parserPath && input.parserVarName) {
            if (input.alias) {
              inputs[input.alias] = this.extractFieldValue(actionResult, input.parserPath);
            } else {
              inputs.actions = inputs.actions || {};
              const aid = input.actionId || input.actionName || input.source;
              inputs.actions[aid] = inputs.actions[aid] || {};
              inputs.actions[aid][input.parserVarName] = this.extractFieldValue(actionResult, input.parserPath);
            }
          } else if (input.alias) {
            inputs[input.alias] = input.field
              ? this.extractFieldValue(actionResult, input.field)
              : actionResult;
          } else {
            inputs.actions = inputs.actions || {};
            const aid = input.actionId || input.actionName || input.source;
            if (input.field) {
              inputs.actions[aid] = this.extractFieldValue(actionResult, input.field);
            } else {
              inputs.actions[aid] = actionResult;
            }
          }
        }
      } catch (e) {
        const name = input.alias || input.eventName || input.eventId || input.actionId || input.actionName || 'unknown';
        console.warn(`Failed to resolve input ${name}:`, e);
        if (input.alias) inputs[input.alias] = null;
        else if (input.type === 'event') {
          const evName = input.eventName || input.eventId || input.source;
          inputs[evName] = inputs[evName] || null;
        } else if (input.type === 'action') {
          inputs.actions = inputs.actions || {};
          const aid = input.actionId || input.actionName || input.source;
          inputs.actions[aid] = null;
        }
      }
    }

    // Execute the function with inputs
    try {
      const func = new Function("inputs", logic.functionCode);
      const result = func(inputs);
      
      // Support both sync and async functions
      if (result && typeof result.then === "function") {
        return await result;
      }
      return result;
    } catch (e) {
      throw new Error(`Execution error in ${logic.name}: ${e.message}`);
    }
  }

  /**
   * Extract nested field value from object using dot notation and array indices
   * @param {object} obj - Source object
  * @param {string} fieldPath - Path like "phone_number", "payload.phone_number", "rows[0].user.name"
   * @returns {any} - Extracted value or null
   */
  extractFieldValue(obj, fieldPath) {
    if (!obj || !fieldPath) return obj;

    // Split path by dots and brackets: "rows[0].user.name" -> ["rows", "[0]", "user", "name"]
    const parts = fieldPath.split(/\.|\[|\]/).filter(Boolean);
    let current = obj;

    for (const part of parts) {
      // Check if part is a numeric array index (from bracket notation)
      if (/^\d+$/.test(part)) {
        current = current?.[parseInt(part)];
      } else {
        current = current?.[part];
      }

      if (current === undefined || current === null) {
        return null;
      }
    }

    return current;
  }

  /**
   * Validate custom logic function code
   * @param {string} functionCode - Function code to validate
   * @param {array} inputs - Array of input definitions
   * @returns {object} - { valid: boolean, error?: string }
   */
  validateFunction(functionCode, inputs = []) {
    try {
      // Check if function code is empty
      if (!functionCode || !functionCode.trim()) {
        return { valid: false, error: "Function code cannot be empty" };
      }

      // Try to create the function
      new Function("inputs", functionCode);

      // Check if function references only allowed inputs
      // Allowed first-level input keys: event names and 'actions'
      const allowedFirstLevel = new Set();
      (inputs || []).forEach((i) => {
        if (i.type === 'event') allowedFirstLevel.add(i.eventName || i.eventId || i.source);
        if (i.type === 'action') allowedFirstLevel.add('actions');
        if (i.alias) allowedFirstLevel.add(i.alias);
      });
      const inputsRegex = /inputs\.(\w+)/g;
      let match;
      const referencedVars = new Set();

      while ((match = inputsRegex.exec(functionCode)) !== null) {
        referencedVars.add(match[1]);
      }

      const invalidVars = [...referencedVars].filter((v) => !allowedFirstLevel.has(v));
      if (invalidVars.length > 0) {
        return {
          valid: false,
          error: `Function references undefined inputs: ${invalidVars.join(", ")}`,
        };
      }

      return { valid: true };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }
}

module.exports = new CustomLogicEngine();
