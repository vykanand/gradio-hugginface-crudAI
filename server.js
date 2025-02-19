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
const PORT = 3000;

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

    const schema = {};
    for (const table of tables) {
      const tableStructure = await getTableStructure(table);
      if (tableStructure) {
        schema[table] = tableStructure;
      } else {
        console.error(`Failed to fetch structure for table: ${table}`);
      }
    }

    res.json(schema);
  } catch (error) {
    console.error("Error fetching database schema:", error.message);
    res.status(500).json({ error: "Failed to fetch database schema." });
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