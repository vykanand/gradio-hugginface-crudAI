/**
 * DB Picker Modal - Production Grade Database Column Selector
 *
 * Opens a modal to select database columns and generates reusable variable
 * paths like: {{db.users.email}}, {{db.orders.total}}
 *
 * Usage:
 *   const result = await showDbPickerModal({
 *     onSelect: (variablePath) => console.log(variablePath)
 *   });
 */

globalThis.DbPickerModal = (() => {
  let selectedColumns = [];
  let schemaCache = null;

  /**
   * Show DB Picker Modal
   * @param {Object} options - Configuration
   * @param {Function} options.onSelect - Callback when column is selected
   * @param {Array} options.preSelected - Pre-selected columns [{table, column}]
   * @returns {Promise<Array>} - Selected database columns with paths
   */
  async function show(options = {}) {
    const { onSelect, preSelected = [] } = options;
    selectedColumns = [...preSelected];

    try {
      // Load schema
      const schema = await loadSchema();

      if (
        !schema ||
        !schema.tablesList ||
        schema.tablesList.length === 0
      ) {
        if (typeof showToast === 'function') showToast(
          "No database schema available. Check /api/db/schema",
          "error",
        );
        return selectedColumns;
      }

      // Create modal UI
      const modalBody = createModalBody(schema);

      return new Promise((resolve) => {
        if (typeof _createModal === 'function') {
          _createModal({
            title: "🗄️ DB Picker - Select Database Columns",
            bodyEl: modalBody,
            confirmText: "Done",
            onConfirm: () => {
              resolve(selectedColumns);
            },
            onCancel: () => {
              resolve(preSelected);
            },
          });
        } else {
          console.error('_createModal function not found');
          resolve(preSelected);
        }
      });
    } catch (error) {
      console.error("DB Picker Modal error:", error);
      if (typeof showToast === 'function') showToast(
        "Failed to load database schema: " + error.message,
        "error",
      );
      return preSelected;
    }
  }

  /**
   * Load database schema
   */
  async function loadSchema() {
    if (schemaCache) return schemaCache;

    // Try global cache first
    if (
      typeof cachedSchemaMetadata !== "undefined" &&
      cachedSchemaMetadata
    ) {
      schemaCache = cachedSchemaMetadata;
      return schemaCache;
    }

    try {
      const res = await fetch("/api/db/schema", { cache: "no-store" });
      if (!res.ok) throw new Error("Schema API returned " + res.status);

      schemaCache = await res.json();
      return schemaCache;
    } catch (error) {
      console.error("Failed to load schema:", error);

      // Fallback to config
      try {
        const configRes = await fetch("/config/database.json");
        if (configRes.ok) {
          const config = await configRes.json();
          schemaCache = config;
          return schemaCache;
        }
      } catch (e) {
        console.error("Config fallback failed:", e);
      }

      throw error;
    }
  }

  /**
   * Create modal body UI
   */
  function createModalBody(schema) {
    const container = document.createElement("div");
    container.style.cssText =
      "display:flex;flex-direction:column;gap:16px;max-height:600px;overflow:auto";

    // Selected Pills Section
    const pillsSection = document.createElement("div");
    pillsSection.id = "db-picker-pills-section";
    pillsSection.style.cssText =
      "padding:12px;background:#f8f9fa;border-radius:8px;border:1px solid #e1e8ed";
    updatePillsSection(pillsSection);
    container.appendChild(pillsSection);

    // Search box
    const searchBox = document.createElement("input");
    searchBox.type = "text";
    searchBox.className = "form-input";
    searchBox.placeholder = "🔍 Search tables and columns...";
    searchBox.style.cssText = "margin-bottom:8px";

    // Tables list
    const tablesList = document.createElement("div");
    tablesList.id = "tables-list-container";
    tablesList.style.cssText =
      "display:flex;flex-direction:column;gap:8px";

    // Render tables
    const renderTables = (filter = "") => {
      tablesList.innerHTML = "";

      const tables = schema.tablesList || [];
      const filtered = filter
        ? tables.filter(
            (t) =>
              t.toLowerCase().includes(filter.toLowerCase()) ||
              getColumnNames(schema, t).some((c) =>
                c.toLowerCase().includes(filter.toLowerCase()),
              ),
          )
        : tables;

      filtered.forEach((tableName) => {
        const tableCard = createTableCard(
          schema,
          tableName,
          pillsSection,
          filter,
        );
        tablesList.appendChild(tableCard);
      });

      if (filtered.length === 0) {
        tablesList.innerHTML =
          '<div style="text-align:center;color:#8899a6;padding:20px">No tables found</div>';
      }
    };

    searchBox.addEventListener("input", (e) => {
      renderTables(e.target.value);
    });

    renderTables();

    container.appendChild(searchBox);
    container.appendChild(tablesList);

    return container;
  }

  /**
   * Get column names from schema
   */
  function getColumnNames(schema, tableName) {
    const cols =
      schema.tables &&
      schema.tables[tableName] &&
      Array.isArray(schema.tables[tableName].columns)
        ? schema.tables[tableName].columns
        : (schema.tables && schema.tables[tableName]) || [];

    return cols
      .map((c) =>
        typeof c === "string"
          ? c
          : c.Field || c.name || c.COLUMN_NAME || "",
      )
      .filter(Boolean);
  }

  /**
   * Create table card with columns
   */
  function createTableCard(
    schema,
    tableName,
    pillsSection,
    searchFilter = "",
  ) {
    const card = document.createElement("div");
    card.style.cssText =
      "border:1px solid #e1e8ed;border-radius:8px;background:white;overflow:hidden;transition:all 0.2s";
    card.onmouseenter = () => (card.style.borderColor = "#1da1f2");
    card.onmouseleave = () => (card.style.borderColor = "#e1e8ed");

    const colNames = getColumnNames(schema, tableName);

    // Filter columns if search is active
    const visibleColumns = searchFilter
      ? colNames.filter((c) =>
          c.toLowerCase().includes(searchFilter.toLowerCase()),
        )
      : colNames;

    if (searchFilter && visibleColumns.length === 0) return null;

    // Header
    const header = document.createElement("div");
    header.style.cssText =
      "padding:12px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;background:#fafbfc";
    header.innerHTML = `
      <div>
        <div style="font-weight:600;color:#2c3e50">📁 ${escapeHtml(tableName)}</div>
        <div style="font-size:0.75rem;color:#8899a6">${colNames.length} columns</div>
      </div>
      <span style="color:#1da1f2;font-size:1.2rem" class="expand-icon">▼</span>
    `;

    // Columns section
    const columnsSection = document.createElement("div");
    columnsSection.style.cssText =
      "display:none;padding:12px;border-top:1px solid #e1e8ed;background:#f8f9fa";

    const columnsGrid = document.createElement("div");
    columnsGrid.style.cssText =
      "display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px";

    visibleColumns.forEach((columnName) => {
      const columnRow = createColumnRow(
        tableName,
        columnName,
        pillsSection,
      );
      columnsGrid.appendChild(columnRow);
    });

    columnsSection.appendChild(columnsGrid);

    // Toggle expand/collapse
    header.addEventListener("click", () => {
      const isHidden = columnsSection.style.display === "none";
      columnsSection.style.display = isHidden ? "block" : "none";
      header.querySelector(".expand-icon").textContent = isHidden
        ? "▲"
        : "▼";
    });

    // Auto-expand if search filter matches
    if (searchFilter && visibleColumns.length > 0) {
      columnsSection.style.display = "block";
      header.querySelector(".expand-icon").textContent = "▲";
    }

    card.appendChild(header);
    card.appendChild(columnsSection);

    return card;
  }

  /**
   * Create column row
   */
  function createColumnRow(tableName, columnName, pillsSection) {
    const row = document.createElement("div");
    row.style.cssText = `
      display:flex;
      justify-content:space-between;
      align-items:center;
      padding:8px;
      background:white;
      border-radius:4px;
      border:1px solid #e1e8ed;
      transition:all 0.2s;
    `;
    row.onmouseenter = () => (row.style.background = "#f0f7ff");
    row.onmouseleave = () => (row.style.background = "white");

    // Column info
    const columnInfo = document.createElement("div");
    columnInfo.style.cssText = "flex:1;overflow:hidden";

    const columnText = document.createElement("code");
    columnText.style.cssText =
      "font-family:monospace;font-size:0.85rem;color:#1f4b78";
    columnText.textContent = columnName;

    columnInfo.appendChild(columnText);

    // Add button
    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-sm btn-primary";
    addBtn.textContent = "+";
    addBtn.style.cssText =
      "padding:4px 8px;font-size:0.8rem;min-width:32px";

    const variablePath = `{{db.${tableName}.${columnName}}}`;

    addBtn.addEventListener("click", () => {
      const existing = selectedColumns.find(
        (c) => c.table === tableName && c.column === columnName,
      );

      if (!existing) {
        selectedColumns.push({
          table: tableName,
          column: columnName,
          path: variablePath,
        });
        updatePillsSection(pillsSection);
        if (typeof showToast === 'function') showToast(`Added: ${variablePath}`, "success");
      } else {
        if (typeof showToast === 'function') showToast("Column already selected", "info");
      }
    });

    row.appendChild(columnInfo);
    row.appendChild(addBtn);

    return row;
  }

  /**
   * Update pills section
   */
  function updatePillsSection(container) {
    if (!container) return;

    container.innerHTML = "";

    if (selectedColumns.length === 0) {
      container.innerHTML = `
        <div style="color:#8899a6;font-size:0.85rem;text-align:center;padding:12px">
          No columns selected. Click "+" on any column to add it.
        </div>
      `;
      return;
    }

    const title = document.createElement("div");
    title.style.cssText =
      "font-weight:600;margin-bottom:8px;color:#2c3e50";
    title.textContent = `✓ Selected Columns (${selectedColumns.length})`;
    container.appendChild(title);

    const pillsWrap = document.createElement("div");
    pillsWrap.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";

    selectedColumns.forEach((col, idx) => {
      const pill = createPill(col, () => {
        selectedColumns.splice(idx, 1);
        updatePillsSection(container);
      });
      pillsWrap.appendChild(pill);
    });

    container.appendChild(pillsWrap);
  }

  /**
   * Create draggable pill component
   */
  function createPill(columnData, onRemove) {
    const { table, column, path } = columnData;
    const displayText = path || `{{db.${table}.${column}}}`;

    const pill = document.createElement("div");
    pill.draggable = true;
    pill.style.cssText = `
      background:#10b981;
      color:white;
      padding:6px 10px;
      border-radius:999px;
      display:inline-flex;
      align-items:center;
      gap:8px;
      font-size:0.85rem;
      cursor:move;
      transition:all 0.2s;
      border:2px solid #10b981;
    `;

    pill.onmouseenter = () => {
      pill.style.background = "#059669";
      pill.style.transform = "scale(1.05)";
    };
    pill.onmouseleave = () => {
      pill.style.background = "#10b981";
      pill.style.transform = "scale(1)";
    };

      pill.addEventListener("dragstart", function (ev) {
        const payload = { table: table, column: column, path: displayText, parserType: 'db_parser' };
        try {
          ev.dataTransfer.setData("application/json", JSON.stringify(payload));
        } catch (e) {
          ev.dataTransfer.setData("text/plain", displayText);
        }
        ev.dataTransfer.effectAllowed = "copy";
        pill.style.opacity = "0.5";
      });

    pill.addEventListener("dragend", () => {
      pill.style.opacity = "1";
    });

    const textSpan = document.createElement("span");
    textSpan.style.fontFamily = "monospace";
    textSpan.textContent = displayText;

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

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  return { show };
})();

// Export for global use
if (typeof module !== "undefined" && module.exports) {
  module.exports = DbPickerModal;
}
