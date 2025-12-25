# EventBridge & Query Builder — Deep Dive

This document explains EventBridge, the query template system, the event JSON format ("Event JSON"), and how the Action/Test/Custom Logic flows interact end-to-end. It is intended for developers and architects working on this repository so you can understand what happens behind the scenes and how to extend or troubleshoot the system.

Table of contents

- Overview
- Event JSON format
- Query templating (EventBridge)
- How templates are resolved on the server
- Action metadata and where executed SQL is persisted
- Action test flow (Action Editor)
- Custom Logic tester behavior and integration
- Security, sanitization, and best practices
- Troubleshooting tips and examples

---

## Overview

This project provides an orchestration and builder UI that lets you define Actions (SQL templates) and bind them to Events. EventBridge is the server-side template resolver that substitutes event values into SQL templates using a controlled syntax. After resolution, the resolved SQL can be executed against the configured database pool.

- Key components:

- Event JSON: shape used to represent an event payload (metadata + detail)
- Action metadata (`config/metadata/actions.json`): stores action definitions and optional runtime metadata
- EventBridge (lib/eventBridge.js): resolves templates like `{{module:event:field.path}}` into SQL-safe values or SQL literals
- `/api/event/execute`: server endpoint that accepts a `query` (template) and optional `eventName`/`payload` and returns the resolved query and execution result
- Actions editor: UI that authorizes and tests queries, saving `variableMappings` metadata such as `executedQuery`
- Custom Logic tester: UI to reuse existing action queries and select parser paths; it should reuse the same persisted executed SQL when present

---

## Event JSON format

Events are represented using a flexible envelope with two primary areas:

- `metadata` (optional): top-level metadata fields describing the event
- `detail` (recommended): the business payload for the event (primary fields)

Canonical example:

{
"id": "035f6a4b-b84e-447a-b843-60ac949d6d73",
"event": "appsthink_crm:phone_number:added",
"module": "appsthink_crm",
"ts": 1670000000000,
"detail": {
"field": "phone_number",
"value": "+441234567890",
"module": "appsthink_crm"
}
}

Notes:

- Events frequently have `detail` for primary data and other metadata at root (id, event, ts).
- Event payload schemas in action metadata use `primaryFields` (mapped into `detail`) and `metadataFields` (top-level properties). These schemas include `sample` data for preview and test generation.

---

## Query templating (EventBridge)

Templates are simple mustache-like placeholders embedded in SQL strings. The EventBridge supports resolving placeholders into values by matching them to event payloads or action-bound variables.

Syntax examples:

- `{{appsthink_crm:phone_number:added.phone_number}}` — resolves to the `phone_number` top-level field from the `appsthink_crm:phone_number:added` event payload.
- `{{added.field}}` — a shorthand that uses the first bound event in the action's `eventBindings` or a synthetic alias.

Behavior:

- EventBridge resolves templates to SQL-safe literals. For example, strings are quoted and escaped, numbers are left as-is, and NULL is handled.
- EventBridge exposes two resolution helpers:
  - `resolveQuery(query, payload, binding, opts)` — will throw on missing fields or errors (used when strict behavior is desired).
  - `tryResolveQuery(query, payload, binding, opts)` — returns `{ sql, error }` and is used for safe diagnostics.

Best practices:

- Keep templates explicit (include the event name when possible).
- Prefer `tryResolveQuery` in UI flows to collect diagnostics instead of throwing.

---

## How templates are resolved on the server

The server endpoint `/api/event/execute` accepts a JSON body with:

- `query`: the SQL template string
- `eventName` (optional): the canonical event id most relevant to the query
- `payload` (optional): an event payload object to use for resolution

Server flow:

1. Attempt to resolve via `eventBridge.tryResolveQuery` (if available). If it returns an error, the API surfaces `executedQuery` along with `error` and `details` to the client.
2. If resolved, the server executes the resolved SQL on the MySQL pool using a connection.
3. The response includes both the returned rows (or OkPacket) and the executed SQL in `executedQuery` (or `query`).

This ensures the UI can always show the final SQL the system attempted to run even when the database execution fails.

---

## Action metadata and persisted executed SQL

Actions metadata now live in `config/metadata/actions.json` (single file). Each action object supports these fields:

- `id`, `name`, `description`
- `query` / `template` / `sql` — the authored SQL template
- `eventBindings` — array of event binding descriptors, including `payloadSchema`
- `variableMappings` — runtime metadata persisted by the UI/test runner

We persist executed SQL into `variableMappings.executedQuery` (and `variableMappings._lastExecutedAt`) when a test run succeeds. UI flows and Custom Logic tester should prefer this persisted resolved SQL when present, because it represents a validated, runnable SQL for that action in the target environment.

When saving an action after a successful test run, the Actions editor writes:

```
variableMappings.executedQuery = "SELECT ...;";
variableMappings._lastExecutedAt = "2025-12-24T...Z";
```

This file-backed persistence allows other components (Custom Logic, orchestrations, exporters) to reuse the exact SQL that was verified by the Actions editor.

---

## Action test flow (Actions editor)

1. The developer composes a SQL template in the Action Editor (`action-query`).
2. The developer clicks "Test" and supplies sample event data (or the system synthesizes from `payloadSchema`).
3. The client calls `/api/event/execute` with `query`, `eventName`, and `payload`.
4. The server resolves templates and executes SQL. Response contains `executedQuery` and rows.
5. If the test succeeds, the Actions editor stores `variableMappings.executedQuery` and `_lastExecutedAt`, and optionally `variableMappings._exampleOutputs` with sample rows. These are saved to disk under `config/metadata/actions.json` by the Taxonomy service.

Because `executedQuery` is persisted, other tools (Custom Logic, orchestrator) can reuse the resolved SQL without re-resolving templates.

---

## Custom Logic tester behavior and integration

The Custom Logic tester must reuse the same validated query the Actions editor saved:

- Prefer `action.variableMappings.executedQuery` when executing tests from the Custom Logic tab.
- If `executedQuery` is not present, fall back to `action.query` / `action.template` and invoke `/api/event/execute` with a synthesized sample payload.

This repository now stitches that behavior in `builder-tabs/custom-logic-tab.html` so the tester uses the persisted executed SQL when available.

Parser paths and variable selection:

- When executing a query, the Custom Logic tester receives a structured result (rows or object). The UI renders a field tree for the first row (or the object) and lets the user select parser paths. Selected paths are saved into the action's `variableMappings.parserPaths` (persisted via `/api/actions/:id`).

---

## Security, sanitization, and best practices

- Never interpolate raw user input directly into query templates without escaping. EventBridge is responsible for producing SQL-safe values (proper quoting/escaping).
- Prefer parameterized queries for user-provided inputs when possible. If templates must be used, ensure EventBridge enforces escaping rules.
- Limit which users can run arbitrary queries against the database. Test runners should run with reduced privileges in production.
- Audit `variableMappings` writes — they are file-backed and may be modified if attackers gain filesystem access.

---

## Troubleshooting tips

- If you see JSON parse errors on the client, inspect the server response body in DevTools Network tab — the server now returns `executedQuery` or error details in the JSON body.
- If resolution fails with `Template resolution failed`, verify the placeholder names match the bound event name in the action's `eventBindings` or use full-qualified `module:event:field` syntax.
- To debug resolution locally, use the server-side helper `globalThis.eventBridge.tryResolveQuery(query, payload, binding, [])` in a Node REPL or a small script.

Example CLI snippet (Node):

```js
// node -e "require('./lib/eventBridge'); console.log(globalThis.eventBridge.tryResolveQuery('SELECT * FROM t WHERE phone={{appsthink_crm:phone_number:added.phone_number}}', {phone_number:'123'}, {eventName:'appsthink_crm:phone_number:added'}, []));"
```

---

## Where to look in the codebase

- `lib/eventBridge.js` — template resolution logic and resolver helpers
- `server.js` — `/api/event/execute` which calls EventBridge and executes SQL
- `services/taxonomyService.js` — action metadata persistence (read/write under `config/metadata/actions`)
- `builder-tabs/custom-logic-tab.html` — Custom Logic tester UI and execution flow
- `orchestration-builder.html` — Action Editor UI (test flow and save logic)

---

## Appendix: Example

Action metadata snippet showing persisted query:

```json
{
  "id": "abc-123",
  "name": "Find Contact",
  "query": "SELECT * FROM extract_contact WHERE phoneNumbers_value = {{appsthink_crm:phone_number:added.phone_number}};",
  "variableMappings": {
    "executedQuery": "SELECT * FROM extract_contact WHERE phoneNumbers_value = '+441234567890';",
    "_lastExecutedAt": "2025-12-24T12:00:00.000Z"
  }
}
```

When Custom Logic tester runs for that action, it will send `executedQuery` (if present) to `/api/event/execute` (which will simply execute the SQL) instead of attempting to resolve templates again.

---

If you want this document exported to Microsoft Word (.docx) I can produce a .docx artifact as well — tell me if you want that and I will generate it in the project root.

Thank you — this document should help your team and future contributors understand EventBridge and how action queries are composed, tested, persisted and reused across the system.
