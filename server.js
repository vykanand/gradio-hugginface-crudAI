const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const processHtmlLLM = require("./generalAI.js");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());

// Create a MySQL connection pool
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "niveus@123",
  database: "dynamic_app",
  waitForConnections: true,
  connectionLimit: 10, // Set appropriate connection limit based on load
  queueLimit: 0, // Unlimited queue (adjust as necessary)
});

console.log("MySQL pool created.");

// Function to fetch table structure including columns and their datatypes
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
    console.error("Error fetching table structure:", error.message);
    return { error: "Failed to fetch table structure." };
  } finally {
    connection.release(); // Release the connection back to the pool
  }
}

const cleanAndSanitizeSQL = (text) => {
  // Regex to match a single valid SQL query, ensuring table/entity names and date/time functions retain their original casing
  const entityNameRegex = /(?<!\w)(?:`?)([a-zA-Z_][a-zA-Z0-9_]*)(?:`?)(?!\w)/g; // Match table/entity names with their casing
  const sqlKeywordRegex = /\b(DATE\(\)|NOW\(\))\b/gi; // Match DATE() and NOW() functions
  const sqlQueryRegex =
    /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|REPLACE|MERGE|BEGIN|COMMIT|ROLLBACK|SET|SHOW|USE|DESCRIBE|GRANT|REVOKE|LOCK|UNLOCK|TABLE|PROCEDURE|FUNCTION|INDEX|VIEW)\b[^\;]*\;/i;

  // Find the first valid SQL query
  const match = text.match(sqlQueryRegex);

  if (match) {
    // Extract and replace DATE() and NOW() functions with their current SQL format
    const query = match[0]
      .replace(entityNameRegex, (entityName) => {
        return entityName.toLowerCase() === entityName
          ? entityName
          : entityName; // Retain original casing
      })
      .replace(sqlKeywordRegex, (match) => {
        return match.toUpperCase(); // Convert DATE() and NOW() to uppercase for consistency
      })
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
    return { error: "Failed to fetch tables." };
  } finally {
    connection.release(); // Release the connection back to the pool
  }
}

// Route to handle /database GET requests to fetch the whole database schema
app.get("/database", async (req, res) => {
  try {
    // Fetch all tables in the database
    const tables = await getAllTables();
    if (tables.error) {
      return res.status(400).json({ error: tables.error });
    }

    // Fetch structure for each table
    const schema = {};
    for (const table of tables) {
      const tableStructure = await getTableStructure(table);
      if (tableStructure.error) {
        return res.status(400).json({ error: tableStructure.error });
      }
      schema[table] = tableStructure;
    }

    // Return the entire database schema as the response
    res.json(schema);
  } catch (error) {
    console.error("Error fetching database schema:", error);
    res.status(500).json({ error: "Failed to fetch database schema" });
  }
});

// Route to handle /:entity POST requests (unchanged)
app.post("/:entity", async (req, res) => {
  const entity = req.params.entity;
  const prompt = req.body.prompt;

  try {
    // Fetch table structure
    const tableStructure = await getTableStructure(entity);
    if (tableStructure.error) {
      throw new Error(tableStructure.error);
    }

    // Create a prompt for AI that includes the table structure
    const promptForLLM = `
  Provide a valid SQL query for the table ${entity} using today's date or current date.
  Include any necessary date conditions using CURDATE() or CURRENT_TIMESTAMP if required.
  ${JSON.stringify(tableStructure)}
  ${prompt}
`;

    // Process the prompt and extract SQL query and values
    const airesponse = await processHtmlLLM(promptForLLM);
    console.log(airesponse);

    // Clean and sanitize the SQL query
    const sanitizedQuery = cleanAndSanitizeSQL(airesponse);
    console.log(sanitizedQuery);

    // Use the pool to execute the query
    const [rows] = await pool.execute(sanitizedQuery);

    res.json(rows); // Send the fetched records as response
  } catch (error) {
    console.error("Error executing query:", error);
    res.status(500).json({ error: "Failed to execute query" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
