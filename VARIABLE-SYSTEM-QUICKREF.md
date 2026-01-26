# Variable System - Quick Reference Card

## 🚀 Quick Start (3 Steps)

```javascript
// 1. Show Modal
const vars = await EventDataModal.show();

// 2. Register Variables
vars.forEach((v) => VariableRegistry.register(v, { source: "event" }));

// 3. Use Variables
const value = VariableRegistry.resolve("{{event.user.id}}", context);
```

---

## 📦 Components

| Component           | Purpose           | Usage                                  |
| ------------------- | ----------------- | -------------------------------------- |
| `EventDataModal`    | Pick event fields | `await EventDataModal.show()`          |
| `DbPickerModal`     | Pick DB columns   | `await DbPickerModal.show()`           |
| `VariableRegistry`  | Manage variables  | `VariableRegistry.register(...)`       |
| `VariableInsertion` | Drag & drop       | `VariableInsertion.enableDropZone(el)` |

---

## 💡 Common Tasks

### Open Event Picker

```javascript
const selected = await EventDataModal.show({
  preSelected: ["{{event.user.id}}"],
});
```

### Open DB Picker

```javascript
const selected = await DbPickerModal.show({
  preSelected: [{ table: "users", column: "email" }],
});
```

### Register Variable

```javascript
VariableRegistry.register("{{event.user.id}}", {
  source: "event",
  path: "user.id",
});
```

### Resolve Variable

```javascript
const value = VariableRegistry.resolve("{{event.user.id}}", {
  event: { user: { id: 12345 } },
}); // Returns: 12345
```

### Resolve Template

```javascript
const text = VariableRegistry.resolveTemplate(
  "User {{event.user.name}} has ${{event.balance}}",
  context,
);
```

### Enable Drop Zone

```javascript
const textarea = document.getElementById("myTextarea");
VariableInsertion.enableDropZone(textarea);
```

### Enable Autocomplete

```javascript
VariableInsertion.enableAutocomplete(textarea);
```

### Insert at Cursor

```javascript
VariableInsertion.insertAtCursor(textarea, "{{event.user.id}}");
```

---

## 🎨 Variable Format

```javascript
// Event Variables
{
  {
    event.user.id;
  }
}
{
  {
    event.payload.amount;
  }
}
{
  {
    event.data.items[0].name;
  }
}

// Database Variables
{
  {
    db.users.email;
  }
}
{
  {
    db.orders.total;
  }
}
{
  {
    db.products.name;
  }
}
```

---

## ✅ Validation

```javascript
const result = VariableRegistry.validate("{{event.user.id}}");
// { valid: true, errors: [] }
```

---

## 📊 Get All Variables

```javascript
const all = VariableRegistry.getAll();
const eventVars = VariableRegistry.getBySource("event");
const dbVars = VariableRegistry.getBySource("db");
```

---

## 🔍 Extract Variables

```javascript
const vars = VariableRegistry.extractVariables(
  "SELECT * FROM users WHERE id = {{event.user.id}}",
);
// Returns: ['{{event.user.id}}']
```

---

## 🎯 Pills

**Event Pills** - Blue (`#1da1f2`)  
**DB Pills** - Green (`#10b981`)

Both are:

- Draggable ✅
- Removable ✅
- Hover animated ✅

---

## 📁 Files

```
builder-tabs/
├── event-data-modal.html
├── db-picker-modal.html
├── variable-registry.html
└── variable-insertion.html
```

---

## 🔗 Include in HTML

```html
<script src="builder-tabs/variable-registry.html"></script>
<script src="builder-tabs/event-data-modal.html"></script>
<script src="builder-tabs/db-picker-modal.html"></script>
<script src="builder-tabs/variable-insertion.html"></script>
```

---

## 🧪 Test

Open `variable-system-demo.html` in browser

---

## 📚 Full Docs

See `docs/VARIABLE-SYSTEM-README.md`

---

**That's all you need to know! 🎉**
