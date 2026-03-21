# CLAUDE.md — Gradio Orchestration Platform

## Project Overview

**gradio-hugginface-crudAI** is a no-code enterprise workflow orchestration and automation engine running at **http://localhost:5050**. It integrates with the **billionerp** ERP platform (localhost:8001) to capture field-level CRUD events and execute complex multi-step business process orchestrations.

The two applications share the same TiDB Cloud MySQL database (`erpz`) and communicate via Apache Kafka for event-driven automation.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20 + Express.js |
| Database | MySQL/TiDB Cloud (mysql2) — DB name: `erpz` (shared with billionerp) |
| Message Queue | Apache Kafka (Zookeeper:2181 + Kafka:9092) |
| Local Storage | LevelDB (event registry + execution history) |
| Frontend | HTML5 + Vanilla JS + Bootstrap 5.3 |
| AI Integration | Google Generative AI + HuggingFace models |
| Vector Search | FAISS (Python-based, faiss/ directory) |
| Container | Docker Compose (3-service stack) |
| Testing | Playwright ^1.55.0 |

---

## File Map

```
gradio-hugginface-crudAI/
├── server.js                          ← Main Express app (2863 lines, all routes)
├── index.html                         ← Main dashboard UI
├── config/
│   ├── database.json                  ← TiDB Cloud credentials (hardcoded)
│   ├── ai-config.js                   ← AI endpoint config (Railway server)
│   ├── orchestration_bindings.json    ← Module→Orchestration event bindings
│   └── metadata/
│       ├── taxonomy.json              ← Domain concepts (producer: localhost:8001)
│       ├── actions.json               ← SQL action templates
│       ├── rules.json                 ← Conditional rule sets
│       └── workflows.json             ← Saved workflow definitions
├── lib/
│   ├── eventBridge.js                 ← Template resolver: {{module:field:value}} → SQL
│   ├── eventRegistry.js               ← Event binding registry + LevelDB persistence
│   └── dbAdapters/
│       ├── mysqlAdapter.js
│       └── jsonAdapter.js
├── services/
│   ├── eventBus.js                    ← Kafka pub/sub + SSE streaming
│   ├── workflowEngine.js              ← Core orchestration engine (37505 lines)
│   ├── executionOrchestrator.js       ← Step execution + variable resolution
│   ├── rulesEngine.js                 ← Conditional routing evaluation
│   ├── customLogicEngine.js           ← Inline JavaScript execution
│   ├── unifiedWorkflowEngine.js       ← Unified execution model
│   ├── backupManager.js               ← Auto-backup (hourly) + restore on startup
│   ├── transactionManager.js          ← Transaction support
│   └── queue.js                       ← Kafka job queue
├── workers/
│   ├── orchestrationWorker.js         ← Kafka consumer for orchestration jobs
│   └── dlqRecoveryWorker.js           ← Dead Letter Queue recovery
├── builder-tabs/
│   ├── events-tab.html                ← Event binding UI
│   ├── actions-tab.html               ← SQL action template editor
│   ├── rules-tab.html                 ← Conditional rules editor
│   ├── custom-logic-tab.html          ← JS code snippet editor
│   └── executions-tab.html            ← Execution history
├── orchestration-builder.html         ← Visual drag-and-drop workflow designer
├── orchestration-manager.html         ← Execution management
├── orchestration-monitor.html         ← Real-time execution monitoring
├── db-explorer.html                   ← DB schema discovery + SQL testing
├── event-registry.html                ← Event binding explorer
├── monitor.html                       ← Live Kafka event stream viewer
├── faiss/                             ← Python vector search (text_indexer.py)
├── docs/
│   ├── ORCHESTRATION_GUIDE.md
│   └── VARIABLE-SYSTEM-README.md
├── Dockerfile
├── docker-compose.yml                 ← zookeeper + kafka + app (port 5050)
└── package.json
```

---

## UI Pages

| URL | Purpose |
|---|---|
| http://localhost:5050/ | Dashboard — AI SQL generator + tools navigation |
| http://localhost:5050/explorer | DB Explorer — schema browser + SQL tester |
| http://localhost:5050/orchestration-builder.html | Visual workflow designer (drag-and-drop) |
| http://localhost:5050/orchestration-manager.html | Execution management |
| http://localhost:5050/orchestration-monitor.html | Real-time execution monitoring |
| http://localhost:5050/event-registry.html | Event binding explorer |
| http://localhost:5050/monitor.html | Live Kafka event stream |
| http://localhost:5050/config | Runtime configuration |

---

## API Endpoints

### Database & AI
| Endpoint | Method | Purpose |
|---|---|---|
| `/database` | GET | List all tables in erpz |
| `/api/db/schema` | GET | Full schema with indexes |
| `/api/schema/:tableName` | GET | Detailed table info |
| `/:tableName` | POST | AI-powered SQL (natural language → SQL) |
| `/execute-sql` | POST | Execute sanitized SQL |
| `/api/ai/send` | POST | Proxy to HuggingFace/Google AI |

### Events & Orchestration
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/orchestrator/event` | POST | Publish event to Kafka |
| `/events/stream` | GET | SSE live event stream |
| `/api/event/execute` | POST | Template-resolve + execute SQL |
| `/api/event-registry` | GET | Events by module |
| `/api/event-registry/bindings` | GET | Full binding registry |
| `/orchestration/bindings` | GET | Module→Orchestration mappings |

### Workflows & Rules
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/workflows` | POST/GET | Save/list workflows |
| `/api/workflows/:id/execute` | POST | Start workflow execution |
| `/api/executions` | GET | List all executions |
| `/api/executions/:id` | GET | Execution detail |
| `/api/rules` | POST/GET | Save/list rule sets |

### Backup
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/backup/create` | POST | Manual backup |
| `/api/backup/list` | GET | List backups |
| `/api/backup/restore/:id` | POST | Restore from backup |
| `/api/health` | GET | Health check |

---

## Event Contract (billionerp → Orchestration)

Events published by billionerp follow this JSON format:

```json
{
  "id": "uuid",
  "event": "<module>:field:<field_name>:<action>",
  "module": "<module_name>",
  "ts": 1766347215683,
  "detail": {
    "field": "<field_name>",
    "value": "<new_value>",
    "module": "<module_name>"
  },
  "producer": {
    "service": "crud-ui",
    "instance": "localhost:8001"
  },
  "actor": {
    "user": "Admin",
    "role": "admin",
    "group": "Administrators"
  },
  "status": "published"
}
```

Example event name: `appsthink_crm:field:phone_number:added`

---

## EventBridge Template Syntax

SQL action templates use `{{module:field:event_type.property}}` placeholders resolved at execution time by `lib/eventBridge.js`:

```sql
-- Template
SELECT emails_value FROM extract_contact
WHERE phoneNumbers_value = {{appsthink_crm:phone_number:added.value}}

-- Resolved
SELECT emails_value FROM extract_contact
WHERE phoneNumbers_value = '+441234567890'
```

---

## Workflow Node Types (Builder)

1. **Action** — SQL template executed against shared DB
2. **Decision** — Rule evaluation → conditional routing
3. **Human Task** — Pause for manual approval
4. **Custom Logic** — Inline JavaScript code execution
5. **Parallel / Sequential** — Execution ordering

---

## Integration with billionerp (localhost:8001)

Both applications share:
- **Same TiDB Cloud database** (`erpz`)
- **Same Kafka event bus** for field-level CRUD events

Integration flow:
```
billionerp (8001) CRUD action
  → Publish event to Kafka topic: orchestrator-events
    → orchestration (5050) EventBus captures
      → Check binding registry for matching orchestration
        → workflowEngine executes bound workflow
          → EventBridge resolves {{templates}} with event payload
            → SQL steps execute against shared erpz DB
              → Results stored in LevelDB execution history
```

billionerp module `urn` (from navigation table) becomes the event prefix:
- `delivery` → `delivery:field:<field>:<action>`
- `appsthink_crm` → `appsthink_crm:field:<field>:<action>`

---

## Architecture Rules

- **Kafka-first** — all orchestration triggers are event-driven via Kafka; avoid polling
- **Template-driven SQL** — use EventBridge `{{}}` syntax, never string-concatenate user values
- **Config-driven workflows** — all orchestrations defined in `config/metadata/*.json` or via builder UI
- **No external CDN** — all assets served locally
- **Bootstrap 5.3** for UI (NOT Bootstrap 3 — that's billionerp's version)
- **Shared DB, isolated logic** — can read/write any `erpz` table, but never modify billionerp PHP
- **postMessage back to billionerp** is NOT used here — this app has its own full-page UI
- **Backup is automatic** — don't manually edit LevelDB or backup JSON files
- **Dead Letter Queue** — failed events go to DLQ; use dlqRecoveryWorker.js for recovery

---

## Dev Commands

```bash
# Full stack (app + Kafka + Zookeeper)
docker-compose up --build app

# Local dev (requires Kafka already running)
PORT=5050 node server.js

# Background orchestration worker
npm run worker

# Run Playwright tests
npm test
```

---

## Environment Variables

```bash
PORT=5050
AI_MODE=proxy|direct              # How client routes AI calls
AI_ENDPOINT=https://...           # Railway AI server URL
KAFKA_BROKERS=kafka:9092          # Kafka connection string
DISABLE_KAFKA=false               # Set true to run without Kafka
AUTO_BACKUP_ENABLED=true          # Hourly auto-backup
AUTO_RESTORE_ENABLED=true         # Restore from latest on startup
ADMIN_API_KEY=changeme            # Admin endpoint auth token
NODE_ENV=development
```

---

## Cross-App Development Workflow

1. Start both apps: `docker-compose up` in each repo
2. Create/modify a billionerp module at localhost:8001
3. Note the module `urn` from the `navigation` table
4. Open orchestration builder: http://localhost:5050/orchestration-builder.html
5. Create orchestration bound to `<urn>:field:<field_name>:<action>`
6. Define SQL action steps using EventBridge templates
7. Trigger the CRUD action in billionerp
8. Monitor live events at http://localhost:5050/monitor.html
9. Check execution at http://localhost:5050/orchestration-monitor.html

---

## Security Notes (Known Issues — Do Not Worsen)

- DB credentials hardcoded in `config/database.json`
- No CSRF tokens on API endpoints
- CORS enabled: `Access-Control-Allow-Origin: *`
- `ADMIN_API_KEY` defaults to `"changeme"` in development
- Event payloads (may contain PII) persisted in LevelDB indefinitely
- SQL sanitization via `cleanAndSanitizeSQL()` but not fully injection-proof

Do not introduce additional security regressions when modifying `server.js` or `lib/eventBridge.js`.

---

## Active Orchestrations (taxonomy.json)

- `crm to extract contacts` — Match CRM phone numbers with extract_contact table
- `crm phone checker` — Find all extract_contact records for a CRM phone
- `appsthink crm to extract_contact matching` — Cross-reference phone field across modules
