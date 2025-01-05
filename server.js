const express = require("express");
const cors = require("cors");
const path = require("path");
const mysql = require("mysql2/promise");
const redis = require("redis");

const processHtmlLLM = require("./generalAI.js");

const app = express();
const PORT = 3000;

// Middleware setup
app.use(express.json());
app.use(cors());

// Redis client setup
const redisClient = redis.createClient({
  url: "redis://localhost:6379", // Replace with your Redis URL if needed
});
redisClient.on("error", (err) => console.error("Redis error:", err));
redisClient.connect().then(() => console.log("Redis connected."));

// MySQL connection pool setup
const pool = mysql.createPool({
  host: "sql7.freemysqlhosting.net",
  user: "sql7755772",
  password: "LbQdGMH7w9",
  database: "sql7755772",
  waitForConnections: true,
  connectionLimit: 10, // Set appropriate connection limit based on load
  queueLimit: 0,
});
console.log("MySQL pool created.");

// Function to fetch table structure from the database
async function getTableStructureFromDB(entity) {
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

// Function to get table structure with Redis caching
async function getTableStructure(entity) {
  try {
    // Check cache
    const cachedData = await redisClient.get(entity);
    if (cachedData) {
      console.log(`Cache hit for table: ${entity}`);
      return JSON.parse(cachedData);
    }

    console.log(`Cache miss for table: ${entity}. Fetching from DB...`);
    // Fetch from DB
    const tableStructure = await getTableStructureFromDB(entity);
    if (tableStructure) {
      // Store in cache with 1-day expiry
      await redisClient.set(entity, JSON.stringify(tableStructure), {
        EX: 86400, // Expire in 1 day
      });
    }
    return tableStructure;
  } catch (error) {
    console.error("Error accessing Redis or DB:", error.message);
    return null;
  }
}

const cleanAndSanitizeSQL = (text) => {
  // Regex to match a single valid SQL query, ensuring table/entity names and date/time functions retain their original casing
  const entityNameRegex = /(?<!\w)(?:`?)([a-zA-Z_][a-zA-Z0-9_]*)(?:`?)(?!\w)/g; // Match table/entity names with their casing
  const sqlKeywordRegex = /\b(DATE\(\)|NOW\(\))\b/gi; // Match DATE() and NOW() functions
  const dateFunctionRegex = /\b(DATE\(\)|CURRENT_TIMESTAMP)\b/gi; // Detect date-related functions
  const sqlQueryRegex =
    /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|REPLACE|MERGE|BEGIN|COMMIT|ROLLBACK|SET|SHOW|USE|DESCRIBE|GRANT|REVOKE|LOCK|UNLOCK|TABLE|PROCEDURE|FUNCTION|INDEX|VIEW)\b[^\;]*\;/i;

  // Find the first valid SQL query
  const match = text.match(sqlQueryRegex);

  if (match) {
    // Check if the query contains any date-related keywords
    const containsDateFunction = dateFunctionRegex.test(text);

    // Modify query to include date conditions if necessary
    const query = match[0]
      .replace(entityNameRegex, (entityName) => {
        return entityName.toLowerCase() === entityName
          ? entityName
          : entityName; // Retain original casing
      })
      .replace(sqlKeywordRegex, (match) => {
        return match.toUpperCase(); // Convert DATE() and NOW() to uppercase for consistency
      })
      .replace(/(?<=\s)DATE\(/g, "CURDATE(") // Ensure CURDATE() format is used
      .replace(/(?<=\s)CURRENT_TIMESTAMP\b/g, "CURRENT_TIMESTAMP") // Ensure CURRENT_TIMESTAMP format is used
      .trim();

    return query; // Return the sanitized and cleaned query
  } else {
    return null; // No valid SQL query found
  }
};

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

// Route to handle dynamic SQL generation and execution
// Route to handle dynamic SQL generation and execution
app.post("/:entity", async (req, res) => {
  const entity = req.params.entity;
  const prompt = req.body.prompt;

  try {
    // Fetch table structure
    const tableStructure = await getTableStructure(entity);
    if (!tableStructure) {
      return res.status(500).json({ error: "Failed to fetch table structure." });
    }

    // Create prompt for AI
    const promptForLLM = `
      Generate a valid SQL query based on the following table structure and request. Ensure the query is formatted using (triple backticks) sql (end triple backticks) and follows SQL standards.
      ${entity}
      ${JSON.stringify(tableStructure)}
      ${prompt}
      Only generate SQL queries. Do not include explanations, comments, or any additional text.
    `;

    // Get AI response
    const airesponse = await processHtmlLLM(promptForLLM);
    console.log("AI Response:", airesponse);

    const sanitizedQuery = cleanAndSanitizeSQL(airesponse);
    console.log(sanitizedQuery);

    // Use the pool to execute the query directly
    const [rows] = await pool.execute(sanitizedQuery);

    if (rows.length === 0) {
      return res.json({ message: "No records found." });
    }

    res.json(rows);

  } catch (error) {
    console.error("Error executing query on first attempt:", error.message);

    // Retry logic: If the query fails, pass the failed query back to LLM and retry once
    try {
      console.log("Retrying query generation with LLM...");

      // Get AI response again to fix any potential issues
      let retryAiResponse = await processHtmlLLM(`
        The previous query failed to execute properly. Please revise the query based on the following table structure and the original request.
        ${entity}
        ${JSON.stringify(await getTableStructure(entity))}
        Original query: ${sanitizedQuery}
        Original error: ${error.message}
        Please ensure the query is correct and follows SQL standards. Only generate SQL queries without explanations, comments, or additional text.
      `);
      
      console.log("Retry AI Response:", retryAiResponse);

      let retrySanitizedQuery = cleanAndSanitizeSQL(retryAiResponse);
      console.log("Retry Sanitized Query:", retrySanitizedQuery);

      // Try to execute the retry query
      let [retryRows, retryFields] = await pool.execute(retrySanitizedQuery);

      if (retryRows.length === 0) {
        return res.json({ message: "No records found." });
      }

      // Return the result of the retried query
      res.json(retryRows);

    } catch (retryError) {
      console.error("Error executing retried query:", retryError.message);
      res.status(500).json({ error: "Failed to execute query after retry." });
    }
  }
});


// Root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
