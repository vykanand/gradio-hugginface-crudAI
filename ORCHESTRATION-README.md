# Business Orchestration System - Architecture Documentation

## 🎯 Overview

This is a **Business Operating System (Business OS)** designed to replace SAP/Oracle ERPs with a metadata-driven, no-code orchestration platform. It implements the strict separation of concerns required for enterprise-scale complexity:

```
TAXONOMY (Language)
   ↓ gives meaning to
EVENTS (Facts)
   ↓ trigger
ORCHESTRATION (Brain)
   ↓ selects
WORKFLOWS (Sequence)
   ↓ use
RULES (Decisions)
   ↓ decide
ACTIONS
   ↓ executed by
WORKERS (Muscles)
```

## 🏗️ Architecture Layers

### 1️⃣ Taxonomy Service (`services/taxonomyService.js`)

**The Language Layer - Defines MEANING**

- **Business Concepts**: Invoice, PurchaseOrder, InventoryItem
- **Business Events**: InvoiceReceived, PurchaseOrderCreated
- **Business Actions**: ReconcileInvoice, ApproveInvoice, AdjustInventory
- **Business Capabilities**: VendorManagement, InventoryManagement

**Storage**: `config/metadata/taxonomy.json`

**Never Does**:

- ❌ Execute logic
- ❌ Make decisions
- ❌ Control flow

### 2️⃣ Rules Engine (`services/rulesEngine.js`)

**The Decision Layer - Decides WHAT**

- **Declarative if-then logic**
- **Condition evaluation** (comparison, and, or, not)
- **Outcome determination**

**Storage**: `config/metadata/rules.json`

**Never Does**:

- ❌ Control sequence
- ❌ Call services directly
- ❌ Define meanings (uses taxonomy)

### 3️⃣ Workflow Engine (`services/workflowEngine.js`)

**The Sequence Layer - Defines WHEN and ORDER**

- **Stateful process execution**
- **Step coordination**
- **State management**
- **Human task handling**
- **Retry and compensation**

**Storage**:

- Definitions: `config/metadata/workflows.json`
- Executions: `storage/orchestrations/workflow_executions.json`

**Never Does**:

- ❌ Encode business policy (uses rules)
- ❌ Hardcode decisions
- ❌ Define meanings (uses taxonomy)

### 4️⃣ Node Workers (Stateless Executors)

**The Muscles - Execute ACTIONS**

Workers declare capabilities:

```javascript
Worker: inventory-worker
Supports Actions:
- DecreaseInventory
- IncreaseInventory
Consumes Concepts:
- InventoryItem
```

Orchestration chooses which worker to call dynamically.

## 🎨 User Interface

### Orchestration Builder (`orchestration-builder.html`)

**4 Main Tabs**:

1. **Workflows** - Drag-and-drop workflow designer

   - Visual node editor
   - Connection management
   - Properties panel
   - Save/load workflows

2. **Taxonomy** - Business language management

   - Concepts (Invoice, Order, etc.)
   - Events (InvoiceReceived, etc.)
   - Actions (ReconcileInvoice, etc.)
   - Add/edit/delete taxonomy entries

3. **Rules** - Business rules editor

   - Rule sets per concept
   - Condition builder
   - Outcome definition
   - Test rules with sample data

4. **Executions** - Live workflow monitoring
   - Running workflows
   - Waiting tasks
   - Completed/failed executions
   - Execution history

## 🔌 API Endpoints

### Taxonomy API

```
GET    /api/taxonomy                 - Get full taxonomy
GET    /api/taxonomy/concepts        - List all concepts
POST   /api/taxonomy/concepts        - Add concept
PUT    /api/taxonomy/concepts/:id    - Update concept
DELETE /api/taxonomy/concepts/:id    - Delete concept
GET    /api/taxonomy/events          - List all events
POST   /api/taxonomy/events          - Add event
GET    /api/taxonomy/actions         - List all actions
POST   /api/taxonomy/actions         - Add action
GET    /api/taxonomy/capabilities    - List all capabilities
POST   /api/taxonomy/capabilities    - Add capability
```

### Rules API

```
GET    /api/rules                    - List all rule sets
GET    /api/rules/:id                - Get rule set
POST   /api/rules                    - Add rule set
PUT    /api/rules/:id                - Update rule set
DELETE /api/rules/:id                - Delete rule set
POST   /api/rules/:id/evaluate       - Evaluate rules with data
```

### Workflow API

```
GET    /api/workflows                - List all workflows
GET    /api/workflows/:id            - Get workflow
POST   /api/workflows                - Add workflow
PUT    /api/workflows/:id            - Update workflow
DELETE /api/workflows/:id            - Delete workflow
POST   /api/workflows/:id/execute    - Start execution
```

### Execution API

```
GET    /api/executions               - List executions (filterable)
GET    /api/executions/:id           - Get execution
POST   /api/executions/:id/complete-task  - Complete human task
```

## 📊 CRUD Event Integration

The `/custom` UI now publishes CRUD events to the orchestration system:

```javascript
Event Structure:
{
  contractVersion: '1.0',
  eventType: 'CRUD',
  action: 'create|update|delete',
  module: 'module_name',
  timestamp: '2025-12-14T...',
  payload: { /* data */ }
}
```

Events are published to Kafka topic `ORCHESTRATIONS_EVENTS` and can trigger workflows dynamically.

## 🎯 Workflow Node Types

1. **Action** ⚡ - Execute a business action via worker
2. **Decision** 🔀 - Conditional branch using rules
3. **Human Task** 👤 - Approval or manual action
4. **Parallel** ⫿ - Execute multiple branches simultaneously
5. **Loop** 🔄 - Repeat steps
6. **End** 🏁 - Complete workflow

## 🔒 Non-Negotiable Constraints

### 1. Event Contract Governance

- ✅ Versioned events
- ✅ Backward compatibility
- ✅ Registry (taxonomy)

### 2. Taxonomy Ownership

- ✅ Central taxonomy service
- ✅ No module-defined meanings
- ✅ Everything references taxonomy IDs

### 3. Workflow State Ownership

- ✅ Only orchestration owns state
- ✅ Workers are stateless
- ✅ No state in ERP modules

## 🚀 Getting Started

### 1. Start the server

```bash
npm start
```

### 2. Open the Orchestration Builder

Navigate to: `http://localhost:5050/orchestration-builder.html`

### 3. Create Your First Workflow

1. Go to **Workflows** tab
2. Click **➕ New Workflow**
3. Drag nodes from sidebar to canvas
4. Connect nodes
5. Configure node properties
6. Click **💾 Save**

### 4. Define Business Language (Taxonomy)

1. Go to **Taxonomy** tab
2. Click **➕ Add Concept** (e.g., "Invoice")
3. Click **➕ Add Event** (e.g., "InvoiceReceived")
4. Click **➕ Add Action** (e.g., "ApproveInvoice")

### 5. Create Business Rules

1. Go to **Rules** tab
2. Click **➕ Add Rule Set**
3. Define conditions and outcomes
4. Test with sample data

### 6. Execute Workflows

```javascript
// Via API
POST /api/workflows/invoice-processing/execute
{
  "inputs": {
    "amount": 50000,
    "vendorId": "V123"
  }
}
```

Or trigger automatically via CRUD events from `/custom` UI.

## 📈 Example: Invoice Processing Workflow

**Trigger Event**: `InvoiceReceived`

**Steps**:

1. **Validate Invoice** (Action)
2. **Determine Approval** (Decision using rule set)
   - Rule: IF amount > 100K → CFO Approval
   - Rule: IF vendor.risk = High → Compliance Approval
3. **Await Approval** (Human Task)
4. **Check Approval Result** (Decision)
5. **Post Accounting** (Action) OR **Reject Invoice** (Action)
6. **Complete** (End)

**Rules Referenced**:

- `invoice-approval-policy`

**Actions Referenced**:

- `ValidateInvoice`
- `PostAccountingEntry`
- `RejectInvoice`

**Concepts Referenced**:

- `Invoice`

## 🎭 Dynamic Everything

| Layer       | Dynamic? | Controlled By        |
| ----------- | -------- | -------------------- |
| ERP Modules | ✅       | Capability contracts |
| Events      | ✅       | Taxonomy             |
| Workflows   | ✅       | Orchestration UI     |
| Rules       | ✅       | Rule engine          |
| Approvals   | ✅       | Workflow + rules     |
| UI          | ✅       | Concepts + state     |
| DB Schema   | ⚠️ Semi  | Concept metadata     |
| Execution   | ✅       | Node workers         |

## 🔮 Future Capabilities

- [ ] Worker registry and dynamic routing
- [ ] Visual rule builder
- [ ] Approval chain designer (forward/reverse flows)
- [ ] Version control for workflows
- [ ] A/B testing workflows
- [ ] Workflow templates marketplace
- [ ] AI-assisted workflow generation
- [ ] Real-time collaboration
- [ ] Workflow analytics dashboard

## 🏛️ SAP/Oracle Replacement Strategy

This system is designed to:

1. **Replace hardcoded business logic** with metadata-driven workflows
2. **Centralize business rules** outside application code
3. **Enable business users** to design workflows without coding
4. **Support unlimited complexity** through taxonomy + rules + workflows
5. **Scale to enterprise** with clear separation of concerns
6. **Evolve safely** by versioning everything

**Mental Model**:

- **SAP modules** = Our dynamic ERP modules
- **SAP workflow engine** = Our workflow engine
- **SAP business rules** = Our rules engine
- **SAP master data** = Our taxonomy
- **SAP transactions** = Our events + actions

But everything is **metadata-driven, visual, and no-code**.

## 📝 Notes

- Edit button in `/custom` UI now works in orchestration mode
- CRUD events automatically flow to orchestration system
- Module metadata is included in all events
- Workflows can be triggered by events or manually
- Human tasks support timeouts and escalation
- All executions are tracked with full history

---

**Built with strict adherence to the Business OS architecture principles.**

**Taxonomy → Events → Orchestration → Workflows → Rules → Actions → Workers**
