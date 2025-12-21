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

class TaxonomyService {
  constructor() {
    this.taxonomy = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      await this.ensureFile();
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
    return this.taxonomy.actions || {};
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
    await this.save();
    return action;
  }

  async updateAction(actionId, updates) {
    await this.initialize();
    if (!this.taxonomy.actions || !this.taxonomy.actions[actionId]) {
      throw new Error('Action not found: ' + actionId);
    }
    this.taxonomy.actions[actionId] = { ...this.taxonomy.actions[actionId], ...updates };
    this.taxonomy.actions[actionId].id = actionId;
    await this.save();
    return this.taxonomy.actions[actionId];
  }

  async deleteAction(actionId) {
    await this.initialize();
    if (!this.taxonomy.actions) return false;
    delete this.taxonomy.actions[actionId];
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
