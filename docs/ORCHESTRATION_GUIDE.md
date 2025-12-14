# Orchestration Guide — Step-by-step (Layman)

This guide walks a non-technical user through designing and building an orchestration (example: insurance claims triage) using this project.

## Overview

Goal: Automatically triage incoming insurance claims into three outcomes: Auto-Approve, Assign Adjuster, Escalate for Fraud.

Success metrics: decision time < 1 min, 30% auto-approved, <2% fraud misses.

Prerequisites:

- Access to the Orchestration Builder UI (`orchestration-builder.html`).

---

## 1 — Define the business problem (one sentence)

Write a concise statement:

    > "Automatically triage incoming insurance claims to Auto‑Approve, Assign Adjuster, or Escalate for Fraud to reduce manual triage time."

Also list:

- Required inputs: claim JSON (amount, fraudScore, policyId, claimant info)
- Outputs: assigned action (AutoApprove, AssignAdjuster, Escalate)
- Stakeholders: Claims team, Fraud team, Payments

---

## 2 — Identify events and data

- Event that starts: `ClaimCreated` (payload contains `claim` object)
- Key data fields used in decisions: `claim.amount`, `claim.fraudScore`, `policy.coverage`

---

## 3 — Model business language (Taxonomy)

1. Open the **Taxonomy** tab in the builder.
2. Add a Concept named `Claim` with properties: `id, amount, fraudScore, policyId, status`.
3. Add an Event `ClaimCreated` referencing concept `Claim`.
4. Add Actions you will call: `AssignAdjuster`, `AutoApprove`, `Escalate`.

Alternatively POST JSON to the API (example):

```bash
curl -X POST http://localhost:3000/api/taxonomy/concepts \
  -H "Content-Type: application/json" \
  -d '{"id":"Claim","name":"Claim","description":"Insurance claim","properties":["id","amount","fraudScore","policyId","status"]}'
```

---

## 4 — Create decision logic (Rules)

1. Open **Rules** tab → New Rule Set → name it `claims-triage` and pick concept `Claim`.
2. Add rules (simple examples):
   - `auto-approve-small`: if `claim.amount <= 500` → outcome `{ action: "AutoApprove", routeTo: "Payments" }`
   - `high-fraud-escalate`: if `claim.fraudScore >= 80` → outcome `{ action: "Escalate", routeTo: "FraudTeam" }`
   - `large-assign-adjuster`: if `claim.amount > 5000` → outcome `{ action: "AssignAdjuster", routeTo: "AdjusterPool" }`

You can also POST the rule set JSON to `/api/rules`.

---

## 5 — Build the workflow in the Canvas

1. Open **Workflows** → `New Workflow`.
2. Drag an `Action` node named `Receive Claim` that ingests the `ClaimCreated` event.
3. Drag a `Decision` node named `Triage` and set its `ruleSet` to `claims-triage` (node data `ruleSet: "claims-triage"`).
4. Add three `Action` nodes: `AutoApprove`, `AssignAdjuster`, `Escalate`. For each, set `data.action` to the corresponding action id.
5. Connect nodes: `Receive Claim` → `Triage` → each target action node.
6. Save the workflow (Save button).

Notes:

- Use the DB Explorer modal to map DB fields (table.column) into node inputs when needed.
- Selected columns appear in the right-hand pane; you can remove them with the ✕ pill.

---

## 6 — Prepare test input and run

Sample inputs to validate behavior:

- Small claim:

```json
{ "claim": { "amount": 200, "fraudScore": 10 } }
```

Expect `AutoApprove`.

- Fraud:

```json
{ "claim": { "amount": 1200, "fraudScore": 85 } }
```

Expect `Escalate`.

- Large claim:

```json
{ "claim": { "amount": 12000, "fraudScore": 30 } }
```

Expect `AssignAdjuster`.

Trigger an execution via the API (example):

```bash
curl -X POST http://localhost:3000/api/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{"workflowId":"workflow_claims_v1","context":{"claim":{"amount":200,"fraudScore":10}}}'
```

(If your server exposes a different execution API, adapt the endpoint accordingly.)

---

## 7 — Inspect outcomes and iterate

- Check execution logs (UI or backend logs) and the rule evaluation results.
- Refine thresholds (e.g., fraudScore) or add compound conditions (AND/OR).
- Add alerting for unexpected outcomes.

---

## 8 — Deploy and Monitor

- Save and publish the workflow.
- Connect your event source to post `ClaimCreated` events to the orchestration endpoint.
- Monitor runs, error rates, and tune rules periodically.

---

## Tips & FAQs (Layman)

- Start simple: one decision rule set, a few rules.
- Use human-readable taxonomy names so stakeholders can understand decisions.
- If a DB column must be qualified (e.g., `crimping_process.SAP_ID`), notify the admin to add that table to the qualified list for consistent keys.
- If a decision seems wrong, test the same claim JSON against the Rules endpoint to inspect which rule fired.

---

## Example files in this repo

- Rules stored in: `config/metadata/rules.json`
- Taxonomy stored in: `config/metadata/taxonomy.json`
- Workflows stored via API and visible in the builder.

---

If you want, I can also:

- Produce ready-to-POST JSON files for the `Claim` concept, `claims-triage` rule set, and a sample workflow, or
- Walk you through the UI steps interactively.
