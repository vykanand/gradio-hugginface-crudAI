# Workflow Editor, DB Actions, Connector Nodes, and Custom Logic — Reference

This document describes the full functionality, data flows, UI affordances, runtime contracts, and best practices for the Workflow Editor and its main building blocks: DB Actions, Connector Nodes, and Custom Logic.

**Intended audience:** developers extending the project, QA engineers, and power users building workflows.

---

## 1 — Overview

- The Workflow Editor is a visual canvas used to compose workflows by wiring together nodes (Connectors, DB Actions, Custom Logic, Transform nodes, etc.).
- Nodes are runtime primitives. Each node has configuration, inputs, and outputs. Workflows are persisted as a collection of nodes and edges with metadata (IDs, names, version).
- The editor and its tabs are implemented in `orchestration-builder.html` and inlined tab fragments (e.g., custom logic). Custom logic entries are persisted via the `/api/custom-logic` API.
- Execution engine expects an object-shaped context with `events`, `actions`, and other namespaces (depending on node types).

---

## 2 — Workflow Editor (UI & UX)

Purpose

- Create, visualize, and edit workflow graphs.
- Expose properties for each node and let users map data between nodes.

Core UI elements

- Canvas: drag/drop nodes, pan/zoom, and create edges by connecting node handles.
- Sidebar / property panel: displays node configuration when selected.
- Tabs: builder tabs include `Custom Logic`, `DB Actions`, `Executions`, `Variables`, etc.
- Node palette: list of available node types (Connectors, DB Actions, Custom Logic, transforms).

Node lifecycle

- Create node → configure properties → wire inputs/outputs → save workflow.
- Each node has an `id`, `type`, `label/name`, `position`, and `data` object for configuration.
- Workflows may be saved and versioned by the editor; editor stores local metadata and sends the serialized graph to the backend endpoints.

Developer hooks and events

- `window.nodes` — runtime array of nodes (used by `attachInputsFromConnectNodes()` and other helpers).
- `currentWorkflow` — host page global with the active workflow metadata (id, name).
- `switchTab()` / `initCustomLogicTab()` — tab activation/init hooks.

Interaction patterns

- Attach inputs to Custom Logic via Connect nodes using the `Attach Inputs from Connect Nodes` action. This looks at `window.nodes` for nodes of type `connect` and maps them into the logic's `inputs`.
- Test-run Custom Logic in-place using Test Data (JSON) and the editor-runner.

Accessibility & UX

- Use clear labels for node inputs/outputs and provide helpful sample data in test UI.
- Persist example contexts so users can reproduce test runs easily.

---

## 3 — DB Actions

Purpose

- DB Actions encapsulate a database query/operation (CRUD) that can run inside the workflow.
- They expose inputs (parameters) and outputs (rows, affected count, single value).

Where configured

- DB connection configuration is generally stored in `config/database.json` or an equivalent project-level store.
- DB Action definitions are either authored in the UI or sourced from connectors or stored definitions.

Typical fields

- `id` — unique identifier
- `name` — human-friendly name
- `description` — optional
- `type` — `db_action`
- `connection` — which DB connection to use
- `query` — parameterized SQL or ORM instruction
- `parameters` — list of parameter names and types (string, number, boolean, object)
- `resultSchema` — optional schema describing returned fields

Execution contract

- When executed, the DB Action receives an inputs map (from connected nodes, custom logic, or workflow context) and returns a result object.
- The runtime must sanitize parameter values and use parameterized statements (no string interpolation).

Security and best practices

- Always use parameterized queries or prepared statements to avoid SQL injection.
- Restrict DB credentials — only minimal privileges required for the action.
- Avoid exposing raw `query` editing to untrusted users; prefer parameterized templates and whitelist tables/columns where possible.

DB Action testing

- Provide sample parameters in the action UI and a test runner that executes against a safe test DB or a read-only user.

---

## 4 — Connector Nodes

Purpose

- Connector nodes wrap external services (APIs, SaaS connectors, queues, or internal services) and expose inputs/outputs.
- They are commonly typed as `connect` nodes in the graph.

Configuration

- Each connector node has: `id`, `type: 'connect'`, `data` object (holding connector-specific settings), `name/label`.
- Connector configuration may reference a connector definition in `metadata/connectors.json` which contains supported capabilities and sample response shapes.

Behavior

- Connector nodes typically run at workflow execution time and return a structured payload (object, array, or scalar).
- They can be used as input sources for Custom Logic via `attachInputsFromConnectNodes()` which maps connectors to logic input definitions.

Input mapping

- Connect nodes may present a list of output fields; the editor lets users map those fields into downstream node inputs or into custom logic `inputs` definitions.

Connector troubleshooting

- If a connector returns inconsistent shapes, use a transformation node to normalize the payload before mapping to logic.
- Log connector responses in executions view for debugging.

---

## 5 — Custom Logic

Purpose

- Custom Logic allows writing small JavaScript functions that run inside the workflow to transform data, implement conditional logic, enrich payloads, or orchestrate local decisions.

How logic is defined

- Each custom logic record contains:
  - `id`, `name`, `description`
  - `inputs` — array describing expected inputs (type: `event` or `action`, `eventName`/`actionId`, `field` or `parserPath`)
  - `functionCode` — JavaScript source to execute. It should accept `inputs` as the first (and only) parameter, e.g. `function(inputs) { return { foo: inputs.event_order.amount }; }`.
  - `exampleContext` / `exampleContextUI` — saved test payloads for reproducing runs.

Execution model

- The editor's runner uses a sandboxed function invocation: `new Function('inputs', functionCode)` and calls it with the parsed/validated `inputs` object.
- The inputs object is built from the workflow context and the node attachments (events map, actions map). If no inputs are defined, the runner falls back to passing the raw test JSON object.
- The `parseInputsForExecution(rawContext, inputDefinitions)` helper transforms the raw UI test data into the expected `inputs` object, extracting fields using dot/array paths and mapping actions/events into namespaced objects.

APIs

- `/api/custom-logic` — GET to list; POST to create
- `/api/custom-logic/:id` — GET/PUT/DELETE to manage logic entries
- `/api/unified-workflows/:workflowId/components` — (compat layer) may provide per-workflow stored components (logics/DB actions) to merge with global list

Editor features

- Attach inputs from Connect nodes: inspects `window.nodes` for `type === 'connect'` and adds matching entries to the logic's `inputs`.
- AI-assisted generation: the tab may integrate with `/ai/send` (or a direct AI endpoint) to generate starter function code from description + input schema.
- Test runner: accepts raw JSON test data (UI-oriented and engine-oriented), executes the logic, and displays success/failure with stack traces.
- Example context persistence: the editor saves both the engine-shaped `exampleContext` and the UI-shaped `exampleContextUI` so tests are reproducible.

Errors and debugging

- Common errors: missing input field, invalid JSON in test data, exceptions in user code.
- The editor surface shows execution errors with stack traces; it also displays input parsing warnings.

Security

- Custom logic runs as plain JavaScript on the server or client depending on deployment. For server-side execution, sandboxing is required. For client-side test-run, execution is local and may run arbitrary JS — do not accept untrusted input or persist unsafe code without review.

Best practices for writing logic

- Keep functions small and pure where possible.
- Validate inputs early and provide helpful error messages.
- Use defensive extraction: `extractFieldValue(obj, 'data.user[0].name')` rather than brittle `obj.data.user[0].name`.

Example

```js
// functionCode example
function(inputs) {
  // inputs.events.order => { id, total, items }
  const order = inputs.order || inputs.events && inputs.events.order;
  if(!order) throw new Error('Order missing');
  const totalCents = Math.round((order.total || 0) * 100);
  return { totalCents };
}
```

---

## 6 — Data Models & Runtime Shapes

- Workflow serialized object: `{ id, name, nodes: [...], edges: [...], metadata }`.
- Node: `{ id, type, position: {x,y}, data: { /* type-specific */ }, label }`.
- Custom Logic: `{ id, name, description, inputs: [...], functionCode, exampleContext, exampleContextUI }`.
- Execution context (engine): `{ events: { [eventId]: {...} }, actions: { [actionId]: {...} }, variables: {...} }`.

---

## 7 — Testing, Playwright, and Determinism

- For reliable automated tests (Playwright), ensure tab fragments execute deterministically by inlining fragment scripts into the host page or guaranteeing load-order.
- Use the `Attach Inputs from Connect Nodes` button for deterministic input mapping during tests. The helper inspects `window.nodes` to find `connect` nodes.
- Tests should seed `window.currentWorkflow`, `window.nodes`, and network API mocks for `/api/custom-logic` and `/api/unified-workflows/:id/components` if needed.

Quick test harness tips

- Seed `window.nodes = [{ id: 'n1', type: 'connect', data: { connectorName: 'My API' } }, ...]` before opening the Custom Logic tab.
- Seed `window.currentWorkflow = { id: 'wf_1' }` if per-workflow components are used.

---

## 8 — Troubleshooting & Common Fixes

- "Fragment HTML showing as text": ensure the fragment's `<script>` tags execute (do not double-escape HTML) and that fragments are inlined or inserted as DOM nodes, not appended as text nodes.
- "Illegal return statement" or top-level parse errors: avoid injecting module-type code or top-level `await` into non-module HTML contexts.
- Missing globals on tests: set `window.nodes` and `window.currentWorkflow` fixtures before running UI tests.
- AI generation failures: verify runtime config at `window.RUNTIME_CONFIG` and fallback to the `/ai/send` proxy endpoint.

---

## 9 — Deployment & Security Notes

- Validate and sanitize all user-provided SQL and JS code.
- Audit who can create/edit Custom Logic; treat code authorship as an elevated permission.
- For server-side execution of custom code, use a secure sandbox (e.g., vm2 with strict limits) or convert logic to declarative transforms where possible.

---

## 10 — Next Steps / Extension Points

- Add typed schemas for inputs and auto-generate sample test data.
- Add a rules engine that compiles custom logic to a safer subset or WebAssembly for sandboxed execution.
- Expand connector metadata to include sample responses for better UI mapping.

---

If you want, I can:

- Paste this README into `docs/WORKFLOW_EDITOR_AND_CUSTOM_LOGIC_README.md` (already done),
- Update `README.md` root to link to it,
- Or generate a concise quickstart for creating a first custom logic node and testing it via Playwright.

Which follow-up would you like next?
