# Event-Driven SQL Orchestration Architecture

## Overview

This document describes the comprehensive, scalable architecture for event-driven SQL execution in the orchestration platform.

## Architecture Decision: Hybrid Metadata-Driven with Validation

After analyzing requirements for scalability, reliability, accuracy, and efficiency, we've implemented a **Hybrid Metadata-Driven Architecture with Multi-Sample Validation**.

### Why This Approach?

**✅ Scalability**: Metadata-driven design allows dynamic addition of events and actions without code changes

**✅ Reliability**: Multi-sample testing with real events catches edge cases before deployment

**✅ Accuracy**: AI-powered generation with full context (events + DB schema + orchestration grammar) produces correct SQL

**✅ Efficiency**: Runtime execution uses pre-validated mappings, avoiding repeated validation overhead

**✅ Flexibility**: Easy to modify, version, and rollback event-SQL mappings

## System Components

### 1. Event Binding System

**Purpose**: Connect events from the event registry to database actions

**How It Works**:

```
1. User clicks "Add Event" in action editor
2. System fetches all events from /api/event-registry
3. User selects event(s) to bind to the action
4. System fetches actual event records from /api/event-records
5. Real payload data is extracted and schema is inferred
6. Event binding is stored in action metadata
```

**Data Structure**:

```javascript
eventBindings: [
  {
    eventId: "user:created",
    eventName: "user:created",
    eventDescription: "",
    payloadSchema: {
      userId: { type: "integer", sample: 123 },
      email: { type: "string", sample: "user@example.com" },
      timestamp: { type: "datetime", sample: "2024-02-12T10:30:00Z" },
    },
  },
];
```

### 2. AI-Powered SQL Generation

**Purpose**: Generate optimal SQL with event variable placeholders

**Context Provided to AI**:

1. **Business Requirement**: User's description of what the action should do
2. **Event Schemas**: All bound events with field names, types, and sample values
3. **Database Schema**: Tables, columns, types, constraints from DB explorer
4. **Orchestration Grammar**: Syntax rules and examples for {{event.field}} usage

**AI Prompt Structure**:

```
=== ORCHESTRATION EVENT-TO-SQL MAPPING ===

TASK: Generate SQL query with {{event.fieldName}} syntax

BUSINESS REQUIREMENT:
<user's description>

AVAILABLE EVENT PAYLOADS:
Event: "user:created"
  - userId: integer (example: 123)
  - email: string (example: "user@example.com")

DATABASE SCHEMA:
Table: users
  - id: integer PRIMARY KEY
  - email: varchar(255)
  - created_at: datetime

ORCHESTRATION GRAMMAR:
- Use {{event.fieldName}} for dynamic values
- Example: INSERT INTO users (id, email) VALUES ({{event.userId}}, {{event.email}})

REQUIREMENTS:
1. Generate complete, valid SQL
2. Use {{event.fieldName}} for all dynamic values
3. Match types correctly
4. Return ONLY SQL, no explanations
```

**Output Example**:

```sql
INSERT INTO users (id, email, created_at, status)
VALUES ({{event.userId}}, {{event.email}}, {{event.timestamp}}, 'active')
```

### 3. Variable Mapping & Detection

**Purpose**: Automatically detect and validate {{event.field}} parameters in SQL

**How It Works**:

```javascript
// Regex pattern detects all {{event.field}} in SQL
const paramRegex = /\{\{event\.(\w+)\}\}/g;

// Extracted parameters are validated against bound event schemas
// User sees which event provides each field
// Type mismatches are highlighted
```

**UI Display**:

- Shows all detected parameters
- Indicates source event for each parameter
- Displays field type and description
- Highlights missing or invalid parameters

### 4. Multi-Sample Testing with Real Events

**Purpose**: Validate SQL with actual event data before deployment

**Test Process**:

```
1. Fetch up to 3 random real event records for each bound event
2. Extract payload from each record
3. For each sample:
   a. Replace {{event.field}} with actual values from payload
   b. Execute SQL against real database
   c. Record success/failure and results
4. Generate comprehensive test report
5. Store validation metadata if all tests pass
```

**Validation Metadata**:

```javascript
variableMappings._validation = {
  tested: true,
  testDate: "2024-02-12T14:30:00Z",
  samplesCount: 6, // 3 samples × 2 events
  allPassed: true,
};
```

**Benefits**:

- Catches type mismatches
- Validates against real data variations
- Ensures SQL syntax correctness
- Tests with multiple scenarios automatically

### 5. Runtime Execution Engine

**Purpose**: Execute validated event-SQL mappings when events fire

**Execution Flow**:

```
Event Fired → Event Bus → Orchestration Worker
                               ↓
                    Load Action Metadata
                               ↓
                    Check if Event Matches Bindings
                               ↓
                    Extract Event Payload
                               ↓
                    Replace {{event.field}} with Values
                               ↓
                    Execute SQL via dbExecutionEngine
                               ↓
                    Log Result & Handle Errors
```

**Error Handling**:

- Missing fields → Log error, send to DLQ
- Type mismatch → Attempt conversion or fail gracefully
- SQL execution failure → Retry with backoff, then DLQ
- All errors logged to audit trail

### 6. Metadata Storage

**Purpose**: Store event-SQL mappings persistently

**Storage Location**: `/metadata/actions/`

**File Structure**:

```json
{
  "id": "action_001",
  "name": "Create User on Registration",
  "description": "Insert user record when registration event fires",
  "query": "INSERT INTO users (id, email, created_at) VALUES ({{event.userId}}, {{event.email}}, {{event.timestamp}})",
  "eventBindings": [
    {
      "eventId": "user:created",
      "eventName": "user:created",
      "payloadSchema": { ... }
    }
  ],
  "variableMappings": {
    "userId": { "eventId": "user:created", "field": "userId", "type": "integer" },
    "email": { "eventId": "user:created", "field": "email", "type": "string" },
    "timestamp": { "eventId": "user:created", "field": "timestamp", "type": "datetime" },
    "_validation": {
      "tested": true,
      "testDate": "2024-02-12T14:30:00Z",
      "samplesCount": 3,
      "allPassed": true
    }
  }
}
```

## Workflow Examples

### Creating an Event-Driven Action

**Step 1: Define Action**

```
Name: "Create Order Record"
Description: "Insert order into database when order:placed event fires"
```

**Step 2: Bind Events**

```
Click "Add Event" → Select "order:placed" event
System fetches real event data:
  - orderId: 456
  - customerId: 789
  - totalAmount: 99.99
  - items: [...]
```

**Step 3: Generate SQL with AI**

```
Click "✨ AI Suggest"
AI generates:
  INSERT INTO orders (order_id, customer_id, total, status, created_at)
  VALUES ({{event.orderId}}, {{event.customerId}}, {{event.totalAmount}}, 'pending', NOW())
```

**Step 4: Review Variable Mapping**

```
System auto-detects:
  ✓ orderId → from order:placed (integer)
  ✓ customerId → from order:placed (integer)
  ✓ totalAmount → from order:placed (number)
```

**Step 5: Test with Real Events**

```
Click "🎲 Test with Real Events"
System fetches 3 random order:placed events
Executes SQL with each payload
Shows results:
  ✅ Test 1: order:placed (Sample 1) - 1 row inserted
  ✅ Test 2: order:placed (Sample 2) - 1 row inserted
  ✅ Test 3: order:placed (Sample 3) - 1 row inserted
```

**Step 6: Save**

```
Click "Save"
Action metadata saved to /metadata/actions/action_create_order.json
Runtime orchestration worker can now execute this mapping automatically
```

### Runtime Execution

**When order:placed Event Fires**:

```
1. Event captured by event bus
2. Orchestration worker loads all actions
3. Finds "Create Order Record" with order:placed binding
4. Extracts payload: { orderId: 999, customerId: 111, totalAmount: 49.99 }
5. Replaces variables:
   INSERT INTO orders (order_id, customer_id, total, status, created_at)
   VALUES (999, 111, 49.99, 'pending', NOW())
6. Executes via dbExecutionEngine
7. Logs success to audit trail
```

## Advanced Features

### 1. Many-to-Many Event Bindings

**Scenario**: Action needs data from multiple events

```javascript
eventBindings: [
  { eventId: "order:placed", ... },
  { eventId: "payment:confirmed", ... }
]

// SQL can reference fields from both events
UPDATE orders
SET status = 'paid',
    payment_id = {{event.paymentId}},  -- from payment:confirmed
    updated_at = NOW()
WHERE order_id = {{event.orderId}}     -- from order:placed
```

**Runtime Behavior**:

- Action triggers when ANY bound event fires
- Only variables from the triggering event are available
- Other event fields must be NULL or have defaults

### 2. Conditional Execution (Future)

```javascript
{
  "eventBindings": [...],
  "executionConditions": {
    "eventField": "orderStatus",
    "operator": "equals",
    "value": "confirmed"
  }
}
```

### 3. Multi-Step Transactions (Future)

```javascript
{
  "steps": [
    {
      "query": "INSERT INTO orders ...",
      "onSuccess": "step2"
    },
    {
      "id": "step2",
      "query": "UPDATE inventory ..."
    }
  ]
}
```

### 4. Idempotency (Current)

Already supported via idempotencyStore:

- Duplicate event detection
- Prevents double-execution
- Configurable TTL

## Best Practices

### For Users Creating Actions

1. **Always bind events first** before writing SQL
2. **Use AI Suggest** to get optimal SQL with correct syntax
3. **Test with Real Events** to validate with actual data
4. **Review variable mappings** to ensure all fields are correctly bound
5. **Save only after successful tests** to ensure reliability

### For Event Producers

1. **Maintain consistent payload schemas** - don't change field names/types
2. **Include all required fields** in every event
3. **Use proper data types** (numbers as numbers, not strings)
4. **Add timestamps** to all events
5. **Document event schemas** for users creating actions

### For DB Schema Designers

1. **Match column types to event field types** where possible
2. **Use nullable columns** for optional event fields
3. **Add indexes** on columns frequently used in event-driven queries
4. **Consider partitioning** for high-volume event-driven tables

## Performance Considerations

### Database Impact

- Event-driven INSERTs can create high write load
- Use batch processing for high-frequency events
- Consider async processing with queues
- Monitor connection pool usage

### Caching Strategy

- Event schemas cached after first fetch
- DB schema cached and refreshed on demand
- Action metadata loaded at worker startup
- Validation results stored to avoid re-testing

### Scalability

- Horizontal scaling: Deploy multiple orchestration workers
- Vertical scaling: Increase worker thread pools
- Event partitioning: Route events to specific workers
- Database sharding: Distribute event-driven tables

## Monitoring & Observability

### Key Metrics

- Event processing rate (events/sec)
- SQL execution latency (ms)
- Error rate (failures/total)
- Validation pass rate (%)
- Queue depth (pending events)

### Logging

- All event-SQL executions logged
- Payload data included (configurable)
- Errors with full stack traces
- Performance timing data

### Alerting

- Failed executions → Slack/Email
- High error rate → PagerDuty
- Queue backup → Dashboard warning
- Database connection failures → Critical alert

## Troubleshooting

### Issue: SQL execution fails in production but tests passed

**Cause**: Real event has different schema than test samples

**Solution**:

- Check event schema evolution
- Add validation for required fields
- Use try-catch with fallback values

### Issue: Performance degradation with high event volume

**Cause**: Database write bottleneck or connection pool exhaustion

**Solution**:

- Enable batch processing
- Increase connection pool size
- Consider async/queue-based processing
- Add database indexes

### Issue: Variable not found in event payload

**Cause**: Event schema changed or field is optional

**Solution**:

- Update event bindings with new schema
- Re-test with current events
- Add NULL handling in SQL

## Future Enhancements

1. **Visual Query Builder**: Drag-drop interface for SQL generation
2. **Schema Validation**: Automatic detection of schema mismatches
3. **Rollback Support**: Undo actions on event replay
4. **Event Filtering**: Execute only when conditions match
5. **Transformation Functions**: Apply functions to event fields (e.g., UPPER, TRIM)
6. **Multi-Event Correlation**: Wait for multiple events before executing
7. **Dead Letter Queue UI**: View and retry failed executions
8. **Performance Analytics**: Query execution statistics and optimization suggestions

## Conclusion

This architecture provides:

- **Scalability** through metadata-driven design
- **Reliability** via multi-sample testing
- **Accuracy** with AI-powered generation and full context
- **Efficiency** using validated mappings at runtime
- **Flexibility** for easy modification and evolution

The hybrid approach balances ease of use with production-grade reliability, making it suitable for both prototyping and production deployments.

---

**Version**: 1.0  
**Last Updated**: 2024-12-24  
**Maintainer**: Orchestration Team
