// show all product with stock more than 50 and join on order_items with product_id foreign key
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs").promises;
const mysql = require("mysql2/promise");
const { spawn } = require("child_process");

// const redis = require("redis");

const processHtmlLLM = require("./generalAI.js");
const queue = require('./services/queue');
const taxonomyService = require('./services/taxonomyService');
const rulesEngine = require('./services/rulesEngine');
const workflowEngine = require('./services/workflowEngine');
const executionOrchestrator = require('./services/executionOrchestrator');
const eventBus = require('./services/eventBus');
const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('./services/transactionManager');

const app = express();
const PORT = process.env.PORT || 5050;

// Try loading ai-config from repository `config/ai-config.js`.
let aiConfigFromFile = {};
try {
  aiConfigFromFile = require(path.join(__dirname, 'config', 'ai-config.js')) || {};
} catch (e) {
  aiConfigFromFile = {};
}

// Runtime config (exposed to clients)
const RUNTIME_CONFIG = {
  port: PORT,
  ai: {
    // 'proxy' means client should call local `/api/ai` which the server will forward.
    // 'direct' means client will call `ai.directUrl` directly from the browser.
    mode: aiConfigFromFile.AI_MODE || process.env.AI_MODE || 'proxy',
    // When in direct mode, clients will post here (useful for local dev gradio servers)
    directUrl: aiConfigFromFile.AI_ENDPOINT || process.env.AI_ENDPOINT || process.env.AI_DIRECT_URL || 'http://localhost:3000/large',
    // Helpful metadata about production huggingface model
    huggingfaceModel: process.env.HF_DEFAULT_MODEL || 'google/flan-t5-large'
  }
};

// Serve a small client JS snippet so frontends can access runtime config synchronously
app.get('/client-config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.__RUNTIME_CONFIG__ = ${JSON.stringify(RUNTIME_CONFIG)};`);
});

// Also provide a JSON endpoint for runtime config
app.get('/runtime-config', (req, res) => {
  res.json(RUNTIME_CONFIG);
});

// Database pool variable
let pool;

// Middleware setup
app.use(express.json());
app.use(cors());

// Simple request logger to aid debugging (prints method + path)
app.use((req, res, next) => {
  try {
    console.log(`[req] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  } catch (e) {}
  next();
});

// initialize event bus (Kafka producer + consumer)
try { eventBus.init().catch(e => console.warn('eventBus.init failed', e)); } catch(e) { /* ignore */ }

// Provide a lightweight bindings read endpoint early so embedded clients
// can discover bindings even if later route definitions are reordered.
app.get('/orchestration/bindings', async (req, res) => {
  try {
    const localBindingsPath = path.join(__dirname, 'config', 'orchestration_bindings.json');
    try { await fs.mkdir(path.join(__dirname, 'config'), { recursive: true }); } catch (e) {}
    try {
      const raw = await fs.readFile(localBindingsPath, 'utf8');
      return res.json({ ok: true, bindings: JSON.parse(raw || '{}') });
    } catch (e) {
      // If file not present, return empty bindings map
      return res.json({ ok: true, bindings: {} });
    }
  } catch (e) {
    console.error('early bindings read error', e && e.stack ? e.stack : e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Discover modules available for CRUD binding: metadata files + schema tables
app.get('/orchestration/modules', async (req, res) => {
  try {
    const metaDir = path.join(__dirname, 'metadata');
    const files = await fs.readdir(metaDir).catch(() => []);
    const modules = {};
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(metaDir, f), 'utf8');
        const j = JSON.parse(raw || '{}');
        const m = j.module || j.id || j.name || null;
        if (m) modules[m] = modules[m] || { id: m, name: j.name || m, description: j.description || '', source: 'metadata' };
      } catch (e) {}
    }
    // Also include DB tables from schema_store/tables
    try {
      const tablesDir = path.join(__dirname, 'config', 'schema_store', 'tables');
      const tfiles = await fs.readdir(tablesDir).catch(() => []);
      for (const tf of tfiles) {
        if (!tf.endsWith('.json')) continue;
        const raw = await fs.readFile(path.join(tablesDir, tf), 'utf8');
        const j = JSON.parse(raw || '{}');
        const name = j.tableName || tf.replace(/\.json$/, '');
        modules[name] = modules[name] || { id: name, name: j.title || name, description: j.description || '', source: 'schema' };
      }
    } catch (e) {}

    // Enrich modules with existing bindings (if any)
    await ensureBindingsFile();
    const rawBindings = await fs.readFile(BINDINGS_FILE, 'utf8');
    const binds = JSON.parse(rawBindings || '{}');
    const result = Object.keys(modules).map(k => ({ ...modules[k], bindings: binds[k] || {} }));
    return res.json({ ok: true, modules: result });
  } catch (e) {
    console.error('orchestration/modules error', e && e.stack ? e.stack : e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});


// Add graceful shutdown handler
process.on('SIGTERM', async () => {
    if (pool) {
        await pool.end();
    }
    process.exit(0);
});
// Add database connection test endpoint
app.get('/api/testConnection', async (req, res) => {
  try {
    // Test query to verify connection
    await pool.query('SELECT 1');
    // include active config so clients can show database details
    let cfg = null;
    try { cfg = await getActiveConfig(); } catch (e) { cfg = null; }
    res.json({ status: 'connected', config: cfg });
  } catch (error) {
    let cfg = null;
    try { cfg = await getActiveConfig(); } catch (e) { cfg = null; }
    res.status(500).json({ 
      error: 'Database connection failed',
      details: error.message,
      config: cfg
    });
  }
});

// Load all configurations
async function loadConfigurations() {
    const configPath = path.join(__dirname, 'config', 'database.json');
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
}

// Save configurations
async function saveConfigurations(configs) {
    const configPath = path.join(__dirname, 'config', 'database.json');
    await fs.writeFile(configPath, JSON.stringify(configs, null, 2));
}

// Get active configuration
async function getActiveConfig() {
    const configs = await loadConfigurations();
    return configs.configurations[configs.activeConfig];
}

// Routes for multiple configurations
app.get('/api/configs', async (req, res) => {
    try {
        const configs = await loadConfigurations();
        res.json(configs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load configurations' });
    }
});

app.post('/api/configs', async (req, res) => {
    try {
        const { name, config } = req.body;
        const configs = await loadConfigurations();
        configs.configurations[name] = config;
        await saveConfigurations(configs);
        res.json({ message: 'Configuration saved successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

app.post("/api/configs/activate", async (req, res) => {
  try {
    const { name } = req.body;
    const configs = await loadConfigurations();
    configs.activeConfig = name;
    await saveConfigurations(configs);

    // Send response before restart
    res.json({ message: "Active configuration changed, server restarting..." });

    // Wait for response to be sent, then restart
    setTimeout(() => {
      process.on("exit", () => {
        spawn(process.argv[0], process.argv.slice(1), {
          env: { ...process.env, RELOAD: "true" },
          stdio: "inherit",
        });
      });
      process.exit();
    }, 1000);
  } catch (error) {
    res.status(500).json({ error: "Failed to change active configuration" });
  }
});


app.delete('/api/configs/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const configs = await loadConfigurations();
        
        if (name === configs.activeConfig) {
            return res.status(400).json({ error: 'Cannot delete active configuration' });
        }
        
        delete configs.configurations[name];
        await saveConfigurations(configs);
        res.json({ message: 'Configuration deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete configuration' });
    }
});

// Update database initialization
async function initializeDatabase() {
    const config = await getActiveConfig();
    pool = mysql.createPool(config);
    console.log("MySQL pool created with active configuration");
}

// Function to get table structure
async function getTableStructure(entity) {
  const connection = await pool.getConnection();
  try {
    const [columns] = await connection.query(`DESCRIBE ${entity}`);
    return columns.map((column) => ({
      name: column.Field,
      type: column.Type,
      nullable: column.Null === "YES",
      key: column.Key,
    }));
  } catch (error) {
    console.error("Error fetching table structure from DB:", error.message);
    return null;
  } finally {
    connection.release();
  }
}

// Function to fetch all tables in the database
async function getAllTables() {
  const connection = await pool.getConnection();
  try {
    const [tables] = await connection.query("SHOW TABLES");
    return tables.map(
      (table) => table[`Tables_in_${connection.config.database}`]
    );
  } catch (error) {
    console.error("Error fetching tables:", error.message);
    return null;
  } finally {
    connection.release();
  }
}

// Route to fetch database schema
app.get("/database", async (req, res) => {
  try {
    const tables = await getAllTables();
    if (!tables) {
      return res.status(500).json({ error: "Failed to fetch tables." });
    }

    res.json({ tables });
  } catch (error) {
    console.error("Error fetching database schema:", error && error.stack ? error.stack : error);
    // fallback: return schema_store index if available so UI can still show persisted schemas
    try {
      const indexPath = path.join(__dirname, 'config', 'schema_store', 'index.json');
      const raw = await fs.readFile(indexPath, 'utf8');
      const index = JSON.parse(raw);
      return res.json({ fallback: true, source: 'schema_store', index });
    } catch (e2) {
      console.warn('schema_store fallback not available:', e2 && e2.message ? e2.message : e2);
      res.status(500).json({ error: 'Failed to fetch database schema.', details: error && error.message ? error.message : String(error) });
    }
  }
});

// New: API used by the frontend DB Explorer
// Returns { tables: { tableName: { columns: [ { name, type, nullable, key }, ... ] } } }
app.get('/api/db/schema', async (req, res) => {
  try {
    const tableNames = await getAllTables();
    if (!tableNames) return res.status(500).json({ ok: false, error: 'Failed to list tables' });
    const tables = {};
    for (const t of tableNames) {
      try {
        const cols = await getTableStructure(t);
        tables[t] = { columns: (cols || []).map(c => ({ name: c.name || c.Field || c.Field, type: c.type || c.Type || c.Type, nullable: c.nullable || c.Null === 'YES', key: c.key || c.Key })) };
      } catch (e) {
        tables[t] = { columns: [] };
      }
    }
    return res.json({ ok: true, tables });
  } catch (error) {
    console.error('/api/db/schema error', error && error.stack ? error.stack : error);
    // Fallback: try to return persisted schema_store index if available
    try {
      const indexPath = path.join(__dirname, 'config', 'schema_store', 'index.json');
      const raw = await fs.readFile(indexPath, 'utf8');
      const index = JSON.parse(raw);
      return res.json({ ok: true, fallback: true, source: 'schema_store', index });
    } catch (e2) {
      console.warn('schema_store fallback not available:', e2 && e2.message ? e2.message : e2);
      return res.status(500).json({ ok: false, error: 'Failed to fetch DB schema', details: error && error.message ? error.message : String(error) });
    }
  }
});

// Get detailed schema for a specific table
app.get("/api/schema/:tableName", async (req, res) => {
  try {
    const { tableName } = req.params;
    const connection = await pool.getConnection();
    
    try {
      // Get column information
      const [columns] = await connection.query(`DESCRIBE ${tableName}`);
      
      // Get row count
      const [countResult] = await connection.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const rowCount = countResult[0].count;
      
      // Get foreign keys
      const [foreignKeys] = await connection.query(`
        SELECT 
          COLUMN_NAME,
          CONSTRAINT_NAME,
          REFERENCED_TABLE_NAME,
          REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND REFERENCED_TABLE_NAME IS NOT NULL
      `, [tableName]);
      
      // Get indexes
      const [indexes] = await connection.query(`SHOW INDEXES FROM ${tableName}`);
      
      // Get table statistics
      const [stats] = await connection.query(`
        SELECT 
          TABLE_NAME,
          ENGINE,
          TABLE_ROWS,
          AVG_ROW_LENGTH,
          DATA_LENGTH,
          INDEX_LENGTH,
          CREATE_TIME,
          UPDATE_TIME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
      `, [tableName]);
      
      res.json({
        tableName,
        columns,
        rowCount,
        foreignKeys,
        indexes,
        stats: stats[0] || {}
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error fetching table schema:", error && error.stack ? error.stack : error);
    // fallback: try to read persisted table schema from config/schema_store/tables
    try {
      const filePath = path.join(__dirname, 'config', 'schema_store', 'tables', `${req.params.tableName}.json`);
      const data = await fs.readFile(filePath, 'utf8');
      return res.json({ fallback: true, source: 'schema_store', table: JSON.parse(data) });
    } catch (e2) {
      console.warn('Failed to load persisted table schema fallback:', e2 && e2.message ? e2.message : e2);
      res.status(500).json({ error: 'Failed to fetch table schema.', details: error && error.message ? error.message : String(error) });
    }
  }
});

// Module mapping endpoints are deprecated. We now discover events from the UI and Kafka.
app.get('/api/module-mapping', async (req, res) => {
  return res.status(410).json({ ok: false, error: 'module-mapping deprecated; use /api/event-registry or event stream' });
});

// POST save mappings
app.post('/api/module-mapping', async (req, res) => {
  return res.status(410).json({ success: false, message: 'module-mapping deprecated; persistence removed' });
});

// Receive orchestrator events from front-end and publish to Kafka
app.post('/api/orchestrator/event', async (req, res) => {
  try {
    const body = req.body || {};
    // Accept either { event, module, detail } or arbitrary payload
    // Pass request headers so server can enrich envelope (actor role/group) when available
    const result = await eventBus.publishEvent(body, { headers: req.headers, ip: req.ip });
    if (result && result.ok) {
      // Persisted and enqueued
      return res.status(202).json({ ok: true, id: result.id, status: 'accepted' });
    } else {
      return res.status(500).json({ ok: false, error: result && result.error ? result.error : 'publish_failed' });
    }
  } catch (e) {
    console.error('/api/orchestrator/event error', e && e.stack ? e.stack : e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// SSE endpoint for streaming discovered events to UI
app.get('/events/stream', async (req, res) => {
  // Allow cross-origin EventSource connections (restrict in prod via env)
  const allowOrigin = process.env.EVENTS_ALLOW_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  // send a comment to keep connection
  res.write(': connected\n\n');
  eventBus.addSSEClient(res);
  req.on('close', () => { try { eventBus.removeSSEClient(res); } catch(e){} });
});

// Admin endpoints: pending events and DLQ
app.get('/api/events/pending', async (req, res) => {
  try {
    const list = await eventBus.listPendingEvents();
    res.json({ ok: true, pending: list });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/events/dlq', async (req, res) => {
  try {
    const list = await eventBus.listDLQEvents();
    res.json({ ok: true, dlq: list });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/events/requeue/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const ok = await eventBus.requeueDLQ(id);
    if (ok) return res.json({ ok: true });
    return res.status(404).json({ ok: false, error: 'not_found' });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Simple registry API that returns discovered events grouped by module
app.get('/api/event-registry', async (req, res) => {
  try {
    const reg = eventBus.getRegistry();
    res.json({ ok: true, registry: reg });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// List persisted event records (optional query: module, event)
app.get('/api/event-records', async (req, res) => {
  try {
    const q = { module: req.query.module || null, event: req.query.event || null };
    const list = await eventBus.listAllEventRecords(q);
    res.json({ ok: true, records: list });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Delete a single persisted event record by id
app.delete('/api/event-records/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const ok = await eventBus.deleteEventRecord(id);
    if (ok) return res.json({ ok: true });
    return res.status(404).json({ ok: false, error: 'not_found' });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Purge persisted events by filter (body: { module?, event? })
app.post('/api/events/purge', async (req, res) => {
  try {
    const { module, event } = req.body || {};
    const removed = await eventBus.deleteEventsByFilter({ module, event });
    return res.json({ ok: true, removed });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Clear module registry counts (in-memory + persisted module key)
app.post('/api/event-registry/clear-module', async (req, res) => {
  try {
    const { module } = req.body || {};
    if (!module) return res.status(400).json({ ok: false, error: 'module_required' });
    const ok = await eventBus.clearModuleRegistry(module);
    return res.json({ ok: !!ok });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Get database-wide metadata
app.get("/api/metadata", async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    try {
      // Get database info
      const [dbInfo] = await connection.query(`
        SELECT 
          SCHEMA_NAME as database_name,
          DEFAULT_CHARACTER_SET_NAME as charset,
          DEFAULT_COLLATION_NAME as collation
        FROM INFORMATION_SCHEMA.SCHEMATA
        WHERE SCHEMA_NAME = DATABASE()
      `);
      
      // Get all tables with statistics
      const [tables] = await connection.query(`
        SELECT 
          TABLE_NAME,
          ENGINE,
          TABLE_ROWS,
          AVG_ROW_LENGTH,
          DATA_LENGTH,
          INDEX_LENGTH,
          CREATE_TIME,
          UPDATE_TIME,
          TABLE_COLLATION
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME
      `);
      
      // Get all foreign key relationships
      const [relationships] = await connection.query(`
        SELECT 
          TABLE_NAME as from_table,
          COLUMN_NAME as from_column,
          REFERENCED_TABLE_NAME as to_table,
          REFERENCED_COLUMN_NAME as to_column,
          CONSTRAINT_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY TABLE_NAME, COLUMN_NAME
      `);
      
      // Get column statistics across all tables
      const [columnStats] = await connection.query(`
        SELECT 
          DATA_TYPE,
          COUNT(*) as count
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        GROUP BY DATA_TYPE
        ORDER BY count DESC
      `);
      
      res.json({
        database: dbInfo[0],
        tables,
        relationships,
        columnStats,
        totalTables: tables.length,
        totalRows: tables.reduce((sum, t) => sum + (t.TABLE_ROWS || 0), 0)
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error fetching database metadata:", error.message);
    res.status(500).json({ error: "Failed to fetch database metadata.", details: error.message });
  }
});

// Get table relationships and lineage
app.get("/api/lineage/:tableName", async (req, res) => {
  try {
    const { tableName } = req.params;
    const connection = await pool.getConnection();
    
    try {
      // Get tables this table references (outgoing relationships)
      const [outgoing] = await connection.query(`
        SELECT 
          COLUMN_NAME,
          REFERENCED_TABLE_NAME as related_table,
          REFERENCED_COLUMN_NAME as related_column,
          CONSTRAINT_NAME,
          'references' as relationship_type
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND REFERENCED_TABLE_NAME IS NOT NULL
      `, [tableName]);
      
      // Get tables that reference this table (incoming relationships)
      const [incoming] = await connection.query(`
        SELECT 
          TABLE_NAME as related_table,
          COLUMN_NAME as related_column,
          REFERENCED_COLUMN_NAME as column_name,
          CONSTRAINT_NAME,
          'referenced_by' as relationship_type
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND REFERENCED_TABLE_NAME = ?
      `, [tableName]);
      
      res.json({
        tableName,
        outgoing,
        incoming,
        totalRelationships: outgoing.length + incoming.length
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error fetching table lineage:", error.message);
    res.status(500).json({ error: "Failed to fetch table lineage.", details: error.message });
  }
});

// Add XML parsing function for SQL commands
//   function extractSQLFromXML(aiResponse) {
//   // Case-insensitive regex that handles different tag formats and whitespace
//     // const sqlRegex = /<\s*sqlcommand|SQL\s*>([\s\S]*?)<\/\s*(sqlcommand|SQL)\s*>/i;
//     const sqlRegex = /<\s*sqlcommand|SQL\s*>([\s\S]*?)<\/\s*(sqlcommand|SQL)\s*>/i;

//   const match = aiResponse.match(sqlRegex);
  
//   if (match && match[1]) {
//     return match[1].trim();
//   }
//   throw new Error(`No valid SQL block found in AI response. Received: ${aiResponse}`);
// }

// Modified cleanAndSanitizeSQL to handle XML
// const cleanAndSanitizeSQL = (text) => {
//   try {
//     // First extract SQL from XML
//     const sqlCommand = extractSQLFromXML(text);

//     // Then proceed with original sanitization
//     const entityNameRegex =
//       /(?<!\w)(?:`?)([a-zA-Z_][a-zA-Z0-9_]*)(?:`?)(?!\w)/g;
//     const sqlKeywordRegex = /\b(DATE\(\)|NOW\(\))\b/gi;
//     const dateFunctionRegex = /\b(DATE\(\)|CURRENT_TIMESTAMP)\b/gi;
//     const sqlQueryRegex =
//       /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|REPLACE|MERGE|BEGIN|COMMIT|ROLLBACK|SET|SHOW|USE|DESCRIBE|GRANT|REVOKE|LOCK|UNLOCK|TABLE|PROCEDURE|FUNCTION|INDEX|VIEW)\b[^\;]*\;/i;

//     const match = sqlCommand.match(sqlQueryRegex);

//     if (match) {
//       const query = match[0]
//         .replace(entityNameRegex, (entityName) => entityName)
//         .replace(sqlKeywordRegex, (match) => match.toUpperCase())
//         .replace(/(?<=\s)DATE\(/g, "CURDATE(")
//         .replace(/(?<=\s)CURRENT_TIMESTAMP\b/g, "CURRENT_TIMESTAMP")
//         .trim();

//       return query;
//     }
//     return null;
//   } catch (error) {
//     console.error("Error parsing SQL from XML:", error.message);
//     return null;
//   }
// };


function extractSQL(text) {
  // Simple regex to find SQL statements starting with common keywords
  const sqlRegex =
    /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)\s+[^;]*;/gi;

  // Find all matches in the text
  const matches = text.match(sqlRegex);

  if (matches && matches.length > 0) {
    // Return the first valid SQL statement found
    return matches[0].trim();
  }

  // If no matches found, try to extract anything that looks like SQL
  const fallbackRegex =
    /(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)[\s\S]*?;/i;
  const fallbackMatch = text.match(fallbackRegex);

  return fallbackMatch ? fallbackMatch[0].trim() : null;
}

// Replace the existing cleanAndSanitizeSQL with this simpler version
function cleanAndSanitizeSQL(text) {
  const sql = extractSQL(text);
  return sql ? sql.replace(/\s+/g, " ").trim() : null;
}

function getQueryType(query) {
  const modificationKeywords =
    /(ALTER|CREATE|DROP|TRUNCATE|UPDATE|INSERT|DELETE)/i;
  return modificationKeywords.test(query);
}

// Route to handle dynamic SQL generation and execution
app.post("/:entity", async (req, res) => {
  const entity = req.params.entity;
  const prompt = req.body.prompt;

  try {
    const tableStructure = await getTableStructure(entity);
    if (!tableStructure) {
      return res
        .status(500)
        .json({ error: "Failed to fetch table structure." });
    }

    // Updated prompt to specify XML format
  const promptForLLM = `
IMPORTANT: Generate ONLY a single SQL statement. No messages, no explanations.

Context:
- Table: ${entity}
- Structure: ${JSON.stringify(tableStructure)}
- Request: ${prompt}

Requirements:
1. Return exactly ONE SQL statement
2. Must be executable SQL
3. Must end with semicolon
4. No comments or messages
5. No error text or explanations

Example good response:
CREATE TABLE orders (id INT PRIMARY KEY AUTO_INCREMENT, product_id INT, order_date DATETIME);

Example bad response:
-- This creates a table
SELECT 'Cannot create' as Error;
`;


    const airesponse = await processHtmlLLM(promptForLLM);
    console.log("AI Response:", airesponse);

    const sanitizedQuery = cleanAndSanitizeSQL(airesponse);
    if (!sanitizedQuery) {
      throw new Error("Failed to extract valid SQL from AI response");
    }

    console.log("Sanitized Query:", sanitizedQuery);
    const [rows] = await pool.execute(sanitizedQuery);
    console.log("Query executed row:-",rows);

    res.json({
      data:
        rows.length === 0
          ? {
              message: getQueryType(sanitizedQuery)
                ? "Table modification completed successfully"
                : "No records found",
            }
          : rows,
      query: sanitizedQuery,
      type: getQueryType(sanitizedQuery) ? "modification" : "query",
    });

  } catch (error) {
    console.error("Initial error:", error.message);

    try {
      console.log("Attempting retry...");

      // Enhanced retry prompt with XML format requirement
      const retryPrompt = `
        Previous query failed. Please fix the SQL command wrapped in <sqlcommand> tags.
        Error: ${error.message}
        Original request:
        Table: ${entity}
        Structure: ${JSON.stringify(await getTableStructure(entity))}
        Request: ${prompt}
        
        Return ONLY the corrected SQL in <sqlcommand> tags with:
        - Proper XML formatting
        - Valid SQL syntax
        - No additional text
      `;

      const retryResponse = await processHtmlLLM(retryPrompt);
      console.log("Retry AI Response:", retryResponse);

      const retryQuery = cleanAndSanitizeSQL(retryResponse);
      if (!retryQuery) {
        throw new Error("Failed to extract valid SQL from retry response");
      }

      console.log("Retry Sanitized Query:", retryQuery);
      const [retryRows] = await pool.execute(retryQuery);

      res.json({
        data:
          retryRows.length === 0 ? { message: "No records found." } : retryRows,
        query: retryQuery,
      });
    } catch (retryError) {
      console.error("Retry failed:", retryError.message);
      res.status(500).json({
        error: "Failed after retry",
        details: retryError.message,
        originalError: error.message,
      });
    }
  }
});

// Root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/config", (req, res) => {
  res.sendFile(path.join(__dirname, "config.html"));
});

app.get("/explorer", (req, res) => {
  res.sendFile(path.join(__dirname, "db-explorer.html"));
});

// Alias route to support older links or explicit module path
app.get('/db-explorer', (req, res) => {
  res.sendFile(path.join(__dirname, 'db-explorer.html'));
});

// Orchestration Builder UI
app.get('/builder', (req, res) => {
  res.sendFile(path.join(__dirname, 'builder.html'));
});

// Also serve legacy/explicit orchestration-builder filename
app.get('/orchestration-builder.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'orchestration-builder.html'));
});

// Event Registry UI
app.get('/event-registry.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'event-registry.html'));
});

// Orchestration Monitor UI
app.get('/orchestration-monitor.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'orchestration-monitor.html'));
});

// Orchestration Manager UI (full end-to-end)
app.get('/orchestration-manager.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'orchestration-manager.html'));
});

// Lightweight live monitor UI (non-destructive)
app.get('/monitor.html', (req, res) => {
  // legacy route remapped from nats-monitor to generic monitor
  res.sendFile(path.join(__dirname, 'monitor.html'));
});

// In-memory ring buffer for recent messages seen by the monitor
const MONITOR_BUFFER_LIMIT = 500;
const monitorBuffer = [];
const sseClients = new Set();
let monitorNc = null;
// Kafka monitor setup
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const DISABLE_KAFKA = (process.env.DISABLE_KAFKA === 'true');
let kafka = null;
let kafkaProducer = null;
const MONITOR_TOPICS = ['ORCHESTRATIONS_JOBS', 'ORCHESTRATIONS_EVENTS'];
if (!DISABLE_KAFKA) {
  try {
    const { Kafka } = require('kafkajs');
    kafka = new Kafka({ brokers: KAFKA_BROKERS });
  } catch (e) {
    console.warn('kafkajs not available or failed to init, running in fallback mode', e && e.message ? e.message : e);
    kafka = null;
  }
} else {
  console.log('DISABLE_KAFKA=true -> running without Kafka (demo/fallback mode)');
}

// Fallback dispatcher for environments without Kafka: directly trigger workflows
async function fallbackDispatchEvent(subject, payload) {
  const auditLog = require('./services/auditLog');
  try {
    // payload expected to be object
    const evt = (typeof payload === 'string') ? JSON.parse(payload) : payload || {};
    // Central dispatch: trigger any orchestration bindings for module+action
    try {
      await ensureBindingsFile();
      const raw = await fs.readFile(BINDINGS_FILE, 'utf8');
      const bindingsMap = JSON.parse(raw || '{}');
      const mod = evt.module;
      const act = (evt.action || '').toString();
      if (mod && bindingsMap[mod]) {
        const modBindings = bindingsMap[mod] || {};
        // Check CRUD-style bindings first (create/read/update/delete)
        const candidate = modBindings[act] || modBindings[act.toLowerCase()] || modBindings[act.toUpperCase()];
        if (candidate) {
          try {
            // candidate may be orchestrationId or object { orchestrationId, operation }
            const orchId = (typeof candidate === 'string') ? candidate : (candidate.orchestrationId || null);
            if (orchId) {
              // start orchestration by id (async)
              workflowEngine.startExecution(orchId, { event: evt }, 'binding_dispatch').catch(e => console.warn('binding startExecution failed', orchId, e && e.message ? e.message : e));
              try { auditLog.write({ action: 'binding_dispatch', orchestration: orchId, subject, traceId: evt && evt.traceId }); } catch (e) {}
            }
          } catch (e) { console.warn('failed to dispatch binding for', mod, act, e && e.message ? e.message : e); }
        }
      }

      // Also dispatch to any workflows whose triggerEvent matches the event
      const workflows = await workflowEngine.getWorkflows();
      for (const wf of workflows || []) {
        const trigger = (wf.triggerEvent || '').toString();
        if (!trigger) continue;
        const matches = [evt.eventType, evt.action, `${evt.eventType}:${evt.action}`, evt.module].map(v => v && v.toString());
        if (matches.includes(trigger)) {
          try {
            await workflowEngine.startExecution(wf.id, { event: evt }, 'fallback_dispatch');
            try { await auditLog.write({ action: 'fallback_dispatch', workflow: wf.id, subject, traceId: evt && evt.traceId }); } catch (e) {}
          } catch (e) {
            console.warn('[fallback] failed to start workflow', wf.id, e && e.message ? e.message : e);
          }
        }
      }
    } catch (e) {
      console.warn('[fallbackDispatchEvent] dispatch error', e && e.message ? e.message : e);
    }
  } catch (e) {
    console.warn('[fallback] dispatch error', e && e.message ? e.message : e);
  }
}

async function ensureKafkaProducer() {
  if (!kafka) throw new Error('Kafka disabled or not initialized');
  if (kafkaProducer) return kafkaProducer;
  kafkaProducer = kafka.producer();
  await kafkaProducer.connect();
  return kafkaProducer;
}

async function startKafkaMonitor() {
  try {
    const consumer = kafka.consumer({ groupId: 'monitor_group' });
    await consumer.connect();
    for (const t of MONITOR_TOPICS) await consumer.subscribe({ topic: t, fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const raw = message.value ? message.value.toString() : '';
          let parsed = raw;
          try { parsed = JSON.parse(raw); } catch (e) { /* keep raw */ }
          // attempt to use parsed.subject if present (we embed subject in events)
          const subj = (parsed && parsed.subject) ? parsed.subject : topic;
          const item = { subject: subj, data: parsed, raw, ts: new Date().toISOString() };
          monitorBuffer.push(item);
          if (monitorBuffer.length > MONITOR_BUFFER_LIMIT) monitorBuffer.shift();
          const payload = JSON.stringify(item);
          for (const res of sseClients) {
            try { res.write('data: ' + payload + '\n\n'); } catch (e) { /* ignore */ }
          }
          // Also attempt to dispatch events to orchestrations/bindings
          try {
            // Do not await - fire-and-forget dispatch to avoid blocking consumer
            fallbackDispatchEvent(subj, parsed).catch(e => console.warn('kafka dispatch failed', e && e.message ? e.message : e));
          } catch (e) { console.warn('kafka dispatch trigger failed', e && e.message ? e.message : e); }
        } catch (e) {
          console.warn('[monitor:kafka] error processing message', e && e.message ? e.message : e);
        }
      }
    });
    console.log('[monitor:kafka] started, subscribed to', MONITOR_TOPICS);
  } catch (e) {
    console.warn('[monitor:kafka] start failed', e && e.message ? e.message : e);
  }
}

// SSE endpoint for live monitor stream
app.get('/monitor/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  // send existing buffer initially
  try {
    monitorBuffer.forEach(item => res.write('data: ' + JSON.stringify(item) + '\n\n'));
  } catch (e) {}
  sseClients.add(res);
  req.on('close', () => { sseClients.delete(res); });
});

// Recent messages endpoint
app.get('/monitor/recent', (req, res) => {
  res.json({ ok: true, recent: monitorBuffer.slice(-MONITOR_BUFFER_LIMIT) });
});

// List monitor subscriptions (subjects the server listens to)
app.get('/monitor/subscriptions', (req, res) => {
  try {
    return res.json({ ok: true, topics: MONITOR_TOPICS });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Publish an arbitrary message to a subject (best-effort). Body: { subject, payload }
app.post('/monitor/publish', async (req, res) => {
  try {
    const { subject, payload } = req.body || {};
    if (!subject) return res.status(400).json({ ok: false, error: 'subject required' });
    // expect `subject` to be a topic name in Kafka
    try {
      await ensureKafkaProducer();
      const data = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
      await kafkaProducer.send({ topic: subject, messages: [{ key: null, value: data }] });
      return res.json({ ok: true, subject, payload, via: 'kafka' });
    } catch (e) {
      // Kafka not available: fallback to direct dispatch so demos work out-of-box
      console.warn('/monitor/publish kafka unavailable, dispatching locally', e && e.message ? e.message : e);
      try { await fallbackDispatchEvent(subject, payload); } catch (er) { console.warn('fallback dispatch failed', er && er.message ? er.message : er); }
      return res.json({ ok: true, subject, payload, via: 'fallback' });
    }
  } catch (e) {
    console.error('/monitor/publish error', e && e.stack ? e.stack : e);
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// -------------------------
// Orchestration Manager API
// -------------------------

// Health endpoint: aggregate workflow engine + kafka connectivity
app.get('/api/health', async (req, res) => {
  try {
    const wf = await workflowEngine.getHealthStatus();
    // quick kafka admin check
    let kafkaOk = false;
    try {
      const admin = kafka.admin();
      await admin.connect();
      await admin.disconnect();
      kafkaOk = true;
    } catch (e) {
      kafkaOk = false;
    }
    return res.json({ ok: true, workflow: wf, kafka: { reachable: kafkaOk } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// protect admin endpoints
app.use('/api/executions', requireAdmin);
app.use('/api/kafka', requireAdmin);

// Kafka metrics (best-effort)
app.get('/api/kafka/metrics', async (req, res) => {
  try {
    await ensureKafkaProducer();
    let metrics = null;
    try { metrics = kafkaProducer.metrics ? kafkaProducer.metrics() : null; } catch (e) { metrics = null; }
    return res.json({ ok: true, metrics });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// List executions (both orchestrator and workflow engine)
app.get('/api/executions', async (req, res) => {
  try {
    const source = req.query.source || 'both';
    const results = { orchestrator: [], workflow: [] };
    if (source === 'orchestrator' || source === 'both') {
      try { results.orchestrator = await executionOrchestrator.listExecutions(); } catch (e) { results.orchestrator = []; }
    }
    if (source === 'workflow' || source === 'both') {
      try { results.workflow = await workflowEngine.getExecutions({}); } catch (e) { results.workflow = []; }
    }
    return res.json({ ok: true, results });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// Get single execution by id (search both stores)
app.get('/api/executions/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let exec = await workflowEngine.getExecution(id).catch(()=>null);
    if (!exec) exec = await executionOrchestrator.getExecution(id).catch(()=>null);
    if (!exec) return res.status(404).json({ ok: false, error: 'Execution not found' });
    return res.json({ ok: true, execution: exec });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// Retry an execution (workflow executions are restarted; orchestrator executions re-run using stored metadata/inputs)
app.post('/api/executions/:id/retry', async (req, res) => {
  try {
    const id = req.params.id;
    const wfExec = await workflowEngine.getExecution(id).catch(()=>null);
    if (wfExec) {
      // start a new execution with same workflowId and inputs
      const newExec = await workflowEngine.startExecution(wfExec.workflowId, wfExec.inputs, 'retry', uuidv4());
      await auditLog.write({ action: 'retry', type: 'workflow', id, triggeredBy: req.ip || req.headers['x-forwarded-for'] || 'api' });
      return res.json({ ok: true, message: 'workflow retry started', execution: newExec });
    }
    const orchExec = await executionOrchestrator.getExecution(id).catch(()=>null);
    if (orchExec) {
      // attempt to re-run with same metadata (best-effort)
      // try to load metadata by id (if metadata stored in config/metadata)
      let metadata = null;
      try {
        const metaPath = path.join(__dirname, 'config', 'metadata', orchExec.metadataId + '.json');
        const raw = await fs.readFile(metaPath, 'utf8');
        metadata = JSON.parse(raw);
      } catch (e) { metadata = null; }
      if (!metadata) return res.status(400).json({ ok: false, error: 'Original metadata not found for orchestrator execution' });
      const replay = await executionOrchestrator.execute(metadata, orchExec.inputs, { idempotencyKey: uuidv4() });
      await auditLog.write({ action: 'retry', type: 'orchestrator', id, triggeredBy: req.ip || req.headers['x-forwarded-for'] || 'api' });
      return res.json({ ok: true, message: 'orchestrator retry started', result: replay });
    }
    return res.status(404).json({ ok: false, error: 'Execution not found' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// Compensate an execution (manual compensation trigger)
app.post('/api/executions/:id/compensate', async (req, res) => {
  try {
    const id = req.params.id;
    const wfExec = await workflowEngine.getExecution(id).catch(()=>null);
    if (wfExec) {
      await workflowEngine.compensateExecution(wfExec, new Error('manual_compensate'));
      await auditLog.write({ action: 'compensate', type: 'workflow', id, triggeredBy: req.ip || req.headers['x-forwarded-for'] || 'api' });
      return res.json({ ok: true, message: 'compensation started' });
    }
    // orchestrator-level compensation not implemented generically
    return res.status(400).json({ ok: false, error: 'Compensation supported only for workflow executions' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// Replay stored execution events to the events topic (best-effort)
app.post('/api/executions/:id/replay', async (req, res) => {
  try {
    const id = req.params.id;
    const orchExec = await executionOrchestrator.getExecution(id).catch(()=>null);
    const wfExec = !orchExec ? await workflowEngine.getExecution(id).catch(()=>null) : null;
    const record = orchExec || wfExec;
    if (!record) return res.status(404).json({ ok: false, error: 'Execution not found' });
    // create synthetic events from record
    const execId = record.executionId || record.id;
    await queue.publishEvent(execId, { type: 'execution.replay.started', timestamp: new Date().toISOString(), sourceId: id });
    if (record.steps && Array.isArray(record.steps)) {
      for (const s of record.steps) {
        await queue.publishEvent(execId, { type: s.status === 'success' ? 'step.succeeded' : 'step.failed', stepId: s.stepId || s.stepId, timestamp: new Date().toISOString(), output: s.output || s });
      }
    }
    await queue.publishEvent(execId, { type: record.success ? 'execution.succeeded' : 'execution.failed', timestamp: new Date().toISOString() });
    await auditLog.write({ action: 'replay', id, triggeredBy: req.ip || req.headers['x-forwarded-for'] || 'api' });
    return res.json({ ok: true, message: 'replayed events' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// Recover stuck executions (trigger recovery worker immediately)
app.post('/api/executions/recover-stuck', async (req, res) => {
  try {
    await workflowEngine.recoverFailedExecutions();
    await auditLog.write({ action: 'recover-stuck', triggeredBy: req.ip || req.headers['x-forwarded-for'] || 'api' });
    return res.json({ ok: true, message: 'recovery scan triggered' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// DLQ purge (dangerous) - requires query param confirm=true
app.post('/api/kafka/dlq/purge', async (req, res) => {
  try {
    const confirm = req.query.confirm === 'true' || (req.body && req.body.confirm === true);
    if (!confirm) return res.status(400).json({ ok: false, error: 'confirm=true required to purge DLQ' });
    const admin = kafka.admin();
    await admin.connect();
    // delete topic then recreate it empty
    // safer behavior: archive messages first by triggering DLQ consumer to archive folder
    await auditLog.write({ action: 'dlq.purge.request', triggeredBy: req.ip || req.headers['x-forwarded-for'] || 'api' });
    // delete and recreate topic
    await admin.deleteTopics({ topics: ['ORCHESTRATIONS_DLQ'] });
    await admin.createTopics({ topics: [{ topic: 'ORCHESTRATIONS_DLQ' }] });
    await admin.disconnect();
    await auditLog.write({ action: 'dlq.purge.completed', triggeredBy: req.ip || req.headers['x-forwarded-for'] || 'api' });
    return res.json({ ok: true, message: 'DLQ purged (topic recreated)' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// Non-destructive retrieval of stored messages from a JetStream stream (best-effort).
// Example: /monitor/streamMessages?stream=ORCHESTRATIONS_JOBS&last=50
app.get('/monitor/streamMessages', async (req, res) => {
  const stream = req.query.stream;
  const lastN = parseInt(req.query.last || '50', 10) || 50;
  if (!stream) return res.status(400).json({ ok: false, error: 'stream query param required' });
  try {
    // Use a temporary Kafka consumer to read recent messages from the topic
    const kafkaConsumer = kafka.consumer({ groupId: 'monitor-reader-' + Date.now() + '-' + Math.floor(Math.random()*10000) });
    await kafkaConsumer.connect();
    await kafkaConsumer.subscribe({ topic: stream, fromBeginning: true });
    const results = [];
    let finished = false;
    // collect messages for up to 3000ms
    const timeoutMs = 3000;
    const startTime = Date.now();
    await kafkaConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const raw = message.value ? message.value.toString() : '';
          let parsed = raw;
          try { parsed = JSON.parse(raw); } catch (e) { /* keep raw */ }
          results.push({ topic, partition, offset: message.offset, data: parsed });
          // trim while collecting to keep memory bounded
          if (results.length > lastN * 5) results.splice(0, results.length - lastN * 5);
        } catch (e) {
          // ignore parse errors
        }
        if (Date.now() - startTime > timeoutMs) {
          finished = true;
          try { await kafkaConsumer.disconnect(); } catch (e) {}
        }
      }
    });
    // Wait small time for collector to gather messages (timeout will disconnect)
    await new Promise(r => setTimeout(r, Math.min(3000, Math.max(300, lastN * 20))));
    try { await kafkaConsumer.disconnect(); } catch (e) {}
    const tail = results.slice(-lastN).map((m, idx) => ({ idx, topic: m.topic, partition: m.partition, offset: m.offset, data: m.data }));
    return res.json({ ok: true, stream, messages: tail });
  } catch (e) {
    console.warn('[monitor] streamMessages error', e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

// Start the server
// app.listen(PORT, () => {
//   console.log(`Server is running on http://localhost:${PORT}`);
// });

// Call this when starting the server. If DB init fails, start server in degraded mode
async function startServer() {
  try {
    await initializeDatabase();
    console.log('Database initialized successfully');
    // initialize global transaction manager for DB transactions
    try {
      global.transactionManager = new TransactionManager(pool);
      console.log('[tx] TransactionManager initialized');
    } catch (e) {
      console.warn('[tx] TransactionManager init failed', e && e.message ? e.message : e);
    }
    // start workflow recovery worker
    try { workflowEngine.startRecoveryWorker(60000); } catch (e) { console.warn('[workflow] recovery worker failed to start', e && e.message ? e.message : e); }
  } catch (e) {
    console.error('Database initialization failed, starting server in degraded mode:', e && e.message ? e.message : e);
  }

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

startServer();
// Start the Kafka monitor so the monitor UI can receive live events
if (kafka) {
  startKafkaMonitor().then(() => console.log('[monitor] started')).catch(e => console.warn('[monitor] start failed', e && e.message ? e.message : e));
} else {
  console.log('[monitor] Kafka disabled: skipping Kafka monitor startup');
}

// simple admin API key middleware
const adminApiKey = process.env.ADMIN_API_KEY || 'changeme';
function requireAdmin(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.apiKey || req.body && req.body.apiKey;
  if (!key || key !== adminApiKey) return res.status(403).json({ ok: false, error: 'admin API key required' });
  next();
}

// attach audit logging where admin operations occur
const auditLog = require('./services/auditLog');
const dlqWorker = require('./workers/dlqRecoveryWorker');

// start optional DLQ recovery consumer in background if ENABLE_DLQ_RECOVERY=true
if (process.env.ENABLE_DLQ_RECOVERY === 'true') {
  dlqWorker.startConsumer().then(() => console.log('[dlq] recovery consumer started')).catch(e => console.warn('[dlq] start failed', e && e.message ? e.message : e));
}

// --- Schema store helpers and endpoints (persisted, AI-agnostic) ---
const SCHEMA_STORE_DIR = path.join(__dirname, 'config', 'schema_store');

async function ensureSchemaStore() {
  try {
    await fs.mkdir(SCHEMA_STORE_DIR, { recursive: true });
    await fs.mkdir(path.join(SCHEMA_STORE_DIR, 'tables'), { recursive: true });
  } catch (e) {
    console.error('Failed to ensure schema store directories:', e.message);
    throw e;
  }
}

async function saveSchemaStore(payload) {
  // payload: { database, tables: [...], tableSchemas: { tableName: schema } }
  await ensureSchemaStore();
  const index = {
    database: payload.database || (pool?.options?.database || null),
    savedAt: new Date().toISOString(),
    tableCount: (payload.tables || []).length,
    tables: payload.tables || []
  };

  // Write index file
  await fs.writeFile(path.join(SCHEMA_STORE_DIR, 'index.json'), JSON.stringify(index, null, 2));

  // Write a database-level file
  await fs.writeFile(path.join(SCHEMA_STORE_DIR, 'db.json'), JSON.stringify({ metadata: payload.metadata || null, index }, null, 2));

  // Write per-table files
  const tablesDir = path.join(SCHEMA_STORE_DIR, 'tables');
  for (const table of payload.tables || []) {
    const data = payload.tableSchemas && payload.tableSchemas[table] ? payload.tableSchemas[table] : {};
    const filePath = path.join(tablesDir, `${table}.json`);
    try {
      await fs.writeFile(filePath, JSON.stringify({ tableName: table, schema: data }, null, 2));
    } catch (e) {
      console.error(`Failed to write table file for ${table}:`, e.message);
    }
  }

  return index;
}

// Save posted schema to disk
app.post('/schema-store/save', async (req, res) => {
  try {
    const payload = req.body || {};
    const index = await saveSchemaStore(payload);
    res.json({ ok: true, index });
  } catch (error) {
    console.error('Failed to save schema store:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Read schema store index
app.get('/schema-store', async (req, res) => {
  try {
    await ensureSchemaStore();
    const indexPath = path.join(SCHEMA_STORE_DIR, 'index.json');
    try {
      const data = await fs.readFile(indexPath, 'utf8');
      const index = JSON.parse(data);
      return res.json({ ok: true, index });
    } catch (e) {
      // If index not found, return minimal info
      const tables = await getAllTables();
      return res.json({ ok: true, index: { database: pool?.options?.database || null, tableCount: (tables || []).length, tables } });
    }
  } catch (error) {
    console.error('Failed to read schema store index:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Get per-table persisted schema
app.get('/schema-store/table/:tableName', async (req, res) => {
  try {
    const tableName = req.params.tableName;
    const filePath = path.join(SCHEMA_STORE_DIR, 'tables', `${tableName}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    return res.json({ ok: true, table: JSON.parse(data) });
  } catch (error) {
    console.error('Failed to read table schema file:', error.message);
    res.status(404).json({ ok: false, error: 'Table schema not found' });
  }
});

// Simplified AI helper endpoints using centralized single-source AI endpoint
const aiService = require('./aiService');

// Orchestrator service (metadata-driven workflows)
const orchestrator = require('./services/executionOrchestrator');
const dataModeller = require('./services/dataModeller');

// Save orchestration metadata to root metadata folder
app.post('/orchestrate/save', async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.id) return res.status(400).json({ ok: false, error: 'missing id in payload' });
    const filePath = path.join(__dirname, 'metadata', `${payload.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
    return res.json({ ok: true, saved: filePath });
  } catch (e) {
    console.error('Failed to save orchestration metadata:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Validate orchestration payload basic structure
app.post('/orchestrate/validate', async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.id || !payload.steps) return res.json({ ok: false, error: 'id and steps are required' });
    // Basic sanity checks
    if (!Array.isArray(payload.steps) || payload.steps.length === 0) return res.json({ ok: false, error: 'steps must be a non-empty array' });
    return res.json({ ok: true, message: 'validation passed' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Execute an orchestration metadata payload directly
app.post('/orchestrate/execute', async (req, res) => {
  try {
    const payload = req.body || {};
    let metadata = payload.metadata;
    const inputs = payload.inputs || {};
    if (!metadata || !metadata.steps) return res.status(400).json({ ok: false, error: 'missing metadata.steps' });
    const executionId = payload.executionId || uuidv4();
    // Determine execution mode: explicit query param or payload.sync or metadata.operation === 'sync'
    const querySync = (req.query && (req.query.sync === 'true' || req.query.sync === '1')) || false;
    const payloadSync = !!payload.sync;
    const metadataSync = metadata && metadata.operation && metadata.operation.toString().toLowerCase() === 'sync';
    const shouldRunSync = querySync || payloadSync || metadataSync;

    if (shouldRunSync) {
      try {
        const result = await orchestrator.execute(metadata, inputs, { executionId });
        return res.json(Object.assign({ ok: true }, result));
      } catch (e) {
        console.error('synchronous execute error', e && e.stack ? e.stack : e);
        return res.status(500).json({ ok: false, error: e.message || String(e) });
      }
    }

    // Async: persist a queued record and publish job
    const queuedRecord = {
      executionId,
      metadataId: metadata.id || null,
      name: metadata.name || null,
      start: new Date().toISOString(),
      status: 'queued',
      inputs,
      steps: [],
      errors: []
    };
    await orchestrator.saveExecutionRecord(queuedRecord);

    // publish job to JetStream
    await queue.publishJob({ executionId, metadata, inputs });

    return res.status(202).json({ ok: true, executionId, message: 'queued' });
  } catch (e) {
    console.error('Orchestrate enqueue error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Allow executing a saved orchestration by id (metadata file)
app.post('/orchestrate/executeById', async (req, res) => {
  try {
    const { id, inputs = {}, idempotencyKey } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'missing id' });
    const filePath = path.join(__dirname, 'metadata', `${id}.json`);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const metadata = JSON.parse(raw);
      const executionId = uuidv4();
      // Determine execution mode: query param ?sync=true, body.sync, or metadata.operation === 'sync'
      const querySync = (req.query && (req.query.sync === 'true' || req.query.sync === '1')) || false;
      const payloadSync = !!req.body.sync;
      const metadataSync = metadata && metadata.operation && metadata.operation.toString().toLowerCase() === 'sync';
      const shouldRunSync = querySync || payloadSync || metadataSync;

      if (shouldRunSync) {
        try {
          const result = await orchestrator.execute(metadata, inputs, { executionId, idempotencyKey });
          return res.json(Object.assign({ ok: true }, result));
        } catch (e) {
          console.error('synchronous executeById error', e && e.stack ? e.stack : e);
          return res.status(500).json({ ok: false, error: e.message || String(e) });
        }
      }

      // Async path: persist queued record and publish job
      const queuedRecord = {
        executionId,
        metadataId: metadata.id || null,
        name: metadata.name || null,
        start: new Date().toISOString(),
        status: 'queued',
        inputs,
        steps: [],
        errors: []
      };
      await orchestrator.saveExecutionRecord(queuedRecord);
      await queue.publishJob({ executionId, metadata, inputs });
      return res.status(202).json({ ok: true, executionId, message: 'queued' });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'failed to load metadata: ' + (e.message || e) });
    }
  } catch (e) {
    console.error('executeById error', e && e.stack ? e.stack : e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Orchestration bindings (map module+action -> orchestrationId)
const BINDINGS_FILE = path.join(__dirname, 'config', 'orchestration_bindings.json');
async function ensureBindingsFile() {
  try { await fs.mkdir(path.join(__dirname, 'config'), { recursive: true }); } catch (e) {}
  try { await fs.access(BINDINGS_FILE); } catch (e) { await fs.writeFile(BINDINGS_FILE, JSON.stringify({}, null, 2)); }
}

// List saved orchestration metadata (id, name, description)
app.get('/orchestrate/metadataList', async (req, res) => {
  try {
    const moduleQuery = (req.query.module || '').toString().trim();
    const metaDir = path.join(__dirname, 'metadata');
    const files = await fs.readdir(metaDir).catch(() => []);
    const list = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(metaDir, f), 'utf8');
        const j = JSON.parse(raw || '{}');
        const id = j.id || f.replace(/\.json$/, '');
        const name = j.name || id;
        const description = j.description || '';

        // Collect module-like markers from metadata (flexible: module, modules, tags)
        const modules = [];
        if (j.module) modules.push(j.module);
        if (Array.isArray(j.modules)) modules.push(...j.modules);
        if (Array.isArray(j.tags)) modules.push(...j.tags);

        // Determine match: if no module query provided, include all. If provided, include only those whose metadata mentions the module
        let include = true;
        if (moduleQuery) {
          include = false;
          if (modules.includes(moduleQuery)) include = true;
          if (!include && name && name.includes(moduleQuery)) include = true;
          if (!include && id && id.includes(moduleQuery)) include = true;
        }

        if (!include) continue;

        list.push({ id, name, description, module: j.module || null, modules: j.modules || null });
      } catch (e) {
        // ignore parse errors
      }
    }
    return res.json({ ok: true, list });
  } catch (e) {
    console.error('metadataList error', e && e.stack ? e.stack : e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Save module-level bindings (actions map + customButtons array)
app.post('/orchestration/moduleBindings', async (req, res) => {
  try {
    const payload = req.body || {};
    const { module, bindings, customButtons } = payload;
    if (!module) return res.status(400).json({ ok: false, error: 'module required' });
    await ensureBindingsFile();
    const raw = await fs.readFile(BINDINGS_FILE, 'utf8');
    const map = JSON.parse(raw || '{}');
    map[module] = map[module] || {};
    if (bindings && typeof bindings === 'object') {
      // copy allowed CRUD keys
      ['create', 'read', 'update', 'delete'].forEach(k => {
        if (bindings[k]) map[module][k] = bindings[k];
        else if (map[module][k] && !bindings[k]) {
          // if explicitly set to null/empty, delete
          if (bindings.hasOwnProperty(k) && !bindings[k]) delete map[module][k];
        }
      });
    }
    if (Array.isArray(customButtons)) {
      // store customButtons as array of { id, label, orchestrationId }
      map[module].customButtons = customButtons.map(cb => ({ id: cb.id || String(Date.now()), label: cb.label || 'btn', orchestrationId: cb.orchestrationId || null }));
    }
    await fs.writeFile(BINDINGS_FILE, JSON.stringify(map, null, 2));
    return res.json({ ok: true, bindings: map });
  } catch (e) {
    console.error('moduleBindings write error', e && e.stack ? e.stack : e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/orchestration/bindings', async (req, res) => {
  try {
    await ensureBindingsFile();
    const raw = await fs.readFile(BINDINGS_FILE, 'utf8');
    return res.json({ ok: true, bindings: JSON.parse(raw || '{}') });
  } catch (e) {
    console.error('bindings read error', e && e.stack ? e.stack : e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/orchestration/bindings', async (req, res) => {
  try {
    const payload = req.body || {};
    const { module, action, orchestrationId } = payload;
    // Allow optional operation flag; orchestrationId may be a string or payload.orchestrationId
    const operation = payload.operation || null;
    if (!module || !action || !orchestrationId) return res.status(400).json({ ok: false, error: 'module, action, orchestrationId required' });
    await ensureBindingsFile();
    const raw = await fs.readFile(BINDINGS_FILE, 'utf8');
    const map = JSON.parse(raw || '{}');
    map[module] = map[module] || {};
    // Store binding as object { orchestrationId, operation } for richer metadata
    map[module][action] = operation ? { orchestrationId, operation } : orchestrationId;
    await fs.writeFile(BINDINGS_FILE, JSON.stringify(map, null, 2));
    return res.json({ ok: true, bindings: map });
  } catch (e) {
    console.error('bindings write error', e && e.stack ? e.stack : e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// NOTE: Realtime status is published to Kafka topics and delivered via SSE

// Builder models endpoint
app.get('/builder/models', async (req, res) => {
  try {
    const models = await dataModeller.getModels();
    return res.json({ ok: true, models });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/orchestrate/status/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const rec = await orchestrator.getExecution(id);
    if (!rec) return res.status(404).json({ ok: false, error: 'not found' });
    return res.json({ ok: true, record: rec });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/orchestrate/list', async (req, res) => {
  try {
    const list = await orchestrator.listExecutions();
    return res.json({ ok: true, list });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Requeue an existing execution by executionId. Will attempt to load associated metadata file
// and publish a new job; returns a new executionId.
app.post('/orchestrate/requeue', async (req, res) => {
  try {
    const { executionId } = req.body || {};
    if (!executionId) return res.status(400).json({ ok: false, error: 'executionId required' });
    const rec = await orchestrator.getExecution(executionId);
    if (!rec) return res.status(404).json({ ok: false, error: 'execution record not found' });

    // Try to load metadata from saved metadataId
    let metadata = null;
    if (rec.metadataId) {
      try {
        const raw = await fs.readFile(path.join(__dirname, 'metadata', `${rec.metadataId}.json`), 'utf8');
        metadata = JSON.parse(raw || '{}');
      } catch (e) {
        console.warn('requeue: could not load metadata file', rec.metadataId, e && e.message ? e.message : e);
      }
    }

    if (!metadata) return res.status(400).json({ ok: false, error: 'metadata not available for execution; cannot requeue' });

    const inputs = rec.inputs || {};
    const newExecutionId = uuidv4();
    const queuedRecord = {
      executionId: newExecutionId,
      metadataId: metadata.id || null,
      name: metadata.name || null,
      start: new Date().toISOString(),
      status: 'queued',
      inputs,
      steps: [],
      errors: []
    };
    await orchestrator.saveExecutionRecord(queuedRecord);
    await queue.publishJob({ executionId: newExecutionId, metadata, inputs });
    return res.status(202).json({ ok: true, executionId: newExecutionId, message: 'requeued' });
  } catch (e) {
    console.error('requeue error', e && e.stack ? e.stack : e);
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// POST /ai/send - forward arbitrary payloads to the hardcoded AI endpoint
app.post('/ai/send', async (req, res) => {
  try {
    const payload = req.body || {};
    console.log('[server] /ai/send incoming payload:', JSON.stringify(payload).slice(0,2000));
    console.log('[server] forwarding to AI endpoint:', aiService.AI_ENDPOINT);
    // Use an extended timeout for AI requests (120s) to account for slower models
    const result = await aiService.requestAI(payload, 120000);
    console.log('[server] AI response status:', result.statusCode);
    try {
      console.log('[server] AI response body:', JSON.stringify(result.data).slice(0,2000));
    } catch (e) {
      console.log('[server] AI response body (non-serializable)');
    }

    // Build a detailed envelope. Include diagnostics when non-2xx so the UI can display messages.
    const ok = !!(result.statusCode >= 200 && result.statusCode < 300);
    const envelope = {
      ok,
      statusCode: result.statusCode,
      data: result.data || null
    };

    if (!ok) {
      // Derive an error message from response body when possible
      const errMsg = (result.data && (result.data.message || result.data.error)) || `HTTP ${result.statusCode}`;
      envelope.error = errMsg;
      envelope.diagnostics = {
        url: aiService.AI_ENDPOINT,
        statusCode: result.statusCode,
        response: result.data
      };
    }

    return res.json(envelope);
  } catch (e) {
    console.error('AI send error:', e.message || e);
    // Log full error for debugging
    console.error(e && e.stack ? e.stack : e);
    // Return 200 envelope with diagnostics so browser won't show a network-level 502
    return res.json({ ok: false, error: e.message || String(e), diagnostics: (e && e.stack) || null });
  }
});

// Expose current AI configuration for debugging
app.get('/ai/config', (req, res) => {
  try {
    const cfg = {
      aiEndpoint: aiService.AI_ENDPOINT,
      aiEndpointSource: aiService.AI_ENDPOINT_SOURCE || (aiConfigFromFile.AI_ENDPOINT ? 'config_file' : (process.env.AI_ENDPOINT ? 'env' : 'default')),
      runtimeAi: RUNTIME_CONFIG.ai || {}
    };
    res.json({ ok: true, config: cfg });
  } catch (e) {
    res.json({ ok: false, error: e.message || String(e) });
  }
});

// GET /ai/health - ping the AI endpoint with a sample payload and return green/red
app.get('/ai/health', async (req, res) => {
  try {
    console.log('[server] /ai/health requested');
    const result = await aiService.healthCheck();
    console.log('[server] /ai/health result:', result && result.statusCode, result && result.ok);
    if (result.ok) {
      try {
        console.log('[server] /ai/health response body:', JSON.stringify(result.data).slice(0,2000));
      } catch (e) {}
      return res.json({ ok: true, status: 'green', statusCode: result.statusCode, data: result.data });
    }
    // Return 200 with ok:false and diagnostics so browser can render error details without a network error status
    console.warn('[server] /ai/health diagnostics:', result.diagnostics || result.error);
    return res.json({ ok: false, status: 'red', error: result.error || 'unknown', diagnostics: result.diagnostics || null });
  } catch (e) {
    console.error('AI health check error:', e.message || e);
    return res.json({ ok: false, status: 'red', error: e.message || String(e) });
  }
});

// ============================================================================
// TAXONOMY API - The Business Language Layer
// ============================================================================
app.get('/api/taxonomy', async (req, res) => {
  try {
    const taxonomy = await taxonomyService.getTaxonomy();
    res.json({ ok: true, taxonomy });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/taxonomy/concepts', async (req, res) => {
  try {
    const concepts = await taxonomyService.getConcepts();
    res.json({ ok: true, concepts });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/taxonomy/concepts', async (req, res) => {
  try {
    const concept = await taxonomyService.addConcept(req.body);
    res.json({ ok: true, concept });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/taxonomy/concepts/:id', async (req, res) => {
  try {
    const concept = await taxonomyService.updateConcept(req.params.id, req.body);
    res.json({ ok: true, concept });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/taxonomy/concepts/:id', async (req, res) => {
  try {
    await taxonomyService.deleteConcept(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/taxonomy/events', async (req, res) => {
  try {
    const events = await taxonomyService.getEvents();
    res.json({ ok: true, events });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/taxonomy/events', async (req, res) => {
  try {
    const event = await taxonomyService.addEvent(req.body);
    res.json({ ok: true, event });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Update an existing event
app.put('/api/taxonomy/events/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updates = req.body || {};
    const updated = await taxonomyService.updateEvent(id, updates);
    res.json({ ok: true, event: updated });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/taxonomy/events/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await taxonomyService.deleteEvent(id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/taxonomy/actions', async (req, res) => {
  try {
    const actions = await taxonomyService.getActions();
    res.json({ ok: true, actions });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/taxonomy/actions', async (req, res) => {
  try {
    const action = await taxonomyService.addAction(req.body);
    res.json({ ok: true, action });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/taxonomy/actions/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updates = req.body || {};
    const updated = await taxonomyService.updateAction(id, updates);
    res.json({ ok: true, action: updated });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/taxonomy/actions/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await taxonomyService.deleteAction(id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/taxonomy/capabilities', async (req, res) => {
  try {
    const capabilities = await taxonomyService.getCapabilities();
    res.json({ ok: true, capabilities });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/taxonomy/capabilities', async (req, res) => {
  try {
    const capability = await taxonomyService.addCapability(req.body);
    res.json({ ok: true, capability });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================================
// RULES ENGINE API - The Decision Layer
// ============================================================================
app.get('/api/rules', async (req, res) => {
  try {
    const ruleSets = await rulesEngine.getRuleSets();
    res.json({ ok: true, ruleSets });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/rules/:id', async (req, res) => {
  try {
    const ruleSet = await rulesEngine.getRuleSet(req.params.id);
    if (!ruleSet) return res.status(404).json({ ok: false, error: 'RuleSet not found' });
    res.json({ ok: true, ruleSet });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/rules', async (req, res) => {
  try {
    const ruleSet = await rulesEngine.addRuleSet(req.body);
    res.json({ ok: true, ruleSet });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/rules/:id', async (req, res) => {
  try {
    const ruleSet = await rulesEngine.updateRuleSet(req.params.id, req.body);
    res.json({ ok: true, ruleSet });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Backwards-compatible endpoint: some clients historically used
// PUT /api/rules/:id/rules to update just the rules array. Support
// that shape and forward to the canonical updateRuleSet call.
app.put('/api/rules/:id/rules', async (req, res) => {
  try {
    const body = req.body || {};
    const updates = {};
    if (Array.isArray(body.rules)) updates.rules = body.rules;
    else if (Array.isArray(body)) updates.rules = body;
    else if (body && body.id && Array.isArray(body.rules)) updates.rules = body.rules;
    // If no rules present, respond with bad request
    if (!updates.rules) return res.status(400).json({ ok: false, error: 'Missing rules array in request body' });
    const ruleSet = await rulesEngine.updateRuleSet(req.params.id, updates);
    res.json({ ok: true, ruleSet });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/rules/:id', async (req, res) => {
  try {
    await rulesEngine.deleteRuleSet(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/rules/:id/evaluate', async (req, res) => {
  try {
    const results = await rulesEngine.evaluate(req.params.id, req.body);
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================================
// WORKFLOW ENGINE API - The Sequence Layer
// ============================================================================
app.get('/api/workflows', async (req, res) => {
  try {
    const workflows = await workflowEngine.getWorkflows();
    res.json({ ok: true, workflows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/workflows/:id', async (req, res) => {
  try {
    const workflow = await workflowEngine.getWorkflow(req.params.id);
    if (!workflow) return res.status(404).json({ ok: false, error: 'Workflow not found' });
    res.json({ ok: true, workflow });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/workflows', async (req, res) => {
  try {
    const workflow = await workflowEngine.addWorkflow(req.body);
    res.json({ ok: true, workflow });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/workflows/:id', async (req, res) => {
  try {
    const workflow = await workflowEngine.updateWorkflow(req.params.id, req.body);
    res.json({ ok: true, workflow });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/workflows/:id', async (req, res) => {
  try {
    await workflowEngine.deleteWorkflow(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Start workflow execution
app.post('/api/workflows/:id/execute', async (req, res) => {
  try {
    const execution = await workflowEngine.startExecution(
      req.params.id,
      req.body.inputs || {},
      req.body.triggeredBy
    );
    res.json({ ok: true, execution });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Get workflow executions
app.get('/api/executions', async (req, res) => {
  try {
    const executions = await workflowEngine.getExecutions(req.query);
    res.json({ ok: true, executions });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Get single execution
app.get('/api/executions/:id', async (req, res) => {
  try {
    const execution = await workflowEngine.getExecution(req.params.id);
    if (!execution) return res.status(404).json({ ok: false, error: 'Execution not found' });
    res.json({ ok: true, execution });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Complete human task in workflow
app.post('/api/executions/:id/complete-task', async (req, res) => {
  try {
    await workflowEngine.completeHumanTask(req.params.id, req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Execute raw SQL (sanitized) - accepts { sql: "..." }
app.post('/execute-sql', async (req, res) => {
  try {
    const sqlText = req.body && req.body.sql;
    if (!sqlText) return res.status(400).json({ error: 'Missing sql in request body' });

    const sanitized = cleanAndSanitizeSQL(sqlText);
    if (!sanitized) return res.status(400).json({ error: 'Could not extract valid SQL from input' });

    // Execute the query
    const [rows] = await pool.execute(sanitized);
    res.json({ ok: true, query: sanitized, data: rows });
  } catch (error) {
    console.error('Error executing SQL:', error.message);
    res.status(500).json({ ok: false, error: error.message, details: error.stack });
  }
});
