/**
 * Variable Registry System - Production Grade Variable Management
 *
 * Manages dynamic variables from events and database columns:
 * - Registers variables: {{event.user.id}}, {{db.users.email}}
 * - Resolves variable paths to actual values
 * - Provides autocomplete and validation
 * - Handles nested object paths and array indexing
 *
 * Usage:
 *   VariableRegistry.register('{{event.user.id}}', { source: 'event', path: 'user.id' });
 *   const value = VariableRegistry.resolve('{{event.user.id}}', eventData);
 */

globalThis.VariableRegistry = (() => {
  // Internal variable storage
  const variables = new Map();
  const eventVariables = new Map();
  const dbVariables = new Map();

  // Listeners for variable changes
  const listeners = new Set();

  /**
   * Register a variable
   * @param {String} variablePath - Full path like {{event.user.id}}
   * @param {Object} metadata - { source: 'event'|'db', path: 'user.id', table?, column? }
   */
  function register(variablePath, metadata) {
    if (!variablePath || typeof variablePath !== "string") {
      throw new Error("Variable path must be a non-empty string");
    }

    const normalized = normalizeVariablePath(variablePath);
    const source = metadata.source || detectSource(normalized);

    const varData = {
      path: normalized,
      originalPath: variablePath,
      source,
      ...metadata,
      registeredAt: Date.now(),
    };

    variables.set(normalized, varData);

    if (source === "event") {
      eventVariables.set(normalized, varData);
    } else if (source === "db") {
      dbVariables.set(normalized, varData);
    }

    notifyListeners("register", varData);

    return varData;
  }

  /**
   * Register multiple variables
   */
  function registerBulk(variablesArray) {
    return variablesArray.map((v) => {
      if (typeof v === "string") {
        return register(v, {});
      } else {
        return register(v.path, v.metadata || {});
      }
    });
  }

  /**
   * Unregister a variable
   */
  function unregister(variablePath) {
    const normalized = normalizeVariablePath(variablePath);
    const varData = variables.get(normalized);

    if (varData) {
      variables.delete(normalized);
      eventVariables.delete(normalized);
      dbVariables.delete(normalized);
      notifyListeners("unregister", varData);
      return true;
    }

    return false;
  }

  /**
   * Get all registered variables
   */
  function getAll() {
    return Array.from(variables.values());
  }

  /**
   * Get variables by source
   */
  function getBySource(source) {
    if (source === "event") return Array.from(eventVariables.values());
    if (source === "db") return Array.from(dbVariables.values());
    return [];
  }

  /**
   * Resolve variable path to actual value
   * @param {String} variablePath - Variable path like {{event.user.id}}
   * @param {Object} context - Data context { event, db }
   * @returns {*} - Resolved value
   */
  function resolve(variablePath, context = {}) {
    const normalized = normalizeVariablePath(variablePath);
    const varData = variables.get(normalized);

    if (!varData) {
      console.warn(`Variable not registered: ${variablePath}`);
      // Try to resolve anyway
      return resolvePathDirect(normalized, context);
    }

    return resolvePathDirect(normalized, context);
  }

  /**
   * Resolve path directly from context
   */
  function resolvePathDirect(path, context) {
    // Remove {{ }} if present
    const cleanPath = path.replace(/^\{\{|\}\}$/g, "").trim();

    // Split into segments
    const segments = cleanPath.split(".");

    if (segments.length === 0) return undefined;

    // Determine root object
    let current = context;

    // Handle special roots
    if (segments[0] === "event") {
      current = context.event || context;
      segments.shift();
    } else if (segments[0] === "db") {
      current = context.db || context;
      segments.shift();
    } else if (segments[0] && segments[0].includes(":")) {
      // Support canonical event identifiers as root (e.g. appsthink_crm:name:added)
      // Resolve against the provided context.event payload when available.
      if (context && context.event) {
        // Use payload as base so {{canonical.field}} maps to event.payload.field
        current = context.event.payload !== undefined ? context.event.payload : context.event;
        segments.shift();
      }
    }

    // Traverse path
    for (const segment of segments) {
      if (current === null || current === undefined) {
        return undefined;
      }

      // Handle array indexing: user[0]
      const arrayMatch = segment.match(/^(.+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, key, index] = arrayMatch;
        current = current[key];
        if (Array.isArray(current)) {
          current = current[parseInt(index, 10)];
        } else {
          return undefined;
        }
      } else {
        current = current[segment];
      }
    }

    return current;
  }

  /**
   * Resolve all variables in a string template
   * @param {String} template - String with variables like "User {{event.user.name}} ordered {{db.orders.total}}"
   * @param {Object} context - Data context
   * @returns {String} - Resolved string
   */
  function resolveTemplate(template, context = {}) {
    if (!template || typeof template !== "string") return template;

    // Find all {{variable}} patterns
    const regex = /\{\{([^}]+)\}\}/g;

    return template.replace(regex, (match, path) => {
      const value = resolve(`{{${path}}}`, context);
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Validate variable path syntax
   */
  function validate(variablePath) {
    const errors = [];

    if (!variablePath || typeof variablePath !== "string") {
      errors.push("Variable path must be a non-empty string");
      return { valid: false, errors };
    }

    // Check for {{ }}
    if (!variablePath.startsWith("{{") || !variablePath.endsWith("}}")) {
      errors.push("Variable must be wrapped in {{ }}");
    }

    // Check path structure
    const cleanPath = variablePath.replace(/^\{\{|\}\}$/g, "").trim();

    if (cleanPath.length === 0) {
      errors.push("Variable path cannot be empty");
    }

    // Check for valid characters
    if (!/^[a-zA-Z0-9_.\[\]]+$/.test(cleanPath)) {
      errors.push("Variable path contains invalid characters");
    }

    // Check for valid source prefix
    const firstSegment = cleanPath.split(".")[0].split("[")[0];
    if (!["event", "db"].includes(firstSegment)) {
      errors.push('Variable must start with "event" or "db"');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Extract all variables from a string
   */
  function extractVariables(text) {
    if (!text || typeof text !== "string") return [];

    const regex = /\{\{([^}]+)\}\}/g;
    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      matches.push(`{{${match[1]}}}`);
    }

    return [...new Set(matches)]; // Remove duplicates
  }

  /**
   * Get autocomplete suggestions
   */
  function getAutocompleteSuggestions(prefix = "", source = null) {
    let vars = getAll();

    if (source) {
      vars = getBySource(source);
    }

    if (!prefix) return vars;

    const normalizedPrefix = prefix.toLowerCase();

    return vars.filter(
      (v) =>
        v.path.toLowerCase().includes(normalizedPrefix) ||
        v.originalPath.toLowerCase().includes(normalizedPrefix),
    );
  }

  /**
   * Create a variable picker UI widget
   */
  function createPickerWidget(targetInput, options = {}) {
    const { onSelect, sources = ["event", "db"] } = options;

    const widget = document.createElement("div");
    widget.style.cssText = `
      position: absolute;
      background: white;
      border: 1px solid #e1e8ed;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      max-height: 300px;
      overflow-y: auto;
      z-index: 9999;
      display: none;
    `;

    const updateSuggestions = (filter = "") => {
      const suggestions = getAutocompleteSuggestions(filter);

      widget.innerHTML = "";

      if (suggestions.length === 0) {
        widget.innerHTML =
          '<div style="padding:12px;color:#8899a6;text-align:center">No variables found</div>';
        widget.style.display = "block";
        return;
      }

      suggestions.forEach((varData) => {
        const item = document.createElement("div");
        item.style.cssText = `
          padding: 8px 12px;
          cursor: pointer;
          transition: background 0.2s;
          border-bottom: 1px solid #f0f0f0;
        `;
        item.onmouseenter = () => (item.style.background = "#f0f7ff");
        item.onmouseleave = () => (item.style.background = "white");

        const pathEl = document.createElement("code");
        pathEl.style.cssText = "font-size: 0.85rem; color: #1f4b78";
        pathEl.textContent = varData.originalPath;

        const sourceEl = document.createElement("span");
        sourceEl.style.cssText =
          "margin-left: 8px; font-size: 0.75rem; color: #8899a6";
        sourceEl.textContent = varData.source === "event" ? "📊" : "🗄️";

        item.appendChild(pathEl);
        item.appendChild(sourceEl);

        item.addEventListener("click", () => {
          if (onSelect) onSelect(varData.originalPath);
          widget.style.display = "none";
        });

        widget.appendChild(item);
      });

      widget.style.display = "block";
    };

    // Position widget below input
    const positionWidget = () => {
      const rect = targetInput.getBoundingClientRect();
      widget.style.left = rect.left + "px";
      widget.style.top = rect.bottom + 4 + "px";
      widget.style.width = rect.width + "px";
    };

    // Attach to input
    targetInput.addEventListener("focus", () => {
      positionWidget();
      updateSuggestions();
    });

    targetInput.addEventListener("input", () => {
      positionWidget();
      updateSuggestions(targetInput.value);
    });

    targetInput.addEventListener("blur", () => {
      setTimeout(() => {
        widget.style.display = "none";
      }, 200);
    });

    document.body.appendChild(widget);

    return widget;
  }

  /**
   * Normalize variable path
   */
  function normalizeVariablePath(path) {
    if (!path) return "";

    // Ensure {{ }} wrapping
    let normalized = path.trim();
    if (!normalized.startsWith("{{")) normalized = "{{" + normalized;
    if (!normalized.endsWith("}}")) normalized = normalized + "}}";

    return normalized;
  }

  /**
   * Detect variable source from path
   */
  function detectSource(path) {
    const cleanPath = path.replace(/^\{\{|\}\}$/g, "").trim();

    if (cleanPath.startsWith("event.") || cleanPath === "event")
      return "event";
    if (cleanPath.startsWith("db.") || cleanPath === "db") return "db";

    return "unknown";
  }

  /**
   * Add change listener
   */
  function addListener(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }

  /**
   * Notify listeners
   */
  function notifyListeners(action, data) {
    listeners.forEach((listener) => {
      try {
        listener(action, data);
      } catch (e) {
        console.error("Listener error:", e);
      }
    });
  }

  /**
   * Clear all variables
   */
  function clear() {
    variables.clear();
    eventVariables.clear();
    dbVariables.clear();
    notifyListeners("clear", null);
  }

  /**
   * Export variables to JSON
   */
  function exportToJSON() {
    return {
      variables: Array.from(variables.entries()),
      timestamp: Date.now(),
    };
  }

  /**
   * Import variables from JSON
   */
  function importFromJSON(data) {
    if (!data || !Array.isArray(data.variables)) {
      throw new Error("Invalid import data");
    }

    clear();

    data.variables.forEach(([path, metadata]) => {
      register(path, metadata);
    });

    return variables.size;
  }

  // Public API
  return {
    register,
    registerBulk,
    unregister,
    getAll,
    getBySource,
    resolve,
    resolveTemplate,
    validate,
    extractVariables,
    getAutocompleteSuggestions,
    createPickerWidget,
    addListener,
    clear,
    exportToJSON,
    importFromJSON,
  };
})();

// Export for global use
if (typeof module !== "undefined" && module.exports) {
  module.exports = VariableRegistry;
}
