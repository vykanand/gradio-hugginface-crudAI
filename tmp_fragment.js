
  // Load reusable explorer (if available)
  (function ensureExplorerLoaded() {
    if (!window.createExplorer) {
      const s = document.createElement("script");
      s.src = "/assets/explorer.js";
      s.onload = () => {
        /* noop */
      };
      document.head.appendChild(s);
    }
    if (!window.renderConnectInputPills) {
      const s2 = document.createElement("script");
      s2.src = "/assets/connect-inputs.js";
      s2.onload = () => {
        /* noop */
      };
      document.head.appendChild(s2);
    }
  })();

  // Legacy modal and action-test helpers removed to simplify Custom Logic tab.
  // Input selection now uses Connect-node attachments and the attachInputsFromConnectNodes() helper.
  // Initialize connect inputs area using shared renderer when available
  function initCustomLogicConnectInputs() {
    try {
      const refresh = () => {
        try {
          if (!currentLogic || !currentLogic.id) return;
          if (window.renderConnectInputPills) {
            window.renderConnectInputPills({
              containerId: "custom-logic-connect-inputs",
              targetId: currentLogic.id,
              title: "Connect Inputs (attach to this logic)",
              onAttach: (entry, node) => {
                try {
                  const exists = logicInputs.some(
                    (li) =>
                      (li.actionId && li.actionId === entry.actionId) ||
                      (li.actionName && li.actionName === entry.actionName)
                  );
                  if (!exists) logicInputs.push(entry);
                  renderInputsList();
                  updateAvailableVars();
                  showToast &&
                    showToast("Attached input from Connect node", "success");
                } catch (e) {
                  console.warn("onAttach failed", e);
                }
              },
            });
          } else {
            const el = document.getElementById("custom-logic-connect-inputs");
            if (el)
              el.innerHTML =
                '<div class="muted">Connect inputs unavailable</div>';
          }
        } catch (e) {
          console.warn("refresh connect inputs failed", e);
        }
      };

      window.refreshCustomLogicConnectInputs = refresh;
      refresh();
    } catch (e) {
      console.warn("initCustomLogicConnectInputs failed", e);
    }
  }

  // Global attach handler so other renderers can call into the custom logic editor
  try {
    window.onAttachConnectInputForLogic = function (entry, node) {
      try {
        if (!currentLogic) { showToast && showToast('No logic selected', 'info'); return; }
        const exists = logicInputs.some(li => (li.actionId && li.actionId === entry.actionId) || (li.actionName && li.actionName === entry.actionName));
        if (!exists) logicInputs.push(entry);
        try { renderInputsList(); } catch(e){}
        try { refreshInputShapePreview(); } catch(e){}
        showToast && showToast('Attached input to logic', 'success');
      } catch (e) { console.warn('onAttachConnectInputForLogic failed', e); }
    };
  } catch (e) { /* ignore */ }

  async function testCustomLogic() {
    try {
      const functionCode =
        (document.getElementById("logic-function") &&
          document.getElementById("logic-function").value) ||
        "";
      const testDataStr =
        (document.getElementById("logic-test-data") &&
          document.getElementById("logic-test-data").value) ||
        "";
      let testData = {};
      try {
        testData = testDataStr ? JSON.parse(testDataStr) : {};
      } catch (e) {
        testData = testDataStr;
      }

      // Update variable preview before execution
      try {
        showVariablePreviewFromTestData(testData);
      } catch (e) {}

      // Execute user code with parsed inputs
      const result = await executeCustomLogic(functionCode, testData);

      // persist last test result in-memory so user can save it with the logic
      try {
        window._lastCustomLogicTestResult = result;
        if (currentLogic) currentLogic._lastTestResult = result;
      } catch (e) {}

      const resultEl = document.getElementById("logic-test-result");
      resultEl.style.display = "block";
      resultEl.style.background = "#d4edda";
      resultEl.style.border = "1px solid #c3e6cb";
      resultEl.style.color = "#155724";

      const resultType = Array.isArray(result) ? "array" : typeof result;
      const resultPreview = JSON.stringify(result, null, 2);

      resultEl.innerHTML =
        `<div style="margin-bottom: 8px;"><strong>✅ Execution Successful</strong></div>` +
        `<div style="font-size: 0.85rem; color: #0c5a3a; margin-bottom: 4px;">Return Type: ${resultType}</div>` +
        `<pre style="margin-top: 4px; background: #f8f9fa; padding: 8px; border-radius: 4px; color: #14171a; max-height: 300px; overflow: auto;">${resultPreview}</pre>`;
    } catch (e) {
      const resultEl = document.getElementById("logic-test-result");
      resultEl.style.display = "block";
      resultEl.style.background = "#f8d7da";
      resultEl.style.border = "1px solid #f5c6cb";
      resultEl.style.color = "#721c24";

      const errorDetails = e.stack
        ? `<pre style="margin-top: 8px; background: #fff; padding: 8px; border-radius: 4px; font-size: 0.75rem; overflow: auto; max-height: 200px;">${e.stack}</pre>`
        : "";

      resultEl.innerHTML =
        `<div style="margin-bottom: 8px;"><strong>❌ Execution Failed</strong></div>` +
        `<div style="font-size: 0.9rem; margin-bottom: 4px;">${e.message}</div>` +
        errorDetails;
    }
  }

  // ==================== BULLETPROOF INPUT PARSER ====================

  /**
   * Parse and validate inputs for execution with 100% reliability
   * This function ensures the inputs object EXACTLY matches the schema
   */
  function parseInputsForExecution(rawContext, inputDefinitions) {
    const inputs = {};
    const errors = [];
    const warnings = [];

    try {
      // Build schema for validation
      const schema = buildInputShapeSchema(inputDefinitions);

      // Process event inputs
      const eventInputs = inputDefinitions.filter((i) => i.type === "event");
      eventInputs.forEach((inp) => {
        try {
          const eventVarName = normalizeVarName(inp.eventName || inp.eventId);
          const eventId = inp.eventId || inp.eventName;

          // Find event data in raw context
          let eventData = null;
          if (rawContext.events && rawContext.events[eventId]) {
            eventData = rawContext.events[eventId];
          } else if (rawContext[eventVarName]) {
            eventData = rawContext[eventVarName];
          } else if (rawContext[eventId]) {
            eventData = rawContext[eventId];
          } else if (rawContext[inp.eventName]) {
            eventData = rawContext[inp.eventName];
          }

          if (eventData === null || eventData === undefined) {
            warnings.push(`Event data not found for: ${eventVarName}`);
            eventData = {};
          }

          // Initialize event object in inputs
          if (!inputs[eventVarName]) {
            inputs[eventVarName] = {};
          }

          // Extract specific field or use full event
          if (inp.field) {
            const fieldVarName = normalizeVarName(inp.field);
            const value = extractFieldValue(eventData, inp.field);
            inputs[eventVarName][fieldVarName] = value;
          } else {
            inputs[eventVarName] = eventData;
          }
        } catch (e) {
          errors.push(
            `Failed to parse event input ${inp.eventName}: ${e.message}`,
          );
        }
      });

      // Process action inputs
      const actionInputs = inputDefinitions.filter((i) => i.type === "action");
      if (actionInputs.length > 0) {
        inputs.actions = inputs.actions || {};

        actionInputs.forEach((inp) => {
          try {
            const actionVarName = normalizeVarName(inp.actionId);
            const actionId = inp.actionId;

            // Find action data in raw context
            let actionData = null;
            if (rawContext.actions && rawContext.actions[actionId]) {
              actionData = rawContext.actions[actionId];
            } else if (
              rawContext.actions &&
              rawContext.actions[actionVarName]
            ) {
              actionData = rawContext.actions[actionVarName];
            } else if (rawContext[actionVarName]) {
              actionData = rawContext[actionVarName];
            } else if (rawContext[actionId]) {
              actionData = rawContext[actionId];
            }

            if (actionData === null || actionData === undefined) {
              warnings.push(`Action data not found for: ${actionVarName}`);
              actionData = {};
            }

            // Initialize action object in inputs.actions
            if (!inputs.actions[actionVarName]) {
              inputs.actions[actionVarName] = {};
            }

            // Extract specific field, parser path, or use full action
            if (inp.parserPath && inp.parserVarName) {
              const parserVarName = normalizeVarName(inp.parserVarName);
              const value = extractFieldValue(actionData, inp.parserPath);
              inputs.actions[actionVarName][parserVarName] = value;
            } else if (inp.field) {
              const fieldVarName = normalizeVarName(inp.field);
              const value = extractFieldValue(actionData, inp.field);
              inputs.actions[actionVarName][fieldVarName] = value;
            } else {
              inputs.actions[actionVarName] = actionData;
            }
          } catch (e) {
            errors.push(
              `Failed to parse action input ${inp.actionId}: ${e.message}`,
            );
          }
        });
      }

      // Validate against schema
      const validation = validateInputsAgainstSchema(inputs, schema);
      if (!validation.valid) {
        errors.push(...validation.errors);
      }
      warnings.push(...validation.warnings);

      return {
        inputs,
        valid: errors.length === 0,
        errors,
        warnings,
        schema,
      };
    } catch (e) {
      return {
        inputs: {},
        valid: false,
        errors: [`Critical parsing error: ${e.message}`],
        warnings,
        schema: null,
      };
    }
  }

  /**
   * Extract field value from object using dot notation or array indices
   * Handles paths like "data.user.name" or "rows[0].phone_number"
   */
  function extractFieldValue(obj, path) {
    if (!obj || !path) return obj;

    try {
      const parts = path.split(/\.|\[/).map((p) => p.replace(/\]$/, ""));
      let value = obj;

      for (const part of parts) {
        if (value === null || value === undefined) return null;

        // Check if part is array index
        if (/^\d+$/.test(part)) {
          value = value[parseInt(part, 10)];
        } else {
          value = value[part];
        }
      }

      return value;
    } catch (e) {
      console.warn(`Failed to extract field ${path}:`, e);
      return null;
    }
  }

  async function executeCustomLogic(functionCode, context) {
    // Parse and validate inputs with 100% reliability
    const parsed = parseInputsForExecution(context, logicInputs);

    // Fallback: if no input definitions were provided, treat the entire
    // context object as the `inputs` parameter for user code. This makes
    // testing easier and mirrors older behavior where raw test JSON was used.
    if (
      (!logicInputs || logicInputs.length === 0) &&
      context &&
      typeof context === "object"
    ) {
      parsed.inputs = context;
      parsed.valid = true;
    }

    // Show warnings if any
    if (parsed.warnings.length > 0) {
      console.warn("Input parsing warnings:", parsed.warnings);
    }

    // Fail if parsing errors occurred
    if (!parsed.valid) {
      const error = new Error(
        `Input parsing failed:\n${parsed.errors.join("\n")}`,
      );
      error.parsingErrors = parsed.errors;
      throw error;
    }

    // Validate against schema before execution
    if (parsed.schema) {
      const validation = validateInputsAgainstSchema(
        parsed.inputs,
        parsed.schema,
      );
      if (!validation.valid) {
        console.warn("Input validation warnings:", validation.errors);
      }
    }

    // Create sandboxed function with enhanced error context
    try {
      const func = new Function("inputs", functionCode);
      const result = func(parsed.inputs);

      // Handle promises if the code is async
      if (result && typeof result.then === "function") {
        return await result;
      }

      return result;
    } catch (error) {
      // Enhance error message with context
      const enhancedError = new Error(
        `Custom Logic Execution Error: ${error.message}`,
      );
      enhancedError.stack = error.stack;
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  async function saveCustomLogic() {
    const name = document.getElementById("logic-name").value.trim();
    const description = document
      .getElementById("logic-description")
      .value.trim();
    const functionCode = document.getElementById("logic-function").value.trim();

    if (!name) {
      showToast("Name is required", "error");
      return;
    }

    if (!functionCode) {
      showToast("Function code is required", "error");
      return;
    }

    const logic = {
      id: currentLogic ? currentLogic.id : generateId(),
      name,
      description,
      inputs: logicInputs,
      functionCode,
      updatedAt: new Date().toISOString(),
    };

    // Include the last test result as an example output for this logic (persist similar to actions)
    try {
      if (window._lastCustomLogicTestResult !== undefined) {
        logic.exampleResult = window._lastCustomLogicTestResult;
      } else if (currentLogic && currentLogic._lastTestResult !== undefined) {
        logic.exampleResult = currentLogic._lastTestResult;
      }
    } catch (e) { /* ignore */ }

    // Persist the current test payload so it can be re-used when selecting this logic later
    try {
      const testDataStr =
        document.getElementById("logic-test-data").value || "";
      if (testDataStr) {
        let uiTestData = null;
        try {
          uiTestData = JSON.parse(testDataStr);
        } catch (e) {
          logic.exampleContextRaw = testDataStr;
        }

        // Build an engine-friendly exampleContext (events/actions maps)
        try {
          const engineCtx = { events: {}, actions: {} };
          if (uiTestData) {
            for (const inp of logicInputs || []) {
              if (inp.type === "event") {
                const eid = inp.eventId || inp.eventName || inp.source;
                const evtVar = normalizeVarName(
                  inp.eventName || inp.eventId || eid,
                );
                const v =
                  uiTestData[evtVar] ??
                  uiTestData[inp.eventName] ??
                  uiTestData[inp.eventId] ??
                  null;
                engineCtx.events[eid] = v;
              } else if (inp.type === "action") {
                const aid = inp.actionId || inp.actionName || inp.source;
                const actVar = normalizeVarName(aid);
                const v =
                  (uiTestData.actions &&
                    (uiTestData.actions[actVar] ?? uiTestData.actions[aid])) ??
                  null;
                engineCtx.actions[aid] = v;
              }
            }
          }

          // Save both forms: engine-oriented and UI-oriented
          logic.exampleContext = engineCtx;
          if (uiTestData) logic.exampleContextUI = uiTestData;
        } catch (e) {
          console.warn("Failed to build engine exampleContext:", e);
          if (!logic.exampleContext && uiTestData)
            logic.exampleContext = uiTestData;
        }
      }
    } catch (e) {
      console.warn("Unable to capture exampleContext for custom logic", e);
    }

    try {
      const method = currentLogic ? "PUT" : "POST";
      const url = currentLogic
        ? `/api/custom-logic/${currentLogic.id}`
        : "/api/custom-logic";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logic),
      });

      const data = await res.json();
      if (data.ok) {
        showToast("Custom logic saved", "success");
        await loadCustomLogics();
        currentLogic = logic;
      } else {
        showToast("Failed to save: " + (data.error || "unknown"), "error");
      }
    } catch (e) {
      showToast("Save error: " + e.message, "error");
    }
  }

  async function deleteCurrentLogic() {
    if (!currentLogic) return;
    if (!confirm(`Delete "${currentLogic.name}"?`)) return;

    try {
      const res = await fetch(`/api/custom-logic/${currentLogic.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        showToast("Deleted", "success");
        await loadCustomLogics();
        clearLogicEditor();
        document.getElementById("custom-logic-empty-state").style.display =
          "flex";
        document.getElementById("custom-logic-editor").style.display = "none";
      } else {
        showToast("Delete failed", "error");
      }
    } catch (e) {
      showToast("Delete error: " + e.message, "error");
    }
  }

  function generateId() {
    return (
      "logic_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)
    );
  }

  async function showCustomModal(title, content, buttons) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;";

      const modal = document.createElement("div");
      modal.style.cssText =
        "background: white; border-radius: 8px; padding: 20px; min-width: 400px; max-width: 800px; max-height: 80vh; overflow: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.3);";

      const titleEl = document.createElement("h3");
      titleEl.textContent = title;
      titleEl.style.cssText = "margin: 0 0 16px 0;";

      const contentEl = document.createElement("div");
      contentEl.innerHTML = content;

      const buttonContainer = document.createElement("div");
      buttonContainer.style.cssText =
        "display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end;";

      buttons.forEach((btn) => {
        const button = document.createElement("button");
        button.textContent = btn.label;
        button.className = btn.primary
          ? "btn btn-primary"
          : "btn btn-secondary";
        button.onclick = () => {
          document.body.removeChild(overlay);
          resolve(btn.value);
        };
        buttonContainer.appendChild(button);
      });

      modal.appendChild(titleEl);
      modal.appendChild(contentEl);
      modal.appendChild(buttonContainer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      overlay.onclick = (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
          resolve(null);
        }
      };
    });
  }

  // Legacy Action Test Runner and parser-path selection UI removed.
  // Parser path selection and action-test modal were deprecated in favor of
  // the simplified "Attach Inputs from Connect Nodes" flow. Removed helpers
  // and modal UI to reduce code surface and avoid maintenance overhead.

  function showToast(message, type = "info") {
    console.log(`[Toast ${type}]`, message);
    alert(message);
  }

  // AI Code Generation for Custom Logic
  async function aiGenerateLogicCode() {
    const description = document
      .getElementById("logic-description")
      .value.trim();

    if (!description) {
      showToast(
        "Please provide a description of what the logic should do",
        "error",
      );
      return;
    }

    if (!logicInputs || logicInputs.length === 0) {
      showToast(
        "Please add at least one input variable before generating code",
        "error",
      );
      return;
    }

    // Find the AI Generate button
    const aiBtn = document.querySelector(
      'button[onclick="aiGenerateLogicCode()"]',
    );

    try {
      // Build comprehensive context from input variables
      const context = await buildLogicInputContext();

      // Create AI prompt with description and input context
      const prompt = buildAIPrompt(description, context);

      // Show loading state
      if (aiBtn) {
        aiBtn.disabled = true;
        aiBtn.textContent = "⏳ Generating...";
      }

      // Ensure runtime config is loaded
      await ensureRuntimeConfig();

      // Determine AI endpoint (proxy mode uses /ai/send, direct mode uses directUrl)
      const aiTarget =
        window.RUNTIME_CONFIG &&
        window.RUNTIME_CONFIG.ai &&
        window.RUNTIME_CONFIG.ai.mode === "direct"
          ? window.RUNTIME_CONFIG.ai.directUrl
          : "/ai/send";

      // Call AI service
      const response = await fetch(aiTarget, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "custom-logic-" + Date.now(),
          aiquestion: prompt,
        }),
      });

      const data = await response.json();

      // Normalize envelope response from /ai/send
      let aiResult = "";
      if (data && typeof data === "object") {
        // Server returns envelope: { ok, statusCode, data, error, diagnostics }
        const payload = data.data || data;
        if (typeof payload === "string") {
          aiResult = payload;
        } else if (typeof payload === "object") {
          aiResult =
            payload.response || payload.result || JSON.stringify(payload);
        }
      }

      if (aiResult && aiResult.trim()) {
        // Parse JavaScript code from AI response with robust parser
        const code = parseJavaScriptFromAI(aiResult);

        if (code) {
          // Populate function code textarea
          document.getElementById("logic-function").value = code;

          // Auto-populate test data with sample values
          await populateTestDataFromSamples(context);

          showToast(
            "JavaScript code generated successfully! Review and test it.",
            "success",
          );

          // Auto-scroll to function code section
          document
            .getElementById("logic-function")
            .scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          showToast(
            "Failed to extract valid JavaScript code from AI response",
            "error",
          );
          console.error("AI response parsing failed:", data.result);
        }
      } else {
        showToast(
          "AI generation failed: " + (data.error || "Unknown error"),
          "error",
        );
      }

      // Restore button state
      if (aiBtn) {
        aiBtn.disabled = false;
        aiBtn.textContent = "✨ AI Generate Code";
      }
    } catch (e) {
      console.error("AI code generation error:", e);
      showToast("AI generation error: " + e.message, "error");

      // Restore button state
      if (aiBtn) {
        aiBtn.disabled = false;
        aiBtn.textContent = "✨ AI Generate Code";
      }
    }
  }

  // Helper to normalize variable names to JavaScript-safe identifiers
  function normalizeVarName(name) {
    if (!name) return "var";
    // Convert to string and normalize
    let normalized = String(name)
      .replace(/[^a-zA-Z0-9_$]/g, "_") // Replace invalid chars with underscore
      .replace(/^[0-9]/, "_$&") // Prefix with underscore if starts with number
      .replace(/_+/g, "_") // Collapse multiple underscores
      .replace(/^_+|_+$/g, ""); // Trim leading/trailing underscores

    // Ensure it doesn't start with a number after cleanup
    if (/^[0-9]/.test(normalized)) {
      normalized = "v_" + normalized;
    }

    // Ensure it's not empty
    if (!normalized || normalized.length === 0) {
      normalized = "var";
    }

    // Ensure it's a valid JS identifier
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(normalized)) {
      normalized = "var_" + normalized.replace(/[^a-zA-Z0-9_$]/g, "");
    }

    return normalized;
  }

  // ==================== INPUT SHAPE SCHEMA SYSTEM ====================

  /**
   * Build comprehensive input shape schema with type information
   * This creates a strict contract for what the function will receive
   */
  function buildInputShapeSchema(inputs) {
    const schema = {
      type: "object",
      properties: {},
      required: [],
      description: "Input structure for custom logic function",
    };

    // Group inputs by type
    const eventInputs = inputs.filter((i) => i.type === "event");
    const actionInputs = inputs.filter((i) => i.type === "action");

    // Build event properties
    eventInputs.forEach((inp) => {
      const eventVarName = normalizeVarName(inp.eventName || inp.eventId);

      if (!schema.properties[eventVarName]) {
        schema.properties[eventVarName] = {
          type: "object",
          description: `Event: ${inp.eventName || inp.eventId}`,
          properties: {},
          source: "event",
          sourceId: inp.eventId,
        };
        schema.required.push(eventVarName);
      }

      if (inp.field) {
        const fieldVarName = normalizeVarName(inp.field);
        schema.properties[eventVarName].properties[fieldVarName] = {
          type: inferType(inp.sampleValue || null),
          description: `Field: ${inp.field}`,
          path: inp.field,
          sample: inp.sampleValue,
        };
      }
    });

    // Build action properties
    if (actionInputs.length > 0) {
      schema.properties.actions = {
        type: "object",
        description: "Action results",
        properties: {},
        source: "actions",
      };
      schema.required.push("actions");

      actionInputs.forEach((inp) => {
        const actionVarName = normalizeVarName(inp.actionId);

        if (!schema.properties.actions.properties[actionVarName]) {
          schema.properties.actions.properties[actionVarName] = {
            type: "object",
            description: `Action: ${inp.actionName || inp.actionId}`,
            properties: {},
            source: "action",
            sourceId: inp.actionId,
          };
        }

        if (inp.parserVarName) {
          const parserVarName = normalizeVarName(inp.parserVarName);
          schema.properties.actions.properties[actionVarName].properties[
            parserVarName
          ] = {
            type: inferType(inp.sampleValue),
            description: `Parser path: ${inp.parserPath}`,
            path: inp.parserPath,
            sample: inp.sampleValue,
          };
        } else if (inp.field) {
          const fieldVarName = normalizeVarName(inp.field);
          schema.properties.actions.properties[actionVarName].properties[
            fieldVarName
          ] = {
            type: inferType(inp.sampleValue),
            description: `Field: ${inp.field}`,
            path: inp.field,
            sample: inp.sampleValue,
          };
        } else {
          // Full action result
          schema.properties.actions.properties[actionVarName].type = inferType(
            inp.sampleValue,
          );
          schema.properties.actions.properties[actionVarName].sample =
            inp.sampleValue;
        }
      });
    }

    return schema;
  }

  /**
   * Infer JavaScript type from sample value
   */
  function inferType(value) {
    if (value === null || value === undefined) return "any";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }

  /**
   * Generate human-readable TypeScript-style interface from schema
   */
  function schemaToInterface(schema) {
    if (!schema || !schema.properties) return "// No inputs defined";

    let lines = ["interface Inputs {"];

    for (const [key, prop] of Object.entries(schema.properties)) {
      const isRequired = schema.required && schema.required.includes(key);
      const optional = isRequired ? "" : "?";

      if (prop.type === "object" && prop.properties) {
        lines.push(`  ${key}${optional}: {`);
        for (const [subKey, subProp] of Object.entries(prop.properties)) {
          const subType = subProp.type || "any";
          const desc = subProp.description ? ` // ${subProp.description}` : "";
          const sample =
            subProp.sample !== undefined
              ? ` = ${JSON.stringify(subProp.sample)}`
              : "";
          lines.push(`    ${subKey}: ${subType};${desc}${sample}`);
        }
        lines.push(`  };`);
      } else {
        const propType = prop.type || "any";
        const desc = prop.description ? ` // ${prop.description}` : "";
        lines.push(`  ${key}${optional}: ${propType};${desc}`);
      }
    }

    lines.push("}");
    return lines.join("\n");
  }

  /**
   * Validate input structure against schema
   */
  function validateInputsAgainstSchema(inputs, schema) {
    const errors = [];
    const warnings = [];

    if (!schema || !schema.properties) {
      return { valid: true, errors, warnings };
    }

    // Check required properties
    for (const reqKey of schema.required || []) {
      if (!inputs || inputs[reqKey] === undefined) {
        errors.push(`Missing required input: ${reqKey}`);
      }
    }

    // Validate types
    for (const [key, value] of Object.entries(inputs || {})) {
      const schemaProp = schema.properties[key];
      if (!schemaProp) {
        warnings.push(`Unexpected input property: ${key}`);
        continue;
      }

      const expectedType = schemaProp.type;
      const actualType = Array.isArray(value) ? "array" : typeof value;

      if (expectedType !== "any" && expectedType !== actualType) {
        errors.push(
          `Type mismatch for ${key}: expected ${expectedType}, got ${actualType}`,
        );
      }

      // Validate nested properties
      if (
        schemaProp.type === "object" &&
        schemaProp.properties &&
        typeof value === "object"
      ) {
        for (const [subKey, subValue] of Object.entries(value || {})) {
          const subSchemaProp = schemaProp.properties[subKey];
          if (!subSchemaProp) {
            warnings.push(`Unexpected nested property: ${key}.${subKey}`);
            continue;
          }

          const subExpectedType = subSchemaProp.type;
          const subActualType = Array.isArray(subValue)
            ? "array"
            : typeof subValue;

          if (subExpectedType !== "any" && subExpectedType !== subActualType) {
            errors.push(
              `Type mismatch for ${key}.${subKey}: expected ${subExpectedType}, got ${subActualType}`,
            );
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Refresh the input shape preview panel
   */
  function refreshInputShapePreview() {
    try {
      if (!logicInputs || logicInputs.length === 0) {
        document.getElementById("input-shape-schema").textContent =
          "// No inputs defined";
        document.getElementById("validation-icon").textContent = "";
        document.getElementById("validation-message").textContent = "";
        document.getElementById("input-validation-status").style.display =
          "none";
        return;
      }

      // Build schema
      const schema = buildInputShapeSchema(logicInputs);

      // Generate interface representation
      const interfaceStr = schemaToInterface(schema);
      document.getElementById("input-shape-schema").textContent = interfaceStr;

      // Show validation status
      const statusEl = document.getElementById("input-validation-status");
      statusEl.style.display = "block";
      statusEl.style.background = "#d4edda";
      statusEl.style.border = "1px solid #c3e6cb";
      statusEl.style.color = "#155724";

      document.getElementById("validation-icon").textContent = "✅ ";
      document.getElementById("validation-message").textContent =
        `Input shape defined: ${logicInputs.length} variable${
          logicInputs.length > 1 ? "s" : ""
        }`;

      // Also update the variable preview with structured view
      updateStructuredPreview(schema);
    } catch (e) {
      console.error("Failed to refresh input shape preview:", e);
      const statusEl = document.getElementById("input-validation-status");
      statusEl.style.display = "block";
      statusEl.style.background = "#f8d7da";
      statusEl.style.border = "1px solid #f5c6cb";
      statusEl.style.color = "#721c24";

      document.getElementById("validation-icon").textContent = "❌ ";
      document.getElementById("validation-message").textContent =
        `Error: ${e.message}`;
    }
  }

  /**
   * Update variable preview with structured hierarchical view
   */
  function updateStructuredPreview(schema) {
    const container = document.getElementById("variable-preview-list");
    if (!container) return;

    const parts = [];

    const renderProperty = (key, prop, path = "") => {
      const fullPath = path ? `${path}.${key}` : key;
      const type = prop.type || "any";
      const sample =
        prop.sample !== undefined ? JSON.stringify(prop.sample) : "null";

      return `
        <div style="margin-bottom: 4px; padding: 4px; border-left: 3px solid #4caf50;">
          <div style="display: flex; justify-content: space-between; gap: 8px;">
            <span style="font-family: monospace; color: #1a73e8; font-weight: 600;">${fullPath}</span>
            <span style="font-family: monospace; color: #666; font-size: 0.85rem;">${type}</span>
          </div>
          <div style="color: #555; font-size: 0.75rem; margin-top: 2px;">
            Sample: <code style="background: #f5f5f5; padding: 2px 4px; border-radius: 2px;">${sample}</code>
          </div>
        </div>
      `;
    };

    for (const [key, prop] of Object.entries(schema.properties || {})) {
      if (prop.type === "object" && prop.properties) {
        parts.push(
          `<div style="margin-bottom: 8px;"><strong>${key}:</strong></div>`,
        );
        for (const [subKey, subProp] of Object.entries(prop.properties)) {
          parts.push(renderProperty(subKey, subProp, key));
        }
      } else {
        parts.push(renderProperty(key, prop));
      }
    }

    container.innerHTML =
      parts.length > 0
        ? parts.join("")
        : '<div style="color:#666; padding: 8px;">No variables available</div>';
  }

  // Build comprehensive context from all input variables
  async function buildLogicInputContext() {
    const context = {
      variables: [],
      events: {},
      actions: {},
      description: "",
    };

    // Process each input to gather context and sample values
    for (const input of logicInputs) {
      if (input.type === "event") {
        const eventInfo = await gatherEventContext(input);
        const eventVarName = normalizeVarName(input.eventName || input.eventId);
        const fieldVarName = input.field ? normalizeVarName(input.field) : null;

        // Build safe access path using bracket notation for safety
        let accessPath;
        if (input.field) {
          accessPath = `inputs['${eventVarName}']['${fieldVarName}']`;
        } else {
          accessPath = `inputs['${eventVarName}']`;
        }

        context.variables.push({
          type: "event",
          name: input.eventName || input.eventId,
          field: input.field,
          varName: eventVarName,
          fieldVarName: fieldVarName,
          accessPath: accessPath,
          schema: eventInfo.schema,
          sample: eventInfo.sample,
        });
        context.events[input.eventId] = eventInfo;
      } else if (input.type === "action") {
        const actionInfo = await gatherActionContext(input);
        const actionVarName = normalizeVarName(input.actionId);
        const parserVarName = input.parserVarName
          ? normalizeVarName(input.parserVarName)
          : null;
        const fieldVarName = input.field ? normalizeVarName(input.field) : null;

        // Build safe access path
        let accessPath;
        if (parserVarName) {
          accessPath = `inputs.actions['${actionVarName}']['${parserVarName}']`;
        } else if (fieldVarName) {
          accessPath = `inputs.actions['${actionVarName}']['${fieldVarName}']`;
        } else {
          accessPath = `inputs.actions['${actionVarName}']`;
        }

        // Derive a strong sample value for this input using multiple fallbacks
        let resolvedSample = null;
        if (input.sampleValue !== undefined) {
          resolvedSample = input.sampleValue;
        } else if (
          actionInfo &&
          actionInfo.sample !== undefined &&
          actionInfo.sample !== null
        ) {
          // If parserPath present, try to extract specific sample value
          if (input.parserPath) {
            resolvedSample = extractFieldValue(
              actionInfo.sample,
              input.parserPath,
            );
            // If extract yields null/undefined, try representative sample from result
            if (resolvedSample === null || resolvedSample === undefined) {
              resolvedSample = findRepresentativeSample(actionInfo.sample);
            }
          } else if (input.field) {
            resolvedSample = extractFieldValue(actionInfo.sample, input.field);
            if (resolvedSample === null || resolvedSample === undefined) {
              resolvedSample = findRepresentativeSample(actionInfo.sample);
            }
          } else {
            // No field specified: try to find a primitive representative sample
            resolvedSample =
              findRepresentativeSample(actionInfo.sample) || actionInfo.sample;
          }
        } else {
          // No sample available from action metadata or examples; leave resolvedSample as null
        }

        context.variables.push({
          type: "action",
          name: input.actionName || input.actionId,
          actionId: input.actionId,
          field: input.field,
          parserPath: input.parserPath,
          parserVarName: parserVarName,
          fieldVarName: fieldVarName,
          varName: actionVarName,
          accessPath: accessPath,
          schema: actionInfo.schema,
          sample: resolvedSample,
          resultStructure: actionInfo.resultStructure,
        });
        context.actions[input.actionId] = actionInfo;
      }
    }

    return context;
  }

  // Gather event context including schema and sample data
  async function gatherEventContext(input) {
    try {
      const events = await loadAvailableEvents();
      const event = events.find((e) => e.id === input.eventId);

      if (event) {
        const schema = await fetchEventPayloadSchema(event);
        let sample = null;

        if (schema) {
          // Build sample from schema
          sample = {};
          if (schema.primaryFields) {
            Object.keys(schema.primaryFields).forEach((k) => {
              const field = schema.primaryFields[k];
              if (field.sample !== undefined) {
                sample[k] = field.sample;
              }
            });
          }
          if (schema.metadataFields) {
            Object.keys(schema.metadataFields).forEach((k) => {
              const field = schema.metadataFields[k];
              if (field.sample !== undefined) {
                sample[k] = field.sample;
              }
            });
          }
        }

        return { schema, sample, event };
      }
    } catch (e) {
      console.warn("Failed to gather event context:", e);
    }

    return { schema: null, sample: null };
  }

  // Gather action context including schema and sample result
  async function gatherActionContext(input) {
    try {
      const actions = await loadAvailableActions();
      const action = actions.find((a) => a.id === input.actionId);

      if (action) {
        let sample = null;
        let resultStructure = null;

        // Try to get sample from various sources (ordered heuristics)
        const candidateSources = [
          "successSample",
          "sample",
          "lastResult",
          "lastRunResult",
          "_lastResult",
          "exampleResult",
        ];

        for (const key of candidateSources) {
          if (action[key] !== undefined && action[key] !== null) {
            sample = action[key];
            break;
          }
        }

        // Check variableMappings examples and parser-provided examples
        if (!sample && action.variableMappings) {
          if (action.variableMappings._exampleOutputs) {
            const examples = action.variableMappings._exampleOutputs;
            if (Array.isArray(examples) && examples.length > 0) {
              sample = examples[0].result || examples[0];
            }
          }

          if (!sample && action.variableMappings.parserExamples) {
            // parserExamples: { path: value }
            const pe = action.variableMappings.parserExamples;
            const keys = Object.keys(pe || {});
            if (keys.length > 0) sample = pe[keys[0]];
          }
        }

        // If still no sample, attempt to read from action.lastSuccessfulRun or metadata
        if (!sample && action.metadata && action.metadata.lastSuccessfulRun) {
          sample =
            action.metadata.lastSuccessfulRun.result ||
            action.metadata.lastSuccessfulRun;
        }

        // If we found a sample, derive result structure
        if (sample !== null && sample !== undefined) {
          resultStructure = extractStructure(sample);
        }

        return { schema: null, sample, resultStructure, action };
      }
    } catch (e) {
      console.warn("Failed to gather action context:", e);
    }

    return { schema: null, sample: null, resultStructure: null };
  }

  // Extract structure from sample data
  function extractStructure(sample) {
    if (sample === null || sample === undefined) return null;

    const structure = {};

    if (Array.isArray(sample)) {
      structure.type = "array";
      structure.length = sample.length;
      if (sample.length > 0) {
        // analyze first N items to infer itemType
        const first = sample[0];
        structure.itemType = inferType(first);
        if (typeof first === "object" && first !== null) {
          structure.fields = Object.keys(first);
          // include nested field types for clarity
          structure.fieldTypes = {};
          Object.keys(first).forEach((k) => {
            structure.fieldTypes[k] = inferType(first[k]);
          });
        }
      }
    } else if (typeof sample === "object") {
      structure.type = "object";
      structure.fields = Object.keys(sample);
      structure.fieldTypes = {};
      Object.keys(sample).forEach((k) => {
        structure.fieldTypes[k] = inferType(sample[k]);
      });
    } else {
      structure.type = inferType(sample);
    }

    return structure;
  }

  /**
   * Find a representative primitive sample inside a nested object/array
   * Scans breadth-first up to a reasonable depth and prefers non-null primitives
   */
  function findRepresentativeSample(sample, maxDepth = 4) {
    try {
      if (sample === null || sample === undefined) return null;
      if (typeof sample !== "object") return sample;

      const queue = [{ value: sample, depth: 0 }];

      while (queue.length > 0) {
        const { value, depth } = queue.shift();
        if (depth > maxDepth) continue;

        if (Array.isArray(value)) {
          for (let i = 0; i < Math.min(value.length, 6); i++) {
            const item = value[i];
            if (item === null || item === undefined) continue;
            if (typeof item !== "object") return item;
            queue.push({ value: item, depth: depth + 1 });
          }
        } else if (typeof value === "object") {
          for (const k of Object.keys(value)) {
            const v = value[k];
            if (v === null || v === undefined) continue;
            if (typeof v !== "object") return v;
            queue.push({ value: v, depth: depth + 1 });
          }
        }
      }
    } catch (e) {
      console.warn("findRepresentativeSample failed:", e);
    }
    return null;
  }

  // Build AI prompt with description and comprehensive context
  function buildAIPrompt(description, context) {
    let prompt = `You are an expert JavaScript developer. Generate a SIMPLE, SINGLE JavaScript function body for the Custom Logic Engine.\n\n`;

    prompt += `=== CUSTOM LOGIC ENGINE EXECUTION MODEL ===\n\n`;
    prompt += `The Custom Logic Engine executes your code using:\n`;
    prompt += `  const func = new Function("inputs", yourCodeHere);\n`;
    prompt += `  const result = func(inputs);\n\n`;

    prompt += `CONSTRAINTS:\n`;
    prompt += `• Your code is the FUNCTION BODY ONLY (no 'function' keyword, no declaration)\n`;
    prompt += `• You receive exactly ONE parameter: 'inputs' object\n`;
    prompt += `• You MUST return a value (object, array, string, number, or boolean)\n`;
    prompt += `• The engine supports both sync and async execution\n`;
    prompt += `• NO external modules, NO require(), NO imports\n`;
    prompt += `• ONLY use standard JavaScript built-ins (Math, Date, String, Array, Object, JSON, etc.)\n\n`;

    // ===== ADD INPUT SHAPE SCHEMA =====
    prompt += `=== INPUT SHAPE SCHEMA (STRICT CONTRACT) ===\n\n`;

    try {
      const schema = buildInputShapeSchema(logicInputs);
      const interfaceStr = schemaToInterface(schema);
      prompt += `This is the EXACT structure of the 'inputs' parameter you will receive:\n\n`;
      prompt += `${interfaceStr}\n\n`;
      prompt += `CRITICAL:\n`;
      prompt += `• You MUST ONLY access properties defined in this schema\n`;
      prompt += `• Use EXACT property names as shown above\n`;
      prompt += `• Types are enforced - check the type annotations\n`;
      prompt += `• Sample values are provided for reference\n`;
      prompt += `• Use bracket notation: inputs['propertyName']['nestedProperty']\n\n`;
    } catch (e) {
      console.warn("Failed to build input shape schema for AI prompt:", e);
    }
    // ===== END INPUT SHAPE SCHEMA =====

    prompt += `=== GRAMMAR AND STRUCTURE ===\n\n`;
    prompt += `INPUTS OBJECT STRUCTURE:\n`;
    prompt += `{\n`;
    prompt += `  "eventName": { ...eventPayload },           // Event data\n`;
    prompt += `  "actions": {                                // Action results\n`;
    prompt += `    "actionId": { ...actionResult }\n`;
    prompt += `  }\n`;
    prompt += `}\n\n`;

    prompt += `DESCRIPTION:\n${description}\n\n`;

    prompt += `AVAILABLE INPUT VARIABLES:\n`;
    context.variables.forEach((v, idx) => {
      prompt += `${idx + 1}. ${v.accessPath}\n`;
      prompt += `   Type: ${v.type}\n`;
      if (v.sample !== undefined && v.sample !== null) {
        prompt += `   Sample Value: ${JSON.stringify(v.sample).substring(
          0,
          200,
        )}\n`;
      }
      if (v.resultStructure) {
        prompt += `   Structure: ${JSON.stringify(v.resultStructure)}\n`;
      }
      prompt += `\n`;
    });

    prompt += `\n=== MANDATORY SYNTAX RULES ===\n\n`;
    prompt += `1. PROPERTY ACCESS: Use bracket notation for all property access\n`;
    prompt += `   ✓ inputs['eventName']['field']\n`;
    prompt += `   ✓ inputs.actions['actionId']['field']\n`;
    prompt += `   ✗ inputs.field - variableName  (This is SUBTRACTION, not property access!)\n\n`;

    prompt += `2. VARIABLE REFERENCES: ONLY use variables from the "AVAILABLE INPUT VARIABLES" list above\n`;
    prompt += `   ✓ const value = inputs.actions['actionId']['phone_number'];\n`;
    prompt += `   ✗ const value = someUndefinedVariable;\n\n`;

    prompt += `3. NULL SAFETY: Always check for null/undefined before accessing nested properties\n`;
    prompt += `   ✓ const value = inputs.actions?.['actionId']?.['field'] || null;\n`;
    prompt += `   ✓ if (inputs.actions && inputs.actions['actionId']) { ... }\n\n`;

    prompt += `4. SIMPLE LOGIC: Keep logic simple and focused - ONE clear purpose\n`;
    prompt += `   ✓ Validate one field\n`;
    prompt += `   ✓ Transform one value\n`;
    prompt += `   ✓ Compare two values\n`;
    prompt += `   ✗ Complex multi-step workflows\n`;
    prompt += `   ✗ Database operations\n`;
    prompt += `   ✗ Network requests\n\n`;

    prompt += `5. ERROR HANDLING: Wrap in try-catch, return structured error objects\n`;
    prompt += `   ✓ try { ...logic... } catch (error) { return { error: error.message }; }\n\n`;

    prompt += `6. RETURN VALUE: Always return something meaningful\n`;
    prompt += `   ✓ return { isValid: true, value: result };\n`;
    prompt += `   ✓ return processedValue;\n`;
    prompt += `   ✗ No return statement\n`;
    prompt += `   ✗ return undefined;\n\n`;

    prompt += `=== RESPONSE FORMAT ===\n\n`;
    prompt += `Provide ONLY the JavaScript code block.\n`;
    prompt += `• NO markdown formatting (no \`\`\`javascript)\n`;
    prompt += `• NO explanations before or after the code\n`;
    prompt += `• NO function declaration\n`;
    prompt += `• Start directly with JavaScript statements\n`;
    prompt += `• End with a return statement\n\n`;

    prompt += `=== CORRECT EXAMPLE ===\n\n`;
    prompt += `try {\n`;
    prompt += `  // Extract phone number from action result\n`;
    prompt += `  const phoneNumber = inputs.actions?.['actionId']?.['phone_number'];\n`;
    prompt += `  \n`;
    prompt += `  // Validate phone number format\n`;
    prompt += `  if (!phoneNumber || typeof phoneNumber !== 'string') {\n`;
    prompt += `    return { isValid: false, error: 'Phone number is required' };\n`;
    prompt += `  }\n`;
    prompt += `  \n`;
    prompt += `  const phoneRegex = /^\\d{3}-\\d{3}-\\d{4}$/;\n`;
    prompt += `  const isValid = phoneRegex.test(phoneNumber);\n`;
    prompt += `  \n`;
    prompt += `  return {\n`;
    prompt += `    isValid,\n`;
    prompt += `    phoneNumber,\n`;
    prompt += `    error: isValid ? null : 'Invalid phone number format (expected: XXX-XXX-XXXX)'\n`;
    prompt += `  };\n`;
    prompt += `} catch (error) {\n`;
    prompt += `  console.error('Logic error:', error);\n`;
    prompt += `  return { isValid: false, error: error.message };\n`;
    prompt += `}\n\n`;

    prompt += `=== WRONG EXAMPLES (DO NOT DO THIS) ===\n\n`;
    prompt += `❌ function validatePhone(inputs) { ... }  // NO function declaration!\n`;
    prompt += `❌ const result = inputs.field - variableName;  // Subtraction operator is NOT property access!\n`;
    prompt += `❌ inputs.actions.actionId.crmToDelivery - phone_number;  // Syntax error!\n`;
    prompt += `❌ const axios = require('axios');  // NO external modules!\n`;
    prompt += `❌ await fetch('...');  // NO network requests!\n`;
    prompt += `❌ return;  // MUST return a value!\n\n`;

    prompt += `NOW GENERATE THE JAVASCRIPT CODE FOLLOWING ALL RULES ABOVE:`;

    return prompt;
  }

  // Robust JavaScript parser to extract code from AI response
  function parseJavaScriptFromAI(response) {
    if (!response) return null;

    let code = response.trim();

    // Remove markdown code blocks if present
    code = code.replace(/^```(?:javascript|js)?\s*\n/i, "");
    code = code.replace(/\n```\s*$/, "");
    code = code.replace(/^```(?:javascript|js)?\s*/i, "");
    code = code.replace(/```\s*$/, "");

    // Remove any leading/trailing explanatory text
    const patterns = [
      /(?:Here's|Here is|Here are).*?code.*?:\s*\n/gi,
      /^.*?(?=(?:try|const|let|var|if|return|function)\s*[\{\(])/s,
      /^[^\n]*(?:code|solution|implementation).*?:\s*\n/gi,
    ];

    for (const pattern of patterns) {
      code = code.replace(pattern, "");
    }

    // Clean up the code
    code = code.trim();

    // Remove function wrapper if AI added it despite instructions
    code = code.replace(/^function\s+\w*\s*\([^)]*\)\s*\{/i, "");
    code = code.replace(/^\([^)]*\)\s*=>\s*\{/i, "");

    // Remove trailing closing brace if it's a wrapper
    if (
      code.endsWith("}") &&
      !code.includes("try") &&
      !code.includes("if") &&
      !code.includes("for")
    ) {
      code = code.substring(0, code.lastIndexOf("}")).trim();
    }

    // Fix common AI errors: property access with subtraction operator
    // Pattern: inputs.something.field - variableName
    // Should be: inputs.something['field_variableName'] or similar
    code = code.replace(
      /(inputs(?:\.[\w]+|\['[^']+'])+)\s*-\s*([\w]+)/g,
      (match, path, varName) => {
        console.warn(`Fixed AI syntax error: ${match} → ${path}['${varName}']`);
        return `${path}['${varName}']`;
      },
    );

    // Validate JavaScript syntax
    try {
      new Function("inputs", code);
      return code;
    } catch (syntaxError) {
      console.error("JavaScript syntax validation failed:", syntaxError);
      console.error("Code that failed:", code);

      // Try aggressive cleanup
      const lines = code.split("\n");
      const cleanedLines = lines.filter((line) => {
        const trimmed = line.trim();
        // Remove obvious non-code lines
        return !trimmed.startsWith("//") || trimmed.length < 100;
      });

      const cleanedCode = cleanedLines.join("\n").trim();

      try {
        new Function("inputs", cleanedCode);
        return cleanedCode;
      } catch (e) {
        console.error("Cleaned code still invalid:", e);
        console.error("Cleaned code:", cleanedCode);
        return null;
      }
    }
  }

  // Auto-populate test data textarea with real sample values
  async function populateTestDataFromSamples(context) {
    try {
      const testData = {};

      // Build test data object from context with normalized variable names
      for (const variable of context.variables) {
        if (variable.type === "event") {
          const eventVarName =
            variable.varName || normalizeVarName(variable.name);

          if (!testData[eventVarName]) {
            testData[eventVarName] = {};
          }

          if (variable.field && variable.sample) {
            const fieldVarName =
              variable.fieldVarName || normalizeVarName(variable.field);
            // Extract specific field value
            const fieldValue =
              variable.sample[variable.field] !== undefined
                ? variable.sample[variable.field]
                : null;
            testData[eventVarName][fieldVarName] = fieldValue;
          } else if (variable.sample) {
            // Use full event sample
            testData[eventVarName] = variable.sample;
          }
        } else if (variable.type === "action") {
          if (!testData.actions) {
            testData.actions = {};
          }

          const actionVarName =
            variable.varName || normalizeVarName(variable.actionId);
          if (!testData.actions[actionVarName]) {
            testData.actions[actionVarName] = {};
          }

          if (
            variable.parserVarName &&
            variable.sample !== undefined &&
            variable.sample !== null
          ) {
            // Use parser path variable with normalized name
            const parserVarName = normalizeVarName(variable.parserVarName);
            testData.actions[actionVarName][parserVarName] = variable.sample;
          } else if (
            variable.field &&
            variable.sample !== undefined &&
            variable.sample !== null
          ) {
            // Extract specific field with normalized name
            const fieldVarName =
              variable.fieldVarName || normalizeVarName(variable.field);
            const fieldValue =
              typeof variable.sample === "object" &&
              variable.sample[variable.field] !== undefined
                ? variable.sample[variable.field]
                : variable.sample;
            testData.actions[actionVarName][fieldVarName] = fieldValue;
          } else if (
            variable.sample !== undefined &&
            variable.sample !== null
          ) {
            // Use full action result
            testData.actions[actionVarName] = variable.sample;
          } else {
            // Try to fallback to full action sample from context if available
            try {
              const act = context.actions && context.actions[variable.actionId];
              const fallback =
                act && (act.sample || (act.action && act.action.sample));
              const rep = fallback ? findRepresentativeSample(fallback) : null;
              if (rep !== null && rep !== undefined) {
                testData.actions[actionVarName] = rep;
              }
            } catch (e) {}
          }
        }
      }

      // Populate the test data textarea and make it read-only
      const testDataTextarea = document.getElementById("logic-test-data");
      testDataTextarea.value = JSON.stringify(testData, null, 2);
      testDataTextarea.readOnly = true;
      testDataTextarea.style.backgroundColor = "#f8f9fa";
      testDataTextarea.style.cursor = "not-allowed";
      testDataTextarea.title =
        "Auto-generated from real action outputs (read-only)";

      // Update variable preview
      showVariablePreviewFromTestData(testData);
    } catch (e) {
      console.error("Failed to populate test data:", e);
    }
  }

  // Update variable preview panel with test data
  function showVariablePreviewFromTestData(testData) {
    const container = document.getElementById("variable-preview-list");
    if (!container) return;

    const parts = [];

    // Flatten test data for preview
    const flatten = (obj, prefix = "") => {
      if (!obj || typeof obj !== "object") return;

      Object.keys(obj)
        .slice(0, 20)
        .forEach((key) => {
          const value = obj[key];
          const path = prefix ? `${prefix}.${key}` : key;

          if (value && typeof value === "object" && !Array.isArray(value)) {
            flatten(value, path);
          } else {
            let displayValue = JSON.stringify(value);
            if (displayValue.length > 100) {
              displayValue = displayValue.substring(0, 100) + "...";
            }

            parts.push(
              `<div style="display:flex; justify-content:space-between; gap:12px; padding:4px 0; border-bottom:1px dashed #eee">` +
                `<div style="font-family:monospace; color:#1a73e8; font-weight:600">${path}</div>` +
                `<div style="color:#333; font-family:monospace; font-size:0.85rem">${displayValue}</div>` +
                `</div>`,
            );
          }
        });
    };

    flatten(testData);

    container.innerHTML =
      parts.length > 0
        ? parts.join("")
        : '<div style="color:#666">No preview available</div>';
  }

  // Helper to fetch event payload schema
  async function fetchEventPayloadSchema(event) {
    try {
      const res = await fetch(`/api/event-registry/${event.id}/schema`);
      if (res.ok) {
        const data = await res.json();
        return data.schema || null;
      }
    } catch (e) {
      console.warn("Failed to fetch event schema:", e);
    }
    return null;
  }

  // Init hook called by the parent page when the fragment is loaded.
  // Expose on window so the parent `switchTab` can call it, and tests
  // can also await it to ensure the fragment has initialized.
  window.initCustomLogicTab = async function () {
    try {
      // If the parent page has a currentWorkflow global, prefer it
      if (window.currentWorkflow && window.currentWorkflow.id) {
        try {
          // allow fragment to reference parent's currentWorkflow
          currentWorkflow = window.currentWorkflow;
        } catch (e) {
          // ignore
        }
      }
      // Show active workflow in toolbar
      try {
        const el = document.getElementById("custom-logic-active-workflow");
        if (el)
          el.textContent =
            (window.currentWorkflow &&
              (window.currentWorkflow.name || window.currentWorkflow.id)) ||
            "(none)";
      } catch (e) {}

      // register callback to refresh when active workflow changes
      try {
        window.onActiveWorkflowChanged = (wf) => {
          try {
            const el = document.getElementById("custom-logic-active-workflow");
            if (el) el.textContent = (wf && (wf.name || wf.id)) || "(none)";
          } catch (e) {}
          try {
            loadCustomLogics();
          } catch (e) {}
        };
      } catch (e) {}

      // Load list and render
      await loadCustomLogics();
      try {
        initCustomLogicConnectInputs && initCustomLogicConnectInputs();
      } catch (e) {}
    } catch (e) {
      console.warn("initCustomLogicTab failed", e);
    }
  };

  // Minimal state + helpers to render and manage custom logics
  let logicList = [];
  let currentLogic = null;
  let logicInputs = [];

  async function loadCustomLogics() {
    try {
      // Use the generic explorer to populate the sidebar. Explorer normalizes
      // shapes and shows connected counts based on window.nodes.
      if (!window.createExplorer) {
        // fallback: load then retry
        await new Promise((r) => setTimeout(r, 60));
      }
      const explorer = await window.createExplorer({
        containerId: "custom-logic-list",
        // fetch only per-workflow components (workflows.json is canonical)
        fetchItems: async () => {
          if (!(window.currentWorkflow && window.currentWorkflow.id)) return [];
          const res = await fetch(
            `/api/unified-workflows/${window.currentWorkflow.id}/components`,
          );
          if (!res.ok) return [];
          const j = await res.json();
          // explorer.normalizeItems will handle objects/arrays
          return j.logics || j.data || j || [];
        },
        itemLabel: (it) => it.name || it.id || "(untitled)",
        nodeTypeMatch: "connect",
        onSelect: (it) => {
          // populate editor with selected logic
          currentLogic = it;
          logicInputs = Array.isArray(it.inputs)
            ? JSON.parse(JSON.stringify(it.inputs))
            : [];
          document.getElementById("custom-logic-editor").style.display =
            "block";
          document.getElementById("logic-name").value = it.name || "";
          document.getElementById("logic-description").value =
            it.description || "";
          document.getElementById("logic-function").value =
            it.functionCode || it.function || "";
          if (it.exampleContextUI) {
            try {
              document.getElementById("logic-test-data").value = JSON.stringify(
                it.exampleContextUI,
                null,
                2,
              );
            } catch (e) {}
          }
          try { initCustomLogicConnectInputs && initCustomLogicConnectInputs(); } catch(e){}
          try { if (typeof window.refreshCustomLogicConnectInputs === 'function') window.refreshCustomLogicConnectInputs(); } catch(e){}
          renderInputsList();
          refreshInputShapePreview();
        });
    } catch (e) {
      console.error("loadCustomLogics error", e);
      document.getElementById("custom-logic-empty-state").style.display =
        "flex";
    }
  }

  function getConnectedInputsForItem(item) {
    try {
      const allNodes = window.nodes || [];
      const matches = [];
      allNodes.forEach((n) => {
        if (
          n.type === "connect" &&
          n.data &&
          (String(n.data.logicId) === String(item.id) ||
            String(n.data.logicId) === String(item.name))
        ) {
          matches.push(n);
        }
      });
      return matches;
    } catch (e) {
      return [];
    }
  }

  function renderLogicsList() {
    const listEl = document.getElementById("custom-logic-list");
    listEl.innerHTML = "";
    if (!logicList || logicList.length === 0) {
      document.getElementById("custom-logic-empty-state").style.display =
        "flex";
      return;
    }
    document.getElementById("custom-logic-empty-state").style.display = "none";

    logicList.forEach((lg) => {
      const node = document.createElement("div");
      node.style.cssText =
        "padding:8px; border-bottom:1px solid #eee; cursor:pointer;";
      node.textContent = lg.name || lg.id || "(untitled)";
      // show connected inputs badge
      try {
        const inputs = getConnectedInputsForItem(lg, "logic");
        if (inputs && inputs.length) {
          const badge = document.createElement("span");
          badge.style.cssText = "float:right; font-size:0.8rem; color:#555";
          badge.textContent = `${inputs.length} connected`;
          node.appendChild(badge);
        }
      } catch (e) {}

      node.onclick = async () => {
        currentLogic = lg;
        logicInputs = Array.isArray(lg.inputs)
          ? JSON.parse(JSON.stringify(lg.inputs))
          : [];
        document.getElementById("custom-logic-editor").style.display = "block";
        document.getElementById("logic-name").value = lg.name || "";
        document.getElementById("logic-description").value =
          lg.description || "";
        document.getElementById("logic-function").value =
          lg.functionCode || lg.function || "";
        if (lg.exampleContextUI) {
          try {
            document.getElementById("logic-test-data").value = JSON.stringify(
              lg.exampleContextUI,
              null,
              2,
            );
          } catch (e) {}
        }
        renderInputsList();
        refreshInputShapePreview();
        try {
          window.refreshCustomLogicConnectInputs &&
            window.refreshCustomLogicConnectInputs();
        } catch (e) {}
      };
      listEl.appendChild(node);
    });
  }

  function renderInputsList() {
    // Minimal rendering: reflect inputs in the input-shape and variable preview
    try {
      refreshInputShapePreview();
    } catch (e) {
      console.warn("renderInputsList error", e);
    }
  }

  function clearLogicEditor() {
    currentLogic = null;
    logicInputs = [];
    document.getElementById("custom-logic-editor").style.display = "block";
    document.getElementById("logic-name").value = "";
    document.getElementById("logic-description").value = "";
    document.getElementById("logic-function").value = "";
    document.getElementById("logic-test-data").value = "";
    document.getElementById("logic-test-result").style.display = "none";
    renderInputsList();
    refreshInputShapePreview();
  }
