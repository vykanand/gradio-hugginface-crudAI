/**
 * Event Data Modal - Production Grade Variable Picker
 *
 * Opens a modal to select event data from the registry and generates
 * reusable variable paths like: {{event.user.id}}, {{event.payload.amount}}
 *
 * Usage:
 *   const result = await EventDataModal.show({
 *     onSelect: (variablePath) => console.log(variablePath)
 *   });
 */

globalThis.EventDataModal = (() => {
  let currentEventData = null;
  let selectedPaths = [];

  /**
   * Show Event Data Modal
   * @param {Object} options - Configuration
   * @param {Function} options.onSelect - Callback when path is selected
   * @param {Array} options.preSelected - Pre-selected paths to show as pills
   * @returns {Promise<Array>} - Selected variable paths
   */
  async function show(options = {}) {
    const { onSelect, preSelected = [] } = options;
    selectedPaths = [...preSelected];

    try {
      // Load events from registry
      const eventsRes = await fetch("/api/event-registry", {
        cache: "no-store",
      });
      if (!eventsRes.ok) throw new Error("Could not load events");

      const eventsData = await eventsRes.json();
      const registry = eventsData?.registry || {};

      // Build event list
      const events = buildEventsList(registry);

      if (events.length === 0) {
        if (typeof showToast === 'function') showToast("No events found in registry", "warning");
        return selectedPaths;
      }

      // Create modal UI
      const modalBody = createModalBody(events);

      return new Promise((resolve) => {
        if (typeof _createModal === 'function') {
          _createModal({
            title: "📊 Sample Event Data Picker",
            bodyEl: modalBody,
            confirmText: "Done",
            onConfirm: () => {
              resolve(selectedPaths);
            },
            onCancel: () => {
              resolve(preSelected); // Return original on cancel
            },
          });
        } else {
          console.error('_createModal function not found');
          resolve(preSelected);
        }
      });
    } catch (error) {
      console.error("Event Data Modal error:", error);
      if (typeof showToast === 'function') showToast("Failed to load event data: " + error.message, "error");
      return preSelected;
    }
  }

  /**
   * Build events list from registry
   */
  function buildEventsList(registry) {
    const eventsMap = new Map();
    const rawKeys = Object.keys(registry || {});

    for (const k of rawKeys) {
      if (!k) continue;
      if (
        typeof k === "string" &&
        (k.startsWith("evt:") || k.startsWith("dlq:"))
      )
        continue;

      const val = registry[k];

      // If value has .events, extract all
      if (val && typeof val === "object" && val.events) {
        Object.keys(val.events).forEach((eventName) => {
          const cnt = Number(val.events[eventName]) || 1;
          if (!eventsMap.has(eventName)) {
            eventsMap.set(eventName, {
              id: eventName,
              name: eventName,
              module: k,
              count: cnt,
            });
          } else {
            const existing = eventsMap.get(eventName);
            existing.count = (existing.count || 0) + cnt;
          }
        });
      } else {
        // Treat key as event name
        const eventName = k;
        const moduleName =
          typeof eventName === "string" && eventName.includes(":")
            ? String(eventName).split(":")[0]
            : "misc";

        let cnt = 0;
        if (val && typeof val === "object" && (val.total || val.count)) {
          cnt = val.total || val.count;
        } else if (typeof val === "number") {
          cnt = val;
        } else {
          cnt = 1;
        }

        if (!eventsMap.has(eventName)) {
          eventsMap.set(eventName, {
            id: eventName,
            name: eventName,
            module: moduleName,
            count: cnt,
          });
        } else {
          const existing = eventsMap.get(eventName);
          existing.count = (existing.count || 0) + cnt;
        }
      }
    }

    return Array.from(eventsMap.values()).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    );
  }

  /**
   * Create modal body UI
   */
  function createModalBody(events) {
    const container = document.createElement("div");
    container.style.cssText =
      "display:flex;flex-direction:column;gap:16px;max-height:600px;overflow:auto";

    // Selected Pills Section
    const pillsSection = document.createElement("div");
    pillsSection.id = "event-data-pills-section";
    pillsSection.style.cssText =
      "padding:12px;background:#f8f9fa;border-radius:8px;border:1px solid #e1e8ed";
    updatePillsSection(pillsSection);
    container.appendChild(pillsSection);

    // Search box
    const searchBox = document.createElement("input");
    searchBox.type = "text";
    searchBox.className = "form-input";
    searchBox.placeholder = "🔍 Search events...";
    searchBox.style.cssText = "margin-bottom:8px";

    // Events list
    const eventsList = document.createElement("div");
    eventsList.id = "events-list-container";
    eventsList.style.cssText =
      "display:flex;flex-direction:column;gap:8px";

    // Render events
    const renderEvents = (filter = "") => {
      eventsList.innerHTML = "";
      const filtered = filter
        ? events.filter((e) =>
            e.name.toLowerCase().includes(filter.toLowerCase()),
          )
        : events;

      filtered.forEach((event) => {
        const eventCard = createEventCard(event, pillsSection);
        eventsList.appendChild(eventCard);
      });

      if (filtered.length === 0) {
        eventsList.innerHTML =
          '<div style="text-align:center;color:#8899a6;padding:20px">No events found</div>';
      }
    };

    searchBox.addEventListener("input", (e) => {
      renderEvents(e.target.value);
    });

    renderEvents();

    container.appendChild(searchBox);
    container.appendChild(eventsList);

    return container;
  }

  /**
   * Create event card with expandable payload
   */
  function createEventCard(event, pillsSection) {
    const card = document.createElement("div");
    card.style.cssText =
      "border:1px solid #e1e8ed;border-radius:8px;background:white;overflow:hidden;transition:all 0.2s";
    card.onmouseenter = () => (card.style.borderColor = "#1da1f2");
    card.onmouseleave = () => (card.style.borderColor = "#e1e8ed");

    // Header
    const header = document.createElement("div");
    header.style.cssText =
      "padding:12px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;background:#fafbfc";
    header.innerHTML = `
      <div>
        <div style="font-weight:600;color:#2c3e50">${escapeHtml(event.name)}</div>
        <div style="font-size:0.75rem;color:#8899a6">Module: ${escapeHtml(event.module)} • Count: ${event.count}</div>
      </div>
      <span style="color:#1da1f2;font-size:1.2rem" class="expand-icon">▼</span>
    `;

    // Payload section (collapsed by default)
    const payloadSection = document.createElement("div");
    payloadSection.style.cssText =
      "display:none;padding:12px;border-top:1px solid #e1e8ed;background:#f8f9fa";

    const loadPayloadBtn = document.createElement("button");
    loadPayloadBtn.className = "btn btn-secondary";
    loadPayloadBtn.textContent = "🔍 Load Sample Payload";
    loadPayloadBtn.style.cssText = "width:100%;margin-bottom:8px";

    loadPayloadBtn.addEventListener("click", async () => {
      await loadEventPayload(event, payloadSection, pillsSection);
    });

    payloadSection.appendChild(loadPayloadBtn);

    // Toggle expand/collapse
    header.addEventListener("click", () => {
      const isHidden = payloadSection.style.display === "none";
      payloadSection.style.display = isHidden ? "block" : "none";
      header.querySelector(".expand-icon").textContent = isHidden
        ? "▲"
        : "▼";
    });

    card.appendChild(header);
    card.appendChild(payloadSection);

    return card;
  }

  /**
   * Load event payload and render fields
   */
  async function loadEventPayload(event, container, pillsSection) {
    try {
      container.innerHTML =
        '<div style="text-align:center;padding:20px"><div class="spinner"></div> Loading...</div>';

      // Fetch sample event data
      const res = await fetch(
        `/api/event-registry/sample/${encodeURIComponent(event.name)}`,
      );

      let sampleData;
      if (res.ok) {
        sampleData = await res.json();
      } else {
        // Generate mock data if no sample available
        sampleData = generateMockEventData(event.name);
      }

      currentEventData = sampleData;

      // Determine canonical root for variable paths
      const canonical = sampleData.canonicalEvent || sampleData.event || event.name;

      // Render payload tree - show only payload fields
      container.innerHTML = "";

      // Add section title
      const title = document.createElement("div");
      title.style.cssText = "font-weight:600;margin-bottom:12px;color:#2c3e50;padding:8px;background:#eef6ff;border-radius:4px";
      title.innerHTML = `📦 Payload Fields <span style="font-weight:normal;font-size:0.85rem;color:#8899a6">(Drag variables to use as inputs)</span>`;
      container.appendChild(title);

      const tree = createPayloadTree(
        sampleData.payload || sampleData,
        canonical,
        pillsSection,
      );
      container.appendChild(tree);
      
      // Add metadata section (collapsed by default)
      if (sampleData.actor || sampleData.producer || sampleData.id) {
        const metadataSection = document.createElement("details");
        metadataSection.style.cssText = "margin-top:12px;padding:8px;background:#f8f9fa;border-radius:4px";
        
        const summary = document.createElement("summary");
        summary.style.cssText = "cursor:pointer;font-weight:600;color:#2c3e50;padding:4px";
        summary.textContent = "📋 Event Metadata (optional)";
        metadataSection.appendChild(summary);
        
        const metadataTree = document.createElement("div");
        metadataTree.style.cssText = "margin-top:8px";
        
        // Add metadata fields
        const metadataFields = {
          id: sampleData.id,
          event: sampleData.event,
          module: sampleData.module,
          domain: sampleData.domain,
          ts: sampleData.ts,
          status: sampleData.status,
          level: sampleData.level
        };
        
        Object.entries(metadataFields).forEach(([key, value]) => {
          if (value !== undefined) {
            const metaPath = `${canonical}.${key}`;
            const row = createFieldRow(metaPath, value, typeof value, pillsSection);
            metadataTree.appendChild(row);
          }
        });
        
        metadataSection.appendChild(metadataTree);
        container.appendChild(metadataSection);
      }
    } catch (error) {
      console.error("Failed to load event payload:", error);
      container.innerHTML = `<div style="color:#e74c3c;padding:12px">Failed to load payload: ${escapeHtml(error.message)}</div>`;
    }
  }

  /**
   * Create interactive payload tree
   */
  function createPayloadTree(
    data,
    eventName,
    pillsSection,
    basePath = "",
  ) {
    const tree = document.createElement("div");
    tree.style.cssText = "display:flex;flex-direction:column;gap:4px";

    // Use canonical event name as root for variable paths (no extra 'payload' segment)
    const prefix = basePath || `${eventName}`;
    const paths = flattenObject(data, prefix);

    paths.forEach(({ path, value, type }) => {
      const row = createFieldRow(path, value, type, pillsSection);
      tree.appendChild(row);
    });

    return tree;
  }

  /**
   * Create field row component
   */
  function createFieldRow(path, value, type, pillsSection) {
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:white;border-radius:4px;border:1px solid #e1e8ed;transition:all 0.2s";
    row.onmouseenter = () => {
      row.style.background = "#f0f7ff";
      row.style.borderColor = "#1da1f2";
    };
    row.onmouseleave = () => {
      row.style.background = "white";
      row.style.borderColor = "#e1e8ed";
    };

    // Path display
    const pathDisplay = document.createElement("div");
    pathDisplay.style.cssText =
      "flex:1;display:flex;align-items:center;gap:8px;min-width:0";

    // Extract field name from path for display
    const fieldName = path.split('.').pop().replace(/\[0\]$/, '[]');
    
    const fieldLabel = document.createElement("div");
    fieldLabel.style.cssText = "font-weight:600;color:#2c3e50;font-size:0.9rem;min-width:100px";
    fieldLabel.textContent = fieldName;

    const pathText = document.createElement("code");
    pathText.style.cssText =
      "font-family:monospace;font-size:0.75rem;color:#1f4b78;background:#eef6ff;padding:2px 6px;border-radius:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:1";
    pathText.textContent = `{{${path}}}`;
    pathText.title = `{{${path}}}`;

    const valuePreview = document.createElement("span");
    valuePreview.style.cssText = "font-size:0.75rem;color:#8899a6;margin-left:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px";
    
    if (type === "object" || type === "array") {
      valuePreview.textContent = `(${type})`;
    } else {
      const valueStr = String(value);
      valuePreview.textContent = valueStr.length > 30 ? `${valueStr.substring(0, 30)}...` : valueStr;
      valuePreview.title = valueStr;
    }

    pathDisplay.appendChild(fieldLabel);
    pathDisplay.appendChild(pathText);
    pathDisplay.appendChild(valuePreview);

    // Add button
    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-sm btn-primary";
    addBtn.textContent = "+ Add";
    addBtn.style.cssText = "padding:4px 12px;font-size:0.8rem;white-space:nowrap;margin-left:8px";

    addBtn.addEventListener("click", () => {
      const variablePath = `{{${path}}}`;
      if (!selectedPaths.includes(variablePath)) {
        selectedPaths.push(variablePath);
        updatePillsSection(pillsSection);
        if (typeof showToast === 'function') showToast(`Added: ${fieldName}`, "success");
      } else {
        if (typeof showToast === 'function') showToast("Variable already added", "info");
      }
    });

    row.appendChild(pathDisplay);
    row.appendChild(addBtn);
    
    return row;
  }

  /**
   * Flatten object to paths
   */
  function flattenObject(obj, prefix = "", result = []) {
    if (obj === null || obj === undefined) {
      result.push({ path: prefix, value: obj, type: typeof obj });
      return result;
    }

    if (typeof obj !== "object") {
      result.push({ path: prefix, value: obj, type: typeof obj });
      return result;
    }

    if (Array.isArray(obj)) {
      if (obj.length > 0) {
        flattenObject(obj[0], `${prefix}[0]`, result);
      } else {
        result.push({ path: prefix, value: [], type: "array" });
      }
      return result;
    }

    // Object
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      result.push({ path: prefix, value: {}, type: "object" });
      return result;
    }

    keys.forEach((key) => {
      const separator = prefix ? "." : "";
      flattenObject(obj[key], `${prefix}${separator}${key}`, result);
    });

    return result;
  }

  /**
   * Update pills section
   */
  function updatePillsSection(container) {
    if (!container) return;

    container.innerHTML = "";

    if (selectedPaths.length === 0) {
      container.innerHTML = `
        <div style="color:#8899a6;font-size:0.85rem;text-align:center;padding:12px">
          No variables selected. Click "+ Add" on any field to create a variable.
        </div>
      `;
      return;
    }

    const title = document.createElement("div");
    title.style.cssText =
      "font-weight:600;margin-bottom:8px;color:#2c3e50";
    title.textContent = `✓ Selected Variables (${selectedPaths.length})`;
    container.appendChild(title);

    const pillsWrap = document.createElement("div");
    pillsWrap.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";

    selectedPaths.forEach((path, idx) => {
      const pill = createPill(path, () => {
        selectedPaths.splice(idx, 1);
        updatePillsSection(container);
      });
      pillsWrap.appendChild(pill);
    });

    container.appendChild(pillsWrap);
  }

  /**
   * Create draggable pill component
   */
  function createPill(text, onRemove) {
    const pill = document.createElement("div");
    pill.draggable = true;
    pill.style.cssText = `
      background:#1da1f2;
      color:white;
      padding:6px 10px;
      border-radius:999px;
      display:inline-flex;
      align-items:center;
      gap:8px;
      font-size:0.85rem;
      cursor:move;
      transition:all 0.2s;
      border:2px solid #1da1f2;
    `;

    pill.onmouseenter = () => {
      pill.style.background = "#1a91da";
      pill.style.transform = "scale(1.05)";
    };
    pill.onmouseleave = () => {
      pill.style.background = "#1da1f2";
      pill.style.transform = "scale(1)";
    };

    // Drag events
    pill.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", text);
      e.dataTransfer.effectAllowed = "copy";
      pill.style.opacity = "0.5";
    });

    pill.addEventListener("dragend", () => {
      pill.style.opacity = "1";
    });

    const textSpan = document.createElement("span");
    textSpan.style.fontFamily = "monospace";
    textSpan.textContent = text;

    const removeBtn = document.createElement("button");
    removeBtn.style.cssText = `
      background:transparent;
      border:none;
      color:white;
      cursor:pointer;
      padding:0 4px;
      font-size:1rem;
      line-height:1;
    `;
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onRemove();
    });

    pill.appendChild(textSpan);
    pill.appendChild(removeBtn);

    return pill;
  }

  /**
   * Generate mock event data
   */
  function generateMockEventData(eventName) {
    return {
      id: "evt_" + Date.now(),
      timestamp: new Date().toISOString(),
      type: eventName,
      payload: {
        userId: 12345,
        action: "sample_action",
        data: {
          field1: "value1",
          field2: 42,
          nested: {
            key: "value",
          },
        },
      },
      metadata: {
        source: "system",
        version: "1.0",
      },
    };
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  return { show };
})();

// Export for global use
if (typeof module !== "undefined" && module.exports) {
  module.exports = EventDataModal;
}
