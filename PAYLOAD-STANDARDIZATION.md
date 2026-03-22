# Event Payload Standardization

## Summary

All events in the orchestration platform now use a **unified `payload{}` structure**. There is no `detail` field anywhere in the system.

## Standardized Event Envelope

### Stored Event Record (Kafka)
```javascript
{
  id: "uuid",                    // Event ID
  event: "module:action",        // Canonical event name
  module: "delivery",            // Module name
  domain: "delivery",            // Domain (same as module)
  version: 1,                    // Version number
  payload: { ... },              // Data payload (always present)
  ts: 1674120000000,             // Timestamp
  producer: {                    // Event producer
    service: "orchestrator-server",
    instance: "server-1"
  },
  actor: {                       // Who triggered this event
    user: "alice@example.com",
    role: "admin",
    group: "ops"
  },
  status: "pending",             // Event status
  attempts: 0,                   // Retry attempts
  modalSessionId: "session-123"  // Optional: modal context
}
```

### Broadcast Event (SSE Stream)
```javascript
{
  ts: 1674120000000,             // Broadcast timestamp
  id: "uuid",                    // Event ID
  module: "delivery",            // Module name
  event: "delivery:updated",     // Event name
  level: "domain",               // Event level (domain|technical)
  actor: { ... },                // Actor info
  modalSessionId: "...",         // Modal session if present
  payload: { ... }               // Data payload
}
```

## Input Normalization

Clients can send events in multiple formats, but they are **all normalized to the standard structure**.

### Case 1: Explicit Payload
**Input:**
```javascript
{
  event: "delivery:updated",
  module: "delivery",
  payload: {
    id: 1,
    tracking_number: "AWB123",
    status: "in_transit"
  }
}
```
**Result:** Payload preserved as-is ✓

### Case 2: Detail Field (Legacy)
**Input:**
```javascript
{
  event: "delivery:created",
  module: "delivery",
  detail: {
    id: 2,
    tracking_number: "AWB456"
  }
}
```
**Result:** `detail` is normalized to `payload` ✓

### Case 3: Loose Fields
**Input:**
```javascript
{
  event: "order:processed",
  module: "order",
  order_id: 123,
  customer_id: 456,
  amount: 99.99
}
```
**Result:** Loose fields are wrapped in `payload` (metadata fields like `id`, `event`, `module` are excluded) ✓

### Case 4: Both Payload & Detail
**Input:**
```javascript
{
  event: "test:event",
  payload: { source: "payload_field" },
  detail: { source: "detail_field" }
}
```
**Result:** `payload` takes precedence, `detail` is ignored ✓

## Implementation Details

### Changes to `eventBus.js`

**Function: `publishEvent(obj, opts)`**
- Lines 256-281: New normalization logic
  - Checks for `evt.payload` first
  - Falls back to `evt.detail` if no payload
  - Wraps remaining fields in payload (excluding metadata)
  - **Always stores in `rec.payload`** (never `rec.detail`)

**Function: `_updateRegistryAndBroadcast(evt)`**
- Lines 363-402: Updated broadcast envelope
  - Removed `detail` field from broadcast
  - Uses only `payload` object
  - Standardized SSE output structure

**Function: `_processSend(id)`**
- Lines 338-361: Sends full event record to Kafka
  - Loads persisted record from Kafka
  - Sends complete record (with payload) to orchestrator-events topic

## API Endpoint

**POST `/api/orchestrator/event`**
- Accepts events in any format (payload, detail, or loose fields)
- Returns: `{ ok: true, id: "uuid", status: "accepted" }`
- Internally normalizes to standard `payload{}` structure

## SSE Stream

**GET `/events/stream`**
- Returns Server-Sent Events with standardized envelope
- All events include `payload` field
- No `detail` field ever appears

## Backward Compatibility

✅ **Fully backward compatible**
- Clients sending `detail` field → automatically normalized
- Clients sending loose fields → automatically wrapped
- Clients sending `payload` → used as-is
- Old system receiving `detail` in events → still works

## Key Points

1. **Single source of truth:** Use `payload{}` everywhere
2. **No `detail` field:** Removed from all persistent and streamed data
3. **Consistent structure:** Same envelope format for all events
4. **Flexible input:** Clients can send data in multiple formats
5. **Clean architecture:** Clear separation of metadata vs. data

## Testing

All three normalization paths tested and verified:
- ✅ Explicit payload → preserved
- ✅ Detail field → normalized to payload
- ✅ Loose fields → wrapped in payload
- ✅ No `detail` field in output
- ✅ SSE stream uses unified structure
