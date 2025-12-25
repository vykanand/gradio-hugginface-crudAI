/**
 * Taxonomy Service - The Business Language Layer
 * 
 * Taxonomy defines MEANING, not logic or flow.
 * It provides a controlled vocabulary for:
 * - Business Concepts (Invoice, Order, Product)
 * - Business Events (InvoiceReceived, OrderApproved)
 * - Business Actions (ReconcileInvoice, ApproveOrder)
 * - Business Capabilities (VendorManagement, Accounting)
 * 
 * This is the foundation that gives meaning to everything else.
 * Rules reference taxonomy. Workflows use taxonomy. Events use taxonomy.
 */

const fs = require('fs').promises;
const path = require('path');

const TAXONOMY_FILE = path.join(__dirname, '..', 'config', 'metadata', 'taxonomy.json');
const ACTIONS_DIR = path.join(__dirname, '..', 'config', 'metadata', 'actions');
const ACTIONS_FILE = path.join(__dirname, '..', 'config', 'metadata', 'actions.json');

class TaxonomyService {
  constructor() {
    this.taxonomy = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      await this.ensureFile();
      await this.ensureActionsDir();
      await this.ensureActionsFile();
      const raw = await fs.readFile(TAXONOMY_FILE, 'utf8');
      this.taxonomy = JSON.parse(raw);
      this.initialized = true;
      console.log('[taxonomy] initialized with', Object.keys(this.taxonomy.concepts || {}).length, 'concepts');
    } catch (e) {
      console.warn('[taxonomy] init error, using defaults', e.message);
      this.taxonomy = this.getDefaultTaxonomy();
      this.initialized = true;
      await this.save();
    }
  }

  async ensureFile() {
    const dir = path.dirname(TAXONOMY_FILE);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(TAXONOMY_FILE);
    } catch (e) {
      await fs.writeFile(TAXONOMY_FILE, JSON.stringify(this.getDefaultTaxonomy(), null, 2));
    }
  }

  async ensureActionsDir(){
    try{
      await fs.mkdir(ACTIONS_DIR, { recursive: true });
    }catch(e){ /* ignore */ }
  }

  async ensureActionsFile(){
    const dir = path.dirname(ACTIONS_FILE);
    await fs.mkdir(dir, { recursive: true });
    try{
      await fs.access(ACTIONS_FILE);
    }catch(e){
      await fs.writeFile(ACTIONS_FILE, JSON.stringify({}, null, 2));
    }
  }

  async readTableActions(table){
    const file = path.join(ACTIONS_DIR, `${table}.json`);
    try{
      const raw = await fs.readFile(file, 'utf8');
      return JSON.parse(raw) || {};
    }catch(e){ return {}; }
  }

  async writeTableActions(table, actionsObj){
    const file = path.join(ACTIONS_DIR, `${table}.json`);
    try{
      await fs.writeFile(file, JSON.stringify(actionsObj || {}, null, 2));
      return true;
    }catch(e){ console.warn('[taxonomy] writeTableActions failed', e); return false; }
  }

  async readActionsFile(){
    try{
      const raw = await fs.readFile(ACTIONS_FILE, 'utf8');
      return JSON.parse(raw || '{}');
    }catch(e){ return {}; }
  }

  async writeActionsFile(actionsObj){
    try{
      await fs.writeFile(ACTIONS_FILE, JSON.stringify(actionsObj || {}, null, 2));
      return true;
    }catch(e){ console.warn('[taxonomy] writeActionsFile failed', e); return false; }
  }

  getDefaultTaxonomy() {
    // Return an empty taxonomy scaffold (no hard-coded sample items).
    return {
      version: '1.0.0',
      concepts: {},
      events: {},
      actions: {},
      capabilities: {}
    };
  }

  async getTaxonomy() {
    await this.initialize();
    return this.taxonomy;
  }

  async getConcepts() {
    await this.initialize();
    return this.taxonomy.concepts || {};
  }

  async getConcept(conceptId) {
    await this.initialize();
    return this.taxonomy.concepts && this.taxonomy.concepts[conceptId] || null;
  }

  async getEvents() {
    await this.initialize();
    return this.taxonomy.events || {};
  }

  async getEvent(eventId) {
    await this.initialize();
    return this.taxonomy.events && this.taxonomy.events[eventId] || null;
  }

  async getActions() {
    await this.initialize();
    // Prefer a single actions file as the authoritative source of actions to avoid
    // per-table fallbacks. If actions.json is non-empty, return it. Otherwise
    // fall back to taxonomy.actions for legacy compatibility.
    try{
      const fileActions = await this.readActionsFile();
      if (fileActions && Object.keys(fileActions).length > 0) return fileActions;
    }catch(e){ /* ignore read errors */ }
    return Object.assign({}, this.taxonomy.actions || {});
  }

  async getAction(actionId) {
    await this.initialize();
    return this.taxonomy.actions && this.taxonomy.actions[actionId] || null;
  }

  async getCapabilities() {
    await this.initialize();
    return this.taxonomy.capabilities || {};
  }

  async addConcept(concept) {
    await this.initialize();
    if (!this.taxonomy.concepts) this.taxonomy.concepts = {};
    this.taxonomy.concepts[concept.id] = concept;
    await this.save();
    return concept;
  }

  async updateConcept(conceptId, updates) {
    await this.initialize();
    if (!this.taxonomy.concepts || !this.taxonomy.concepts[conceptId]) {
      throw new Error('Concept not found: ' + conceptId);
    }
    this.taxonomy.concepts[conceptId] = { ...this.taxonomy.concepts[conceptId], ...updates };
    await this.save();
    return this.taxonomy.concepts[conceptId];
  }

  async deleteConcept(conceptId) {
    await this.initialize();
    if (!this.taxonomy.concepts) return false;
    delete this.taxonomy.concepts[conceptId];
    await this.save();
    return true;
  }

  async addEvent(event) {
    await this.initialize();
    if (!this.taxonomy.events) this.taxonomy.events = {};
    this.taxonomy.events[event.id] = event;
    await this.save();
    return event;
  }

  async updateEvent(eventId, updates) {
    await this.initialize();
    if (!this.taxonomy.events || !this.taxonomy.events[eventId]) {
      throw new Error('Event not found: ' + eventId);
    }
    this.taxonomy.events[eventId] = { ...this.taxonomy.events[eventId], ...updates };
    // ensure id remains consistent
    this.taxonomy.events[eventId].id = eventId;
    await this.save();
    return this.taxonomy.events[eventId];
  }

  async deleteEvent(eventId) {
    await this.initialize();
    if (!this.taxonomy.events) return false;
    delete this.taxonomy.events[eventId];
    await this.save();
    return true;
  }

  async addAction(action) {
    await this.initialize();
    if (!this.taxonomy.actions) this.taxonomy.actions = {};
    this.taxonomy.actions[action.id] = action;
    // persist to single actions.json file
    try{
      const existing = await this.readActionsFile();
      existing[action.id] = action;
      await this.writeActionsFile(existing);
    }catch(e){ console.warn('[taxonomy] addAction writeActionsFile failed', e); }
    await this.save();
    return action;
  }

  async updateAction(actionId, updates) {
    await this.initialize();
    if (!this.taxonomy.actions || !this.taxonomy.actions[actionId]) {
      throw new Error('Action not found: ' + actionId);
    }
    const prev = this.taxonomy.actions[actionId] || {};
    const updated = { ...prev, ...updates, id: actionId };
    this.taxonomy.actions[actionId] = updated;
    // persist update to single actions.json
    try{
      const existing = await this.readActionsFile();
      existing[actionId] = updated;
      await this.writeActionsFile(existing);
    }catch(e){ console.warn('[taxonomy] updateAction writeActionsFile failed', e); }
    await this.save();
    return this.taxonomy.actions[actionId];
  }

  async deleteAction(actionId) {
    await this.initialize();
    if (!this.taxonomy.actions) return false;
    const prev = this.taxonomy.actions[actionId] || {};
    delete this.taxonomy.actions[actionId];
    try{
      const existing = await this.readActionsFile();
      if(existing && existing[actionId]){ delete existing[actionId]; await this.writeActionsFile(existing); }
    }catch(e){ console.warn('[taxonomy] deleteAction writeActionsFile failed', e); }
    await this.save();
    return true;
  }

  async addCapability(capability) {
    await this.initialize();
    if (!this.taxonomy.capabilities) this.taxonomy.capabilities = {};
    this.taxonomy.capabilities[capability.id] = capability;
    await this.save();
    return capability;
  }

  async save() {
    try {
      await fs.writeFile(TAXONOMY_FILE, JSON.stringify(this.taxonomy, null, 2));
      console.log('[taxonomy] saved');
    } catch (e) {
      console.error('[taxonomy] save error', e);
      throw e;
    }
  }

  // Resolve a concept by name or ID (fuzzy match)
  async resolveConcept(nameOrId) {
    await this.initialize();
    const concepts = this.taxonomy.concepts || {};
    if (concepts[nameOrId]) return concepts[nameOrId];
    const lower = nameOrId.toLowerCase();
    for (const [id, concept] of Object.entries(concepts)) {
      if (id.toLowerCase() === lower || (concept.name && concept.name.toLowerCase() === lower)) {
        return concept;
      }
    }
    return null;
  }

  // Validate event payload against taxonomy
  async validateEvent(eventId, payload) {
    const event = await this.getEvent(eventId);
    if (!event) return { valid: false, error: 'Event not in taxonomy: ' + eventId };
    // Check required properties
    const missingProps = (event.properties || []).filter(p => !(p in payload));
    if (missingProps.length > 0) {
      return { valid: false, error: 'Missing properties: ' + missingProps.join(', ') };
    }
    return { valid: true };
  }
}

module.exports = new TaxonomyService();
