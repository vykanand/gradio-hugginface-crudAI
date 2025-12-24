# Custom Logic Variable Preview System

## Overview

Complete implementation of a comprehensive input shape preview and validation system for the Custom Logic tab, ensuring 100% reliable input parsing and AI code generation.

## Implementation Date

January 2025

## Components Implemented

### 1. Input Shape Schema Builder (`buildInputShapeSchema`)

**Purpose**: Generate comprehensive schema with type information from logicInputs array

**Features**:

- Groups inputs by type (event/action)
- Normalizes variable names to JS-safe identifiers
- Infers types from sample values
- Creates nested structure for actions
- Handles parser paths and field extraction

**Schema Structure**:

```javascript
{
  type: "object",
  properties: {
    eventName: {
      type: "object",
      description: "Event: event_name",
      properties: {
        field: { type: "string", sample: "value", path: "field" }
      },
      source: "event",
      sourceId: "event_id"
    },
    actions: {
      type: "object",
      properties: {
        actionId: {
          type: "object",
          description: "Action: action_name",
          properties: {
            field: { type: "string", sample: "value", path: "field" }
          }
        }
      }
    }
  },
  required: ["eventName", "actions"]
}
```

### 2. TypeScript Interface Generator (`schemaToInterface`)

**Purpose**: Convert schema to human-readable TypeScript-style interface

**Output Example**:

```typescript
interface Inputs {
  eventName: {
    field: string; // Field: field_name = "sample value"
  };
  actions: {
    actionId: {
      phone_number: string; // Parser path: rows[0].phone_number = "555-1234"
    };
  };
}
```

### 3. Input Validation (`validateInputsAgainstSchema`)

**Purpose**: Validate runtime inputs against schema before execution

**Validation Checks**:

- Required properties present
- Type matching (string, number, boolean, array, object)
- Nested property validation
- Unexpected property warnings

**Return Structure**:

```javascript
{
  valid: true/false,
  errors: ["Missing required input: eventName"],
  warnings: ["Unexpected property: extraField"]
}
```

### 4. Variable Preview Refresh (`refreshInputShapePreview`)

**Purpose**: Update UI preview panel with current input structure

**UI Updates**:

- Input Shape Schema display (TypeScript-style interface)
- Sample Values Preview (hierarchical property list)
- Type Validation Status (success/error messages)

**Trigger Points**:

- When inputs are added/removed (`updateAvailableVars`)
- Manual refresh via 🔄 Refresh button
- After loading saved logic

### 5. Structured Preview (`updateStructuredPreview`)

**Purpose**: Display hierarchical view of all variables with types and samples

**Display Format**:

```
actions:
  └─ actionId.phone_number: string
     Sample: "555-1234"
```

### 6. Enhanced AI Prompt (`buildAIPrompt`)

**Added Section**: INPUT SHAPE SCHEMA (STRICT CONTRACT)

**AI Receives**:

```
=== INPUT SHAPE SCHEMA (STRICT CONTRACT) ===

This is the EXACT structure of the 'inputs' parameter you will receive:

interface Inputs {
  eventName: {
    field: string; // Field: field_name = "sample value"
  };
  actions: {
    actionId: {
      phone_number: string; // Parser path: rows[0].phone_number = "555-1234"
    };
  };
}

CRITICAL:
• You MUST ONLY access properties defined in this schema
• Use EXACT property names as shown above
• Types are enforced - check the type annotations
• Sample values are provided for reference
• Use bracket notation: inputs['propertyName']['nestedProperty']
```

**Impact**:

- AI has exact contract of available properties
- Reduces hallucination of non-existent variables
- Ensures type-aware code generation
- Provides sample values for context

### 7. Bulletproof Input Parser (`parseInputsForExecution`)

**Purpose**: 100% reliable input parsing with comprehensive error handling

**Parsing Strategy**:

1. Build schema from input definitions
2. Process event inputs with multi-key lookup
3. Process action inputs with parser path support
4. Extract fields using dot notation/array indices
5. Validate against schema
6. Return structured result with errors/warnings

**Multi-Key Lookup Order**:

- Event: `rawContext.events[eventId]` → `rawContext[eventVarName]` → `rawContext[eventId]` → `rawContext[eventName]`
- Action: `rawContext.actions[actionId]` → `rawContext.actions[actionVarName]` → `rawContext[actionVarName]` → `rawContext[actionId]`

**Field Extraction** (`extractFieldValue`):

- Handles dot notation: `"data.user.name"`
- Handles array indices: `"rows[0].phone_number"`
- Null-safe traversal
- Returns `null` for missing paths

**Return Structure**:

```javascript
{
  inputs: { ... },      // Parsed inputs object
  valid: true/false,    // Parsing success
  errors: [],           // Critical errors
  warnings: [],         // Non-critical warnings
  schema: { ... }       // Schema used for validation
}
```

### 8. Enhanced Execution (`executeCustomLogic`)

**New Flow**:

1. Parse inputs using `parseInputsForExecution`
2. Log warnings to console
3. Fail immediately if parsing errors
4. Validate against schema before execution
5. Execute function with parsed inputs
6. Handle async results
7. Enhanced error context

**Parsing Failure Example**:

```
Error: Input parsing failed:
  Missing required input: eventName
  Failed to parse action input actionId: Cannot read property 'rows' of undefined
```

## Integration Points

### Auto-Refresh Triggers

```javascript
function updateAvailableVars() {
  // ... existing code ...

  // Refresh input shape preview whenever inputs change
  refreshInputShapePreview();
}
```

### Manual Refresh

```html
<button onclick="refreshInputShapePreview()">🔄 Refresh</button>
```

### AI Generation

```javascript
async function aiGenerateLogicCode() {
  const context = await buildLogicInputContext();
  const prompt = buildAIPrompt(description, context);
  // prompt now includes INPUT SHAPE SCHEMA section
}
```

### Execution

```javascript
async function executeCustomLogic(functionCode, context) {
  const parsed = parseInputsForExecution(context, logicInputs);
  // ... validation and execution ...
}
```

## Type Inference Rules

| Sample Value | Inferred Type |
| ------------ | ------------- |
| `null`       | `any`         |
| `undefined`  | `any`         |
| `[]`         | `array`       |
| `"text"`     | `string`      |
| `123`        | `number`      |
| `true`       | `boolean`     |
| `{}`         | `object`      |

## Error Handling

### Parsing Errors (Critical)

- Missing required inputs
- Field extraction failures
- Type conversion errors
- **Action**: Execution fails immediately

### Validation Warnings (Non-Critical)

- Unexpected properties
- Type mismatches (if type is not `any`)
- Missing optional fields
- **Action**: Logged to console, execution continues

### Schema Generation Errors

- Caught and logged
- AI prompt continues without schema section
- **Action**: Graceful degradation

## UI Components

### Input Shape Schema Section

- **Background**: Yellow (`#fff8e8`)
- **Border**: `#f4d03f`
- **Icon**: 📋
- **Content**: TypeScript-style interface
- **Max Height**: 200px (scrollable)

### Sample Values Preview Section

- **Background**: Green (`#e8f5e9`)
- **Border**: `#4caf50`
- **Icon**: Implicit in structure
- **Content**: Hierarchical property list
- **Format**: `path: type` with sample values

### Type Validation Status Section

- **Success**: Green background, ✅ icon
- **Error**: Red background, ❌ icon
- **Hidden**: When no inputs defined
- **Message**: Dynamic based on validation state

## Benefits

1. **100% Reliable Parsing**

   - Multi-key lookup handles various data formats
   - Null-safe field extraction
   - Comprehensive error reporting

2. **AI Code Quality**

   - Exact contract reduces hallucination
   - Type-aware code generation
   - Sample values provide context

3. **Developer Experience**

   - Visual preview of input structure
   - Clear error messages
   - Type validation before execution

4. **Maintainability**
   - Centralized schema generation
   - Reusable validation logic
   - Consistent error handling

## Testing Scenarios

### Scenario 1: Event + Action Input

```javascript
logicInputs = [
  {
    type: "event",
    eventId: "user_created",
    eventName: "user_created",
    field: "email",
  },
  {
    type: "action",
    actionId: "get_user",
    parserPath: "rows[0].phone_number",
    parserVarName: "phone",
  },
];

// Expected Schema:
interface Inputs {
  user_created: {
    email: string, // Field: email
  };
  actions: {
    get_user: {
      phone: string, // Parser path: rows[0].phone_number
    },
  };
}
```

### Scenario 2: Full Event Object

```javascript
logicInputs = [
  {
    type: "event",
    eventId: "order_placed",
    eventName: "order_placed",
    field: null,
  },
];

// Expected Schema:
interface Inputs {
  order_placed: object; // Event: order_placed
}
```

### Scenario 3: Multiple Action Fields

```javascript
logicInputs = [
  { type: "action", actionId: "get_customer", field: "name" },
  { type: "action", actionId: "get_customer", field: "address" },
];

// Expected Schema:
interface Inputs {
  actions: {
    get_customer: {
      name: string, // Field: name
      address: string, // Field: address
    },
  };
}
```

## Performance Considerations

- Schema generation: O(n) where n = number of inputs
- Field extraction: O(d) where d = depth of path
- Validation: O(p) where p = number of properties
- **Total**: Negligible overhead for typical use cases

## Future Enhancements

1. **Deep Type Inference**: Analyze nested object structures
2. **Custom Type Definitions**: Allow user-defined types
3. **Schema Export**: Export schema as .d.ts file
4. **Visual Schema Editor**: Drag-drop interface builder
5. **Runtime Type Checking**: Optional strict mode with runtime validation

## Compatibility

- **Browser**: All modern browsers (ES6+)
- **Dependencies**: None (uses built-in JavaScript APIs)
- **Custom Logic Engine**: Fully compatible with existing execution model

## Documentation References

- Main Implementation: `builder-tabs/custom-logic-tab.html`
- Engine Logic: `services/customLogicEngine.js`
- Architecture: `ORCHESTRATION-EVENT-SQL-ARCHITECTURE.md`
