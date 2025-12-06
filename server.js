// show all product with stock more than 50 and join on order_items with product_id foreign key
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs").promises;
const mysql = require("mysql2/promise");
const { spawn } = require("child_process");

// const redis = require("redis");

const processHtmlLLM = require("./generalAI.js");

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
        res.json({ status: 'connected' });
    } catch (error) {
        res.status(500).json({ 
            error: 'Database connection failed',
            details: error.message 
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

// Add database connection test endpoint
app.get('/api/testConnection', async (req, res) => {
    try {
        // Test query to verify connection
        await pool.query('SELECT 1');
        res.json({ 
            status: 'connected',
            config: await getActiveConfig()
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Database connection failed',
            details: error.message,
            config: await getActiveConfig()
        });
    }
});

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

// Redis client setup
// const redisClient = redis.createClient({
//   url: "redis://localhost:6379", // Replace with your Redis URL if needed
// });
// redisClient.on("error", (err) => console.error("Redis error:", err));
// redisClient.connect().then(() => console.log("Redis connected."));

// MySQL connection pool setup
// const pool = mysql.createPool({
//   host: "sql7.freemysqlhosting.net",
//   user: "sql7755772",
//   password: "LbQdGMH7w9",
//   database: "sql7755772",
//   waitForConnections: true,
//   connectionLimit: 10, // Set appropriate connection limit based on load
//   queueLimit: 0,
// });

// const pool = mysql.createPool({
//   host: "localhost",
//   user: "root",
//   password: "niveus@123",
//   database: "dynamic_app",
//   waitForConnections: true,
//   connectionLimit: 10, // Set appropriate connection limit based on load
//   queueLimit: 0,
// });
// console.log("MySQL pool created.");

// Function to get table structure with Redis caching
async function getTableStructure(entity) {
  // try {
  //   // Check cache
  //   const cachedData = await redisClient.get(entity);
  //   if (cachedData) {
  //     console.log(`Cache hit for table: ${entity}`);
  //     return JSON.parse(cachedData);
  //   }

  //   console.log(`Cache miss for table: ${entity}. Fetching from DB...`);
  //   // Fetch from DB
  //   const tableStructure = await getTableStructureFromDB(entity);
  //   if (tableStructure) {
  //     // Store in cache with 1-day expiry
  //     await redisClient.set(entity, JSON.stringify(tableStructure), {
  //       EX: 86400, // Expire in 1 day
  //     });
  //   }
  //   return tableStructure;
  // } catch (error) {
  //   console.error("Error accessing Redis or DB:", error.message);
  //   return null;
  // }

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
    console.error("Error fetching database schema:", error.message);
    res.status(500).json({ error: "Failed to fetch database schema." });
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
    console.error("Error fetching table schema:", error.message);
    res.status(500).json({ error: "Failed to fetch table schema.", details: error.message });
  }
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

// Start the server
// app.listen(PORT, () => {
//   console.log(`Server is running on http://localhost:${PORT}`);
// });

// Call this when starting the server
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
});

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
