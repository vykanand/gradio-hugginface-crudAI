# Variable System Documentation

## Overview

The Variable System provides a production-grade, reusable solution for selecting and managing dynamic variables from **Sample Event Data** and **DB Picker** sources throughout the orchestration builder.

## Features

✅ **Reusable Modal Components** - Event Data & DB Picker modals can be used anywhere  
✅ **Dynamic Variable Registry** - Central system tracks all variables  
✅ **Drag & Drop Pills** - Visual, interactive variable management  
✅ **Path-Based Variables** - `{{event.user.id}}`, `{{db.users.email}}`  
✅ **Auto-Resolution** - Variables automatically resolve to actual values  
✅ **Drop Zone Support** - Drag pills directly into textareas  
✅ **Production-Ready** - Mature, polished UX for daily use

---

## Architecture

### Component Files

```
builder-tabs/
├── event-data-modal.html      # Event data picker modal
├── db-picker-modal.html        # Database column picker modal
├── variable-registry.html      # Variable management system
└── variable-insertion.html     # Drop zone & insertion helpers
```

### Integration

All components are loaded in `orchestration-builder.html`:

```html
<script src="builder-tabs/variable-registry.html"></script>
<script src="builder-tabs/event-data-modal.html"></script>
<script src="builder-tabs/db-picker-modal.html"></script>
<script src="builder-tabs/variable-insertion.html"></script>
```

---

## Usage Guide

### 1. Sample Event Data Picker

**Purpose:** Select event payload fields and generate reusable variable paths.

**How to Use:**

1. Click **"+ Add Event Data"** button
2. Browse available events from registry
3. Expand event to see payload structure
4. Click **"+ Add"** on any field
5. Variable pills appear (e.g., `{{event.user.id}}`)
6. Drag pills into SQL queries or other inputs

**API:**

```javascript
const selected = await EventDataModal.show({
  preSelected: ["{{event.user.id}}"],
});
```

**Features:**

- 🔍 Search events by name
- 📊 View event count/frequency
- 🌳 Interactive payload tree
- 🎯 Auto-generates variable paths
- 💾 Handles nested objects and arrays

---

### 2. DB Picker

**Purpose:** Select database columns and generate variable paths.

**How to Use:**

1. Click **"+ Pick DB Column"** button
2. Search or browse tables
3. Expand table to view columns
4. Click **"+"** on any column
5. Variable pills appear (e.g., `{{db.users.email}}`)
6. Drag pills into queries

**API:**

```javascript
const selected = await DbPickerModal.show({
  preSelected: [
    { table: "users", column: "email", path: "{{db.users.email}}" },
  ],
});
```

**Features:**

- 🗄️ Full schema browsing
- 🔍 Search tables and columns
- 📁 Auto-expand on search match
- ✅ Duplicate prevention
- 🎨 Color-coded pills (green)

---

### 3. Variable Registry

**Purpose:** Central system for tracking and resolving all variables.

**Core Functions:**

```javascript
// Register a variable
VariableRegistry.register("{{event.user.id}}", {
  source: "event",
  path: "user.id",
});

// Resolve to actual value
const value = VariableRegistry.resolve("{{event.user.id}}", {
  event: { user: { id: 12345 } },
}); // Returns: 12345

// Resolve template string
const text = VariableRegistry.resolveTemplate(
  "User {{event.user.name}} ordered ${{event.order.total}}",
  context,
);

// Get all variables
const all = VariableRegistry.getAll();

// Get by source
const eventVars = VariableRegistry.getBySource("event");
const dbVars = VariableRegistry.getBySource("db");
```

**Validation:**

```javascript
const result = VariableRegistry.validate("{{event.user.id}}");
// { valid: true, errors: [] }

const result2 = VariableRegistry.validate("{{invalid}}");
// { valid: false, errors: ['Variable must start with "event" or "db"'] }
```

**Extract Variables:**

```javascript
const vars = VariableRegistry.extractVariables(
  "SELECT * FROM users WHERE id = {{event.user.id}} AND email = {{db.config.email}}",
);
// Returns: ['{{event.user.id}}', '{{db.config.email}}']
```

---

### 4. Variable Insertion & Drop Zones

**Purpose:** Drag-and-drop and auto-complete support for textareas.

**Enable Drop Zone:**

```javascript
const queryTextarea = document.getElementById("action-query");
VariableInsertion.enableDropZone(queryTextarea);
```

**Enable Autocomplete:**

```javascript
VariableInsertion.enableAutocomplete(queryTextarea);
```

**Insert at Cursor:**

```javascript
VariableInsertion.insertAtCursor(textarea, "{{event.user.id}}");
```

**Create Enhanced Textarea:**

```javascript
const { container, textarea } = VariableInsertion.createEnhancedTextarea({
  id: "my-query",
  placeholder: "Type or drag variables...",
  enableDrop: true,
  enableComplete: true,
});
```

---

## Variable Path Format

### Event Variables

```
{{event.user.id}}              → Access event.user.id
{{event.payload.amount}}       → Access event.payload.amount
{{event.data.items[0].name}}   → Access first item in array
{{event.metadata.timestamp}}   → Access metadata fields
```

### Database Variables

```
{{db.users.email}}             → users.email column
{{db.orders.total}}            → orders.total column
{{db.products.price}}          → products.price column
```

---

## Pill System

### Visual Design

**Event Pills** (Blue):

- Background: `#1da1f2`
- Draggable: ✅
- Removable: ✅
- Hover effect: Scale 1.05

**DB Pills** (Green):

- Background: `#10b981`
- Draggable: ✅
- Removable: ✅
- Hover effect: Scale 1.05

### Drag & Drop

1. **Drag Start:** Pill becomes semi-transparent
2. **Drag Over:** Target shows blue dashed border
3. **Drop:** Variable inserted at cursor position
4. **Drag End:** Pill returns to normal

---

## Integration Examples

### SQL Query with Variables

```sql
SELECT
  id,
  name,
  email
FROM users
WHERE
  id = {{event.user.id}}
  AND status = 'active'
  AND created_at > {{event.filter.startDate}}
ORDER BY {{db.users.name}}
```

### Execution Context

```javascript
const context = {
  event: {
    user: { id: 12345 },
    filter: { startDate: "2024-01-01" },
  },
  db: {
    users: { name: "John Doe" },
  },
};

const resolvedQuery = VariableRegistry.resolveTemplate(sqlQuery, context);
```

---

## Best Practices

### ✅ DO

- Use descriptive variable paths
- Register variables immediately after selection
- Validate variables before execution
- Use drag-and-drop for ease of use
- Enable drop zones on all relevant inputs

### ❌ DON'T

- Manually type variable paths (use modals)
- Skip variable registration
- Use invalid characters in paths
- Forget to resolve before execution

---

## Reusability

### Use Anywhere in App

```javascript
// In any component
const eventVars = await EventDataModal.show();
const dbVars = await DbPickerModal.show();

// Register for global use
eventVars.forEach((v) => VariableRegistry.register(v, { source: "event" }));
dbVars.forEach((v) => VariableRegistry.register(v, { source: "db" }));
```

### Custom Modal Options

```javascript
await EventDataModal.show({
  preSelected: existingVars,
  onSelect: (path) => {
    console.log("Selected:", path);
    // Custom logic
  },
});
```

---

## Advanced Features

### Variable Autocomplete

The system provides intelligent autocomplete:

```javascript
// Type "{{" in textarea → Shows all variables
// Type "{{event" → Filters to event variables
// Type "{{db.users" → Filters to users table columns
```

### Variable Palette

Quick access widget:

```javascript
const palette = VariableInsertion.createVariablePalette(targetElement);
document.body.appendChild(palette);
```

### Export/Import

```javascript
// Export current variable state
const state = VariableRegistry.exportToJSON();
localStorage.setItem("variables", JSON.stringify(state));

// Import saved state
const saved = JSON.parse(localStorage.getItem("variables"));
VariableRegistry.importFromJSON(saved);
```

---

## Troubleshooting

### Variables Not Appearing

**Problem:** Pills don't show after selection  
**Solution:** Check that `variableMappings` object exists:

```javascript
if (!variableMappings) variableMappings = {};
```

### Drag & Drop Not Working

**Problem:** Can't drag pills  
**Solution:** Ensure `VariableInsertion.enableDropZone()` was called on target element

### Variables Not Resolving

**Problem:** Variables show as `{{event.user.id}}` in output  
**Solution:** Call `VariableRegistry.resolveTemplate()` before execution:

```javascript
const resolved = VariableRegistry.resolveTemplate(query, context);
```

### Modal Not Opening

**Problem:** Modal scripts not loading  
**Solution:** Check script includes in correct order:

```html
<script src="builder-tabs/variable-registry.html"></script>
<script src="builder-tabs/event-data-modal.html"></script>
<script src="builder-tabs/db-picker-modal.html"></script>
```

---

## API Reference

### EventDataModal

```typescript
interface EventDataModalOptions {
  preSelected?: string[];
  onSelect?: (path: string) => void;
}

EventDataModal.show(options: EventDataModalOptions): Promise<string[]>
```

### DbPickerModal

```typescript
interface DbColumn {
  table: string;
  column: string;
  path?: string;
}

interface DbPickerModalOptions {
  preSelected?: DbColumn[];
  onSelect?: (column: DbColumn) => void;
}

DbPickerModal.show(options: DbPickerModalOptions): Promise<DbColumn[]>
```

### VariableRegistry

```typescript
VariableRegistry.register(path: string, metadata: object): void
VariableRegistry.resolve(path: string, context: object): any
VariableRegistry.resolveTemplate(template: string, context: object): string
VariableRegistry.validate(path: string): { valid: boolean, errors: string[] }
VariableRegistry.getAll(): Variable[]
VariableRegistry.getBySource(source: 'event' | 'db'): Variable[]
```

### VariableInsertion

```typescript
VariableInsertion.enableDropZone(element: HTMLElement): void
VariableInsertion.enableAutocomplete(element: HTMLElement): Widget
VariableInsertion.insertAtCursor(element: HTMLElement, text: string): void
```

---

## License

Part of the BILLION CONTROL CENTER orchestration system.

---

## Support

For issues or questions, check:

- Component source files in `builder-tabs/`
- Integration in `orchestration-builder.html`
- This documentation

**Enjoy the production-grade variable system! 🚀**
