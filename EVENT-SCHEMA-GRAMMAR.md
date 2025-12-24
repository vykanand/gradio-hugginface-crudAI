# Event Schema Grammar

## Overview

This document describes the canonical event schema grammar used by the CRUD UI system and orchestrator. All events follow a consistent envelope structure with metadata at the top level and business data in the `payload` field.

## Core Event Envelope Structure

Every event conforms to the following envelope structure:

```json
{
  "id": "unique-event-id",
  "event": "module:action",
  "module": "module-name",
  "domain": "domain-name",
  "version": 1,
  "payload": {
    /* business data */
  },
  "ts": 1234567890123,
  "producer": { "service": "crud-ui", "instance": "hostname:port" },
  "actor": {
    "user": "username",
    "role": "role",
    "group": "group",
    "organization": "org"
  },
  "status": "published",
  "attempts": 0,
  "level": "domain | technical",
  "publishedTs": 1234567890456
}
```

### Envelope Fields

| Field            | Type    | Required | Description                                                                               |
| ---------------- | ------- | -------- | ----------------------------------------------------------------------------------------- |
| `id`             | string  | Yes      | Unique event identifier (UUID v4)                                                         |
| `event`          | string  | Yes      | Canonical event name following pattern `module:action` or `module:field:fieldname:action` |
| `module`         | string  | Yes      | Module/bounded context that owns this event                                               |
| `domain`         | string  | Yes      | Domain identifier (typically same as module)                                              |
| `version`        | integer | Yes      | Event schema version (currently always 1)                                                 |
| `payload`        | object  | Yes      | Business data - clean POJO without metadata                                               |
| `ts`             | integer | Yes      | Event timestamp (Unix epoch milliseconds)                                                 |
| `producer`       | object  | Yes      | Service and instance that produced the event                                              |
| `actor`          | object  | Yes      | User/system that triggered the event                                                      |
| `status`         | string  | No       | Event delivery status: `pending`, `published`, `failed`                                   |
| `attempts`       | integer | No       | Number of delivery attempts                                                               |
| `level`          | string  | No       | Event granularity: `domain` (business actions) or `technical` (field changes)             |
| `publishedTs`    | integer | No       | Timestamp when event was published to Kafka                                               |
| `field`          | string  | No       | Field name (only for technical-level field events)                                        |
| `canonicalEvent` | string  | No       | Simplified event name for field events (e.g., `module:fieldname:action`)                  |

---

## Event Types

### 1. Domain-Level Events (Button Actions)

Domain-level events represent business actions triggered by user interactions with buttons/forms (Create, Update, Delete). These events have `level: "domain"`.

**Event Naming Pattern**: `module:action`

**Common Actions**:

- `recordAdded` - New record created
- `recordUpdated` - Existing record modified
- `recordDeleted` - Record removed

#### Example: Record Added Event

```json
{
  "id": "2639ecfe-9c72-4f56-8ea5-6bbdbc135615",
  "event": "appsthink_crm:recordAdded",
  "module": "appsthink_crm",
  "domain": "appsthink_crm",
  "version": 1,
  "payload": {
    "email": "mantisray@gmail.com",
    "phone_number": "9384829381",
    "company_name": "Niveus",
    "address": "mangalore padil",
    "name": "Abhishek singh",
    "client_name": "IBM",
    "designation": "CFO",
    "role": "admin",
    "setcontent": true
  },
  "ts": 1766605717121,
  "producer": {
    "service": "crud-ui",
    "instance": "localhost:8001"
  },
  "actor": {
    "user": "Admin",
    "role": "admin",
    "group": "Administrators",
    "organization": "Prudential"
  },
  "status": "published",
  "attempts": 0,
  "level": "domain",
  "publishedTs": 1766605717581
}
```

**Payload Structure**: Contains the complete record data as submitted by the user, including all form fields.

---

### 2. Technical-Level Events (Field Changes)

Technical-level events capture granular field-level changes during form editing. These events have `level: "technical"` and include additional `field` and `canonicalEvent` properties.

**Event Naming Pattern**: `module:field:fieldname:action`

**Common Actions**:

- `added` - Field value set during record creation
- `edited` - Field value changed during record update
- `deleted` - Field value removed

#### Example: Email Field Added Event

```json
{
  "id": "57dbcf66-c8f6-4809-9d47-ef89e32db038",
  "event": "appsthink_crm:field:email:added",
  "module": "appsthink_crm",
  "domain": "appsthink_crm",
  "version": 1,
  "payload": {
    "email": "mantisray@gmail.com"
  },
  "ts": 1766605682125,
  "producer": {
    "service": "crud-ui",
    "instance": "localhost:8001"
  },
  "actor": {
    "user": "Admin",
    "role": "admin",
    "group": "Administrators",
    "organization": "Prudential"
  },
  "status": "published",
  "attempts": 0,
  "level": "technical",
  "field": "email",
  "canonicalEvent": "appsthink_crm:email:added",
  "publishedTs": 1766605682793
}
```

**Payload Structure**: Contains only the single field that changed, as a key-value pair.

**Additional Fields**:

- `field`: The name of the field that changed (`email` in this example)
- `canonicalEvent`: Simplified event name without `:field:` prefix (`appsthink_crm:email:added`)

---

## Actor Structure

The `actor` object identifies who/what triggered the event:

```json
{
  "user": "username or user ID",
  "role": "user role (admin, user, etc.)",
  "group": "user group or team",
  "organization": "organization/tenant name"
}
```

- Populated from user session data (`localStorage.userdat`)
- All fields optional but recommended for audit trails
- Organization field supports multi-tenancy

---

## Producer Structure

The `producer` object identifies the service/instance that generated the event:

```json
{
  "service": "crud-ui | orchestrator-server | custom-service",
  "instance": "hostname:port or container-id"
}
```

- `service`: Name of the service producing the event
- `instance`: Unique instance identifier for distributed systems

---

## Event Lifecycle

Events flow through the following states:

```
[Created] → pending → [Kafka Publish] → published
                            ↓ (failure)
                         retrying → (max attempts) → failed (DLQ)
```

### Status Values

- **`pending`**: Event created and persisted, awaiting Kafka publish
- **`published`**: Successfully published to Kafka topic
- **`failed`**: Exceeded retry attempts, moved to Dead Letter Queue (DLQ)

### Retry Configuration

- `attempts`: Number of delivery attempts (0 = first attempt)
- Max attempts: 6 (configurable via `EVENT_MAX_SEND_ATTEMPTS`)
- Retry backoff: Exponential (base 1000ms, configurable via `EVENT_RETRY_BASE_MS`)

---

## Event Naming Conventions

### Domain Events

```
{module}:{action}
```

Examples:

- `appsthink_crm:recordAdded`
- `inventory:recordUpdated`
- `orders:recordDeleted`

### Technical Events (Field Changes)

```
{module}:field:{fieldname}:{action}
```

Examples:

- `appsthink_crm:field:email:added`
- `appsthink_crm:field:phone_number:edited`
- `inventory:field:quantity:edited`

**Canonical Format** (simplified, without `:field:`):

```
{module}:{fieldname}:{action}
```

Examples:

- `appsthink_crm:email:added`
- `inventory:quantity:edited`

---

## Complete Event Flow Example

### Scenario: User Creates New CRM Contact

1. **User fills form and clicks "Add"**

   - **Domain Event** (button action) fires:
     ```
     Event: appsthink_crm:recordAdded
     Payload: { email, phone_number, company_name, ... }
     ```

2. **While filling the form, each field change generates technical events**:

   - Email field:
     ```
     Event: appsthink_crm:field:email:added
     Payload: { email: "mantisray@gmail.com" }
     ```
   - Phone field:
     ```
     Event: appsthink_crm:field:phone_number:added
     Payload: { phone_number: "9384829381" }
     ```
   - Company field:
     ```
     Event: appsthink_crm:field:company_name:added
     Payload: { company_name: "Niveus" }
     ```

3. **All events are**:
   - Persisted to LevelDB (`storage/event_registry_db`)
   - Published to Kafka topic (`orchestrator-events`)
   - Broadcasted via SSE to connected clients
   - Available via Event Registry API

---

## API Endpoints

### Query Events

```bash
# Get all event records
GET /api/event-records

# Filter by module
GET /api/event-records?module=appsthink_crm

# Filter by event name
GET /api/event-records?event=appsthink_crm:recordAdded

# Get event registry (grouped by module)
GET /api/event-registry
```

### Submit Events

```bash
# Submit new event
POST /api/orchestrator/event
Content-Type: application/json

{
  "id": "uuid-v4",
  "event": "module:action",
  "version": 1,
  "domain": "module",
  "module": "module",
  "payload": { /* business data */ },
  "ts": 1234567890123,
  "producer": { "service": "crud-ui", "instance": "localhost:8001" },
  "actor": { "user": "Admin", "role": "admin", "group": "group", "organization": "org" }
}
```

### Manage Events

```bash
# Delete specific event
DELETE /api/event-records/{id}

# List pending events
GET /api/events/pending

# List Dead Letter Queue
GET /api/events/dlq

# Requeue DLQ event
POST /api/events/requeue/{id}
```

---

## Event Stream (SSE)

Connect to real-time event stream:

```javascript
const eventSource = new EventSource("http://localhost:5050/events/stream");

eventSource.onmessage = (event) => {
  const envelope = JSON.parse(event.data);
  console.log("Received event:", envelope.event, envelope.payload);
};
```

---

## Best Practices

### ✅ DO

- Always include `payload` field at top level (never nested)
- Use clean POJOs in `payload` (no metadata, no envelope fields)
- Generate unique UUIDs for `id` field
- Populate `actor` with current user context
- Use snake_case for field names in payload
- Set `level: "domain"` for business actions, `level: "technical"` for field changes
- Include all required envelope fields

### ❌ DON'T

- Don't nest envelopes (no `detail.payload` or `payload.payload`)
- Don't include envelope metadata in `payload` (no `id`, `event`, `ts`, etc. inside payload)
- Don't mutate payload after event creation
- Don't use `:field:` in domain-level event names
- Don't omit required fields (`id`, `event`, `module`, `payload`, `ts`, `producer`, `actor`)

---

## Schema Validation

Events MUST conform to this structure or they may be rejected/wrapped incorrectly:

```javascript
// Valid envelope structure detection
const isValidEnvelope = (evt) => {
  return (
    evt.id &&
    evt.event &&
    evt.module &&
    evt.payload !== undefined && // Payload field present
    typeof evt.payload === "object" && // Payload is object
    evt.ts &&
    evt.producer &&
    evt.actor
  );
};
```

---

## Migration from Legacy Format

**Old Format** (DEPRECATED):

```json
{
  "id": "...",
  "event": "...",
  "detail": {
    // ❌ Don't use detail
    "payload": {
      /* data here */
    }
  }
}
```

**New Format** (CURRENT):

```json
{
  "id": "...",
  "event": "...",
  "payload": {
    /* data here */
  } // ✅ Payload at top level
}
```

---

## Troubleshooting

### Issue: Events stored with nested `detail.payload`

**Cause**: Frontend not sending `payload` field at top level

**Fix**: Ensure envelope builder includes `payload` property:

```javascript
const envelope = {
  id: uuidv4(),
  event: eventName,
  payload: businessData, // ✅ Required
  // ... other envelope fields
};
```

### Issue: Field events have different structure than button events

**Cause**: Different envelope builders for different event types

**Fix**: Use single envelope builder for all event types (domain and technical)

### Issue: Events show as `pending` forever

**Cause**: Kafka connection issues or retry exhaustion

**Fix**:

- Check Kafka broker connectivity
- Review `/api/events/pending` for stuck events
- Check `/api/events/dlq` for failed events
- Requeue from DLQ via `/api/events/requeue/{id}`

---

## Version History

- **v1.0** (Current): Clean envelope structure with `payload` at top level
  - Introduced `level` field (domain/technical)
  - Added `canonicalEvent` for field events
  - Unified envelope structure across all event types

---

## References

- Event Registry UI: `http://localhost:5050/event-registry.html`
- Orchestration Monitor: `http://localhost:5050/orchestration-monitor.html`
- Source Code: `custom/app/app.js` (frontend), `services/eventBus.js` (backend)
