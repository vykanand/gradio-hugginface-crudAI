const fs = require('node:fs').promises;
const path = require('node:path');
const { v4: uuidv4 } = require('uuid');
const { executeWorkflow } = require('./unifiedOrchestrator');

const WORKFLOWS_FILE = path.join(__dirname, '..', 'config', 'metadata', 'unified-workflows.json');

class UnifiedWorkflowEngine {
  static workflows = null;
  static initialized = false;

  async initialize() {
    if (UnifiedWorkflowEngine.initialized) return;
    await this.ensureFiles();
    try {
      const raw = await fs.readFile(WORKFLOWS_FILE, 'utf8');
      UnifiedWorkflowEngine.workflows = raw ? JSON.parse(raw) : this.getDefaultWorkflows();
      if (!UnifiedWorkflowEngine.workflows || !Array.isArray(UnifiedWorkflowEngine.workflows.definitions)) {
        UnifiedWorkflowEngine.workflows = this.getDefaultWorkflows();
      }
    } catch (e) {
      console.error('Failed to load workflows:', e);
      UnifiedWorkflowEngine.workflows = this.getDefaultWorkflows();
      await this.save();
    }
    UnifiedWorkflowEngine.initialized = true;
  }

  async ensureFiles() {
    const dir = path.dirname(WORKFLOWS_FILE);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(WORKFLOWS_FILE);
    } catch (e) {
      await fs.writeFile(WORKFLOWS_FILE, JSON.stringify(this.getDefaultWorkflows(), null, 2));
    }
  }

  getDefaultWorkflows() {
    return {
      version: '1.0.0',
      definitions: []
    };
  }

  async getWorkflows() {
    await this.initialize();
    return UnifiedWorkflowEngine.workflows.definitions || [];
  }

  async getWorkflow(id) {
    await this.initialize();
    return (UnifiedWorkflowEngine.workflows.definitions || []).find((w) => w.id === id) || null;
  }

  async addWorkflow(workflow) {
    await this.initialize();
    if (!UnifiedWorkflowEngine.workflows.definitions) UnifiedWorkflowEngine.workflows.definitions = [];
    const id = workflow.id || uuidv4();
    if (UnifiedWorkflowEngine.workflows.definitions.some((w) => w.id === id)) {
      throw new Error('Workflow ID already exists: ' + id);
    }
    const toSave = { ...workflow, id };
    UnifiedWorkflowEngine.workflows.definitions.push(toSave);
    await this.save();
    return toSave;
  }

  async updateWorkflow(id, updates) {
    await this.initialize();
    const idx = (UnifiedWorkflowEngine.workflows.definitions || []).findIndex((w) => w.id === id);
    if (idx === -1) throw new Error('Workflow not found: ' + id);
    UnifiedWorkflowEngine.workflows.definitions[idx] = { ...UnifiedWorkflowEngine.workflows.definitions[idx], ...updates, id };
    await this.save();
    return UnifiedWorkflowEngine.workflows.definitions[idx];
  }

  async deleteWorkflow(id) {
    await this.initialize();
    const idx = (UnifiedWorkflowEngine.workflows.definitions || []).findIndex((w) => w.id === id);
    if (idx === -1) return false;
    UnifiedWorkflowEngine.workflows.definitions.splice(idx, 1);
    await this.save();
    return true;
  }

  async save() {
    await fs.writeFile(WORKFLOWS_FILE, JSON.stringify(UnifiedWorkflowEngine.workflows, null, 2));
  }

  async execute(workflowId, options = {}) {
    const def = await this.getWorkflow(workflowId);
    if (!def) throw new Error('Workflow not found: ' + workflowId);
    return executeWorkflow(def, options || {});
  }
}

module.exports = new UnifiedWorkflowEngine();
