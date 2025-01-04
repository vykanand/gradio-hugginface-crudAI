import express from "express";
import bodyParser from "body-parser";
import { processHtmlLLM } from "./generalAI.js";
import mysql from "mysql2/promise";

const app = express();
app.use(bodyParser.json());

// Database connection details
const dbConfig = {
  host: "localhost",
  user: "root",
  password: "niveus@123",
  database: "dynamic_app",
};

async function interpretPrompt(prompt) {
  const p = `Interpret the following prompt for a CRUD operation in JSON format with keys: action, entity, params.
  action: create, fetch, update, delete
Prompt: "${prompt}"`;

  try {
    const result = await processHtmlLLM(p);
    const json = extractJson(result);
    if (!json) {
      throw new Error("Invalid JSON returned from the LLM processing.");
    }
    return json;
  } catch (error) {
    console.error("Error interpreting the prompt:", error.message);
    throw new Error(
      "Error interpreting the prompt. Please try again with a valid request."
    );
  }
}

function extractJson(textbody) {
  try {
    // Use regex to extract JSON from the body, whether it's enclosed in backticks or not
    const jsonMatch = textbody.match(
      /```(?:json)?\s*([\s\S]*?)\s*```|{[\s\S]*}/
    );
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1].trim());
    } else if (jsonMatch) {
      return JSON.parse(jsonMatch[0].trim());
    }
    throw new Error("No valid JSON object found in the text.");
  } catch (error) {
    console.error("Error extracting JSON:", error.message);
    return null; // Return null if JSON parsing fails
  }
}

async function executeCRUDOperation(json) {
  try {
    json = extractJson(JSON.stringify(json));
    if (!json) {
      throw new Error("Invalid JSON provided.");
    }
  } catch (error) {
    console.error("Failed to parse JSON from textbody:", error.message);
    return null;
  }

  const { action, entity, params } = json;

  console.log(
    `Executing action: ${action} on entity: ${entity} with params:`,
    params
  );

  const connection = await mysql.createConnection(dbConfig);
  let result;

  try {
    let query;
    let values;

    switch (action.toLowerCase()) {
      case "create":
        query = `INSERT INTO ${entity} (${Object.keys(params).join(
          ", "
        )}) VALUES (${Object.keys(params)
          .map(() => "?")
          .join(", ")})`;
        values = Object.values(params);
        result = await connection.execute(query, values);
        console.log("Record added successfully.");
        break;

      case "fetch":
        query = `SELECT * FROM ${entity} WHERE ${Object.keys(params)
          .map((key) => `${key} = ?`)
          .join(" AND ")}`;
        values = Object.values(params);
        const [rows] = await connection.execute(query, values);
        console.log("Fetched Records:", rows);
        result = rows;
        break;

      case "update":
        if (!params.id) {
          console.error("Update requires an 'id' field in params.");
          break;
        }
        const { id, ...updateParams } = params;
        query = `UPDATE ${entity} SET ${Object.keys(updateParams)
          .map((key) => `${key} = ?`)
          .join(", ")} WHERE id = ?`;
        values = [...Object.values(updateParams), id];
        result = await connection.execute(query, values);
        console.log("Record updated successfully.");
        break;

      case "delete":
        if (!params.id) {
          console.error("Delete requires an 'id' field in params.");
          break;
        }
        query = `DELETE FROM ${entity} WHERE id = ?`;
        values = [params.id];
        result = await connection.execute(query, values);
        console.log("Record deleted successfully.");
        break;

      default:
        console.error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("Database Operation Error:", error.message);
    result = null;
  } finally {
    await connection.end();
  }

  return result;
}

app.post("/crud", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const interpretedJSON = await interpretPrompt(prompt);

    if (!interpretedJSON) {
      return res.status(400).json({ error: "Invalid JSON provided." });
    }

    const result = await executeCRUDOperation(interpretedJSON);

    if (result && result.length > 0) {
      res.status(200).json({ message: result });
    } else {
      res.status(200).json({ message: "No records found." });
    }
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
