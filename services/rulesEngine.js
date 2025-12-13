/**
 * Rules Engine - The Decision Layer
 * 
 * Rules decide WHAT to do, not WHEN or HOW.
 * They are declarative if-then logic that:
 * - Make decisions
 * - Evaluate conditions
 * - Return outcomes
 * 
 * Rules NEVER:
 * - Control sequence or flow
 * - Call services directly
 * - Define meanings (that's taxonomy)
 * 
 * Rules are used BY workflows and orchestration to make decisions.
 */

const fs = require('fs').promises;
const path = require('path');

const RULES_FILE = path.join(__dirname, '..', 'config', 'metadata', 'rules.json');

class RulesEngine {
  constructor() {
    this.rules = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      await this.ensureFile();
      const raw = await fs.readFile(RULES_FILE, 'utf8');
      this.rules = JSON.parse(raw);
      this.initialized = true;
      console.log('[rules] initialized with', (this.rules.ruleSets || []).length, 'rule sets');
    } catch (e) {
      console.warn('[rules] init error, using defaults', e.message);
      this.rules = this.getDefaultRules();
      this.initialized = true;
      await this.save();
    }
  }

  async ensureFile() {
    const dir = path.dirname(RULES_FILE);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(RULES_FILE);
    } catch (e) {
      await fs.writeFile(RULES_FILE, JSON.stringify(this.getDefaultRules(), null, 2));
    }
  }

  getDefaultRules() {
    return {
      version: '1.0.0',
      ruleSets: [
        {
          id: 'invoice-approval-policy',
          name: 'Invoice Approval Policy',
          description: 'Determines who must approve invoices based on amount and vendor risk',
          concept: 'Invoice',
          rules: [
            {
              id: 'high-amount-cfo-approval',
              condition: {
                type: 'comparison',
                field: 'amount',
                operator: '>',
                value: 100000
              },
              outcome: {
                approvalLevel: 'CFO',
                requiresApproval: true
              }
            },
            {
              id: 'high-risk-vendor-compliance',
              condition: {
                type: 'comparison',
                field: 'vendor.risk',
                operator: '==',
                value: 'High'
              },
              outcome: {
                approvalLevel: 'Compliance',
                requiresApproval: true
              }
            },
            {
              id: 'low-amount-auto-approve',
              condition: {
                type: 'comparison',
                field: 'amount',
                operator: '<',
                value: 1000
              },
              outcome: {
                approvalLevel: 'Auto',
                requiresApproval: false
              }
            }
          ]
        },
        {
          id: 'inventory-reconciliation-policy',
          name: 'Inventory Reconciliation Policy',
          description: 'Determines when inventory reconciliation is needed',
          concept: 'InventoryItem',
          rules: [
            {
              id: 'variance-under-threshold-auto',
              condition: {
                type: 'and',
                conditions: [
                  {
                    type: 'comparison',
                    field: 'variance',
                    operator: '<',
                    value: 0.01
                  },
                  {
                    type: 'comparison',
                    field: 'varianceAmount',
                    operator: '<',
                    value: 100
                  }
                ]
              },
              outcome: {
                action: 'AutoReconcile',
                requiresApproval: false
              }
            },
            {
              id: 'high-variance-manual',
              condition: {
                type: 'comparison',
                field: 'variance',
                operator: '>=',
                value: 0.01
              },
              outcome: {
                action: 'ManualReconciliation',
                requiresApproval: true
              }
            }
          ]
        },
        {
          id: 'purchase-order-routing',
          name: 'Purchase Order Routing',
          description: 'Routes purchase orders to appropriate approver',
          concept: 'PurchaseOrder',
          rules: [
            {
              id: 'po-over-50k-director',
              condition: {
                type: 'comparison',
                field: 'amount',
                operator: '>',
                value: 50000
              },
              outcome: {
                approver: 'Director',
                priority: 'High'
              }
            },
            {
              id: 'po-under-5k-manager',
              condition: {
                type: 'comparison',
                field: 'amount',
                operator: '<=',
                value: 5000
              },
              outcome: {
                approver: 'Manager',
                priority: 'Normal'
              }
            }
          ]
        }
      ]
    };
  }

  async getRuleSets() {
    await this.initialize();
    return this.rules.ruleSets || [];
  }

  async getRuleSet(ruleSetId) {
    await this.initialize();
    const ruleSets = this.rules.ruleSets || [];
    return ruleSets.find(rs => rs.id === ruleSetId) || null;
  }

  async addRuleSet(ruleSet) {
    await this.initialize();
    if (!this.rules.ruleSets) this.rules.ruleSets = [];
    // Ensure unique ID
    if (this.rules.ruleSets.find(rs => rs.id === ruleSet.id)) {
      throw new Error('RuleSet ID already exists: ' + ruleSet.id);
    }
    this.rules.ruleSets.push(ruleSet);
    await this.save();
    return ruleSet;
  }

  async updateRuleSet(ruleSetId, updates) {
    await this.initialize();
    const idx = (this.rules.ruleSets || []).findIndex(rs => rs.id === ruleSetId);
    if (idx === -1) throw new Error('RuleSet not found: ' + ruleSetId);
    this.rules.ruleSets[idx] = { ...this.rules.ruleSets[idx], ...updates, id: ruleSetId };
    await this.save();
    return this.rules.ruleSets[idx];
  }

  async deleteRuleSet(ruleSetId) {
    await this.initialize();
    const idx = (this.rules.ruleSets || []).findIndex(rs => rs.id === ruleSetId);
    if (idx === -1) return false;
    this.rules.ruleSets.splice(idx, 1);
    await this.save();
    return true;
  }

  async save() {
    try {
      await fs.writeFile(RULES_FILE, JSON.stringify(this.rules, null, 2));
      console.log('[rules] saved');
    } catch (e) {
      console.error('[rules] save error', e);
      throw e;
    }
  }

  /**
   * Evaluate a rule set against input data
   * Returns array of matching outcomes
   */
  async evaluate(ruleSetId, data) {
    const ruleSet = await this.getRuleSet(ruleSetId);
    if (!ruleSet) throw new Error('RuleSet not found: ' + ruleSetId);
    
    const results = [];
    for (const rule of (ruleSet.rules || [])) {
      if (this.evaluateCondition(rule.condition, data)) {
        results.push({ ruleId: rule.id, outcome: rule.outcome });
      }
    }
    return results;
  }

  /**
   * Evaluate a single condition
   */
  evaluateCondition(condition, data) {
    if (!condition) return false;

    switch (condition.type) {
      case 'comparison':
        return this.evaluateComparison(condition, data);
      case 'and':
        return (condition.conditions || []).every(c => this.evaluateCondition(c, data));
      case 'or':
        return (condition.conditions || []).some(c => this.evaluateCondition(c, data));
      case 'not':
        return !this.evaluateCondition(condition.condition, data);
      default:
        console.warn('[rules] unknown condition type:', condition.type);
        return false;
    }
  }

  evaluateComparison(condition, data) {
    const fieldValue = this.getFieldValue(data, condition.field);
    const compareValue = condition.value;

    switch (condition.operator) {
      case '==':
      case '===':
        return fieldValue === compareValue;
      case '!=':
      case '!==':
        return fieldValue !== compareValue;
      case '>':
        return fieldValue > compareValue;
      case '>=':
        return fieldValue >= compareValue;
      case '<':
        return fieldValue < compareValue;
      case '<=':
        return fieldValue <= compareValue;
      case 'contains':
        return String(fieldValue).includes(String(compareValue));
      case 'startsWith':
        return String(fieldValue).startsWith(String(compareValue));
      case 'endsWith':
        return String(fieldValue).endsWith(String(compareValue));
      default:
        console.warn('[rules] unknown operator:', condition.operator);
        return false;
    }
  }

  /**
   * Get nested field value using dot notation (e.g., "vendor.risk")
   */
  getFieldValue(data, field) {
    if (!field) return undefined;
    const parts = field.split('.');
    let value = data;
    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = value[part];
    }
    return value;
  }

  /**
   * Get all rule sets for a concept
   */
  async getRuleSetsForConcept(conceptId) {
    await this.initialize();
    return (this.rules.ruleSets || []).filter(rs => rs.concept === conceptId);
  }
}

module.exports = new RulesEngine();
