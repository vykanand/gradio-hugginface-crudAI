const express = require("express");
const cors = require("cors");
const path = require("path");
const mysql = require("mysql2/promise");
// const redis = require("redis");

const processHtmlLLM = require("./generalAI.js");

const app = express();
const PORT = 3000;

// Middleware setup
app.use(express.json());
app.use(cors());

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
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "niveus@123",
  database: "dynamic_app",
  waitForConnections: true,
  connectionLimit: 10, // Set appropriate connection limit based on load
  queueLimit: 0,
});
console.log("MySQL pool created.");

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
  function extractSQLFromXML(aiResponse) {
  // Case-insensitive regex that handles different tag formats and whitespace
  const sqlRegex = /<\s*sqlcommand|SQL\s*>([\s\S]*?)<\/\s*(sqlcommand|SQL)\s*>/i;
  const match = aiResponse.match(sqlRegex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  throw new Error(`No valid SQL block found in AI response. Received: ${aiResponse}`);
}

// Modified cleanAndSanitizeSQL to handle XML
const cleanAndSanitizeSQL = (text) => {
  try {
    // First extract SQL from XML
    const sqlCommand = extractSQLFromXML(text);

    // Then proceed with original sanitization
    const entityNameRegex =
      /(?<!\w)(?:`?)([a-zA-Z_][a-zA-Z0-9_]*)(?:`?)(?!\w)/g;
    const sqlKeywordRegex = /\b(DATE\(\)|NOW\(\))\b/gi;
    const dateFunctionRegex = /\b(DATE\(\)|CURRENT_TIMESTAMP)\b/gi;
    const sqlQueryRegex =
      /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|REPLACE|MERGE|BEGIN|COMMIT|ROLLBACK|SET|SHOW|USE|DESCRIBE|GRANT|REVOKE|LOCK|UNLOCK|TABLE|PROCEDURE|FUNCTION|INDEX|VIEW)\b[^\;]*\;/i;

    const match = sqlCommand.match(sqlQueryRegex);

    if (match) {
      const query = match[0]
        .replace(entityNameRegex, (entityName) => entityName)
        .replace(sqlKeywordRegex, (match) => match.toUpperCase())
        .replace(/(?<=\s)DATE\(/g, "CURDATE(")
        .replace(/(?<=\s)CURRENT_TIMESTAMP\b/g, "CURRENT_TIMESTAMP")
        .trim();

      return query;
    }
    return null;
  } catch (error) {
    console.error("Error parsing SQL from XML:", error.message);
    return null;
  }
};

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
  Generate SQL wrapped in <SQL> tags:
  Table: ${entity}
  Structure: ${JSON.stringify(tableStructure)}
  Request: ${prompt}
  
  Return ONLY:
  <SQL>
    -- Valid SQL query here --
  </SQL>
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
      data: rows.length === 0 ? { message: "No records found." } : rows,
      query: sanitizedQuery, // Add the sanitized query to the response
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
