# Workflow Metadata Mapping (single source of truth)

This document defines the canonical metadata layout and migration guidance for moving legacy workflow definitions into the unified store.

## Canonical store

- Path: `config/metadata/unified-workflows.json`
- Structure (recommended):
  - `{ "version": "1.0.0", "definitions": [ { "id": "wf_xxx", "name": "...", "components": [...], "steps": [...], ... }, ... ] }`
- The server API and UI rely on `unified-workflows.json` as the single source of truth for workflow definitions and their components.

## Component shape

- A workflow contains components under one of these properties (normalize to `components`):
  - `components` (preferred array or object map)
  - `logics` (legacy alias)
  - `nodes` / `steps` (legacy names)

- Each component entry ideally includes:
  - `id` (string, unique within workflow)
  - `type` (e.g., `custom-logic`, `action`, `connect`, `event`)
  - `name` (optional human-readable)
  - `meta` or other provider-specific fields
  - `logicId` (for nodes that reference entries in `config/metadata/custom-logic.json`)
  - `action` or `actionId` (for nodes referencing DB/action definitions)

## Mapping rules

- `custom-logic` nodes reference definitions in `config/metadata/custom-logic.json` by `logicId`.
- `action` nodes reference actions/DB connectors by `action` or `actionId` that map into `config/metadata/actions.json` or taxonomy indexes.
- When the UI requests `/api/unified-workflows/:id/components`, the server returns a normalized object map keyed by each component's `id` or `name`.

## Migration guidance

1. Validate legacy workflows
   - Legacy file: `config/metadata/workflows.json` (may be an array or an object with `definitions`)
   - Confirm all workflow entries have unique `id` values.
2. Transform and merge
   - For each legacy workflow, produce an entry shaped like: `{ id, name, components: componentsArrayOrMap, ... }`
   - Preserve `logicId` / `action` references unchanged so custom-logic and action definitions remain resolvable.
3. Append to unified store
   - Add transformed entries into `unified-workflows.json.definitions`.
   - Ensure `unified-workflows.json` remains valid JSON and increment `version` if desired.
4. Verify
   - Restart the server and exercise `GET /api/unified-workflows/:id` and `GET /api/unified-workflows/:id/components` for migrated workflows.
   - Confirm the UI shows workflow-scoped custom logics and no 404s.
5. Remove legacy file (optional)
   - After verification, archive or remove `config/metadata/workflows.json` to avoid confusion.

## Automation suggestions

- Create a small migration script (`scripts/migrate-workflows-to-unified.js`) that:
  - Reads legacy file, normalizes entries, writes them into `unified-workflows.json` (merging without overwriting existing ids), and creates a backup of the originals.
- Run the migration in dev first, run Playwright tests targeting custom-logic flows, then apply in production.

## Server behavior

- The server should only read workflows from `unified-workflows.json` at runtime.
- Any automatic migration logic should populate `unified-workflows.json` on initialization (one-time action). After migration completes and is verified, the server must not use legacy files as runtime fallbacks.

## Notes

- Keep `config/metadata/custom-logic.json` and `config/metadata/actions.json` as separate stores for logic and action definitions; workflows reference them by id.
- The frontend normalizes API responses; prefer returning arrays for `components` when creating workflows, but the server will convert arrays to object maps for backwards compatibility with existing UI code.
