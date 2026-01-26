/**
 * Variable Insertion Helper
 *
 * Provides drag-and-drop support and auto-complete for variable insertion
 * into textareas, inputs, and code editors
 *
 * Usage:
 *   VariableInsertion.enableDropZone(textareaElement);
 *   VariableInsertion.enableAutocomplete(textareaElement);
 */

globalThis.VariableInsertion = (() => {
  /**
   * Enable drop zone for a textarea/input
   */
  function enableDropZone(element) {
    if (!element) return;

    // Add visual feedback styling
    const originalBorder = element.style.border;
    const originalBackground = element.style.background;

    element.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";

      // Visual feedback
      element.style.border = "2px dashed #1da1f2";
      element.style.background = "#f0f7ff";
    });

    element.addEventListener("dragleave", () => {
      element.style.border = originalBorder;
      element.style.background = originalBackground;
    });

    element.addEventListener("drop", (e) => {
      e.preventDefault();

      // Reset visual feedback
      element.style.border = originalBorder;
      element.style.background = originalBackground;

      // Get dropped variable
      const variablePath = e.dataTransfer.getData("text/plain");

      if (
        variablePath &&
        (variablePath.startsWith("{{") || variablePath.includes("."))
      ) {
        insertAtCursor(element, variablePath);

        // Trigger input event for auto-detection
        element.dispatchEvent(new Event("input", { bubbles: true }));

        if (typeof showToast === 'function') showToast(`Inserted: ${variablePath}`, "success");
      }
    });

    // Add tooltip hint
    element.title = element.title
      ? element.title + " | Drag & drop variables here"
      : "Drag & drop variables here";
  }

  /**
   * Enable autocomplete for variables
   */
  function enableAutocomplete(element, options = {}) {
    if (!element || typeof VariableRegistry === "undefined") return;

    const widget = VariableRegistry.createPickerWidget(element, {
      onSelect: (variablePath) => {
        insertAtCursor(element, variablePath);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      },
    });

    return widget;
  }

  /**
   * Insert text at cursor position
   */
  function insertAtCursor(element, text) {
    if (!element) return;

    const start = element.selectionStart;
    const end = element.selectionEnd;
    const value = element.value;

    // Insert text
    element.value =
      value.substring(0, start) + text + value.substring(end);

    // Move cursor to end of inserted text
    const newPos = start + text.length;
    element.setSelectionRange(newPos, newPos);

    // Focus element
    element.focus();
  }

  /**
   * Highlight variables in text
   */
  function highlightVariables(text) {
    if (!text || typeof text !== "string") return text;

    // Highlight {{variable}} patterns
    return text.replace(
      /(\{\{[^}]+\}\})/g,
      '<span style="background:#fef3c7;color:#92400e;padding:2px 4px;border-radius:3px;font-family:monospace">$1</span>',
    );
  }

  /**
   * Create enhanced textarea with variable support
   */
  function createEnhancedTextarea(options = {}) {
    const {
      id = "",
      placeholder = "Type or drag variables here...",
      className = "form-textarea",
      rows = 4,
      enableDrop = true,
      enableComplete = true,
    } = options;

    const container = document.createElement("div");
    container.style.cssText = "position:relative";

    const textarea = document.createElement("textarea");
    textarea.id = id;
    textarea.className = className;
    textarea.placeholder = placeholder;
    textarea.rows = rows;
    textarea.style.cssText = "font-family:monospace;transition:all 0.2s";

    if (enableDrop) {
      enableDropZone(textarea);
    }

    if (enableComplete) {
      enableAutocomplete(textarea);
    }

    // Add variable count indicator
    const indicator = document.createElement("div");
    indicator.style.cssText = `
      position:absolute;
      top:8px;
      right:8px;
      background:rgba(29,161,242,0.9);
      color:white;
      padding:2px 8px;
      border-radius:12px;
      font-size:0.7rem;
      pointer-events:none;
      display:none;
    `;

    const updateIndicator = () => {
      if (typeof VariableRegistry !== "undefined") {
        const vars = VariableRegistry.extractVariables(textarea.value);
        if (vars.length > 0) {
          indicator.textContent = `${vars.length} variable${vars.length > 1 ? "s" : ""}`;
          indicator.style.display = "block";
        } else {
          indicator.style.display = "none";
        }
      }
    };

    textarea.addEventListener("input", updateIndicator);

    container.appendChild(textarea);
    container.appendChild(indicator);

    return { container, textarea };
  }

  /**
   * Create variable palette widget
   */
  function createVariablePalette(targetElement) {
    const palette = document.createElement("div");
    palette.style.cssText = `
      position:absolute;
      right:0;
      top:0;
      background:white;
      border:1px solid #e1e8ed;
      border-radius:8px;
      padding:8px;
      box-shadow:0 2px 8px rgba(0,0,0,0.1);
      max-width:250px;
      z-index:100;
    `;

    const title = document.createElement("div");
    title.style.cssText =
      "font-weight:600;margin-bottom:8px;color:#2c3e50;font-size:0.85rem";
    title.textContent = "📌 Quick Variables";

    palette.appendChild(title);

    // Load variables from registry
    if (typeof VariableRegistry !== "undefined") {
      const vars = VariableRegistry.getAll();

      if (vars.length === 0) {
        palette.innerHTML +=
          '<div style="color:#8899a6;font-size:0.75rem;padding:8px">No variables available</div>';
      } else {
        vars.forEach((varData) => {
          const varBtn = document.createElement("button");
          varBtn.className = "btn btn-sm";
          varBtn.style.cssText = `
            display:block;
            width:100%;
            text-align:left;
            margin-bottom:4px;
            padding:6px 8px;
            font-size:0.75rem;
            background:${varData.source === "event" ? "#e6f7ff" : "#f0fdf4"};
            border:1px solid ${varData.source === "event" ? "#91d5ff" : "#86efac"};
          `;
          varBtn.textContent = varData.originalPath;

          varBtn.addEventListener("click", () => {
            insertAtCursor(targetElement, varData.originalPath);
            targetElement.dispatchEvent(
              new Event("input", { bubbles: true }),
            );
          });

          palette.appendChild(varBtn);
        });
      }
    }

    return palette;
  }

  return {
    enableDropZone,
    enableAutocomplete,
    insertAtCursor,
    highlightVariables,
    createEnhancedTextarea,
    createVariablePalette,
  };
})();

// Export for global use
if (typeof module !== "undefined" && module.exports) {
  module.exports = VariableInsertion;
}
