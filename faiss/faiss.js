const { exec } = require("child_process");
const path = require("path");

// Define paths
const PYTHON_SCRIPT = path.resolve(__dirname, "vector_service.py");
const INDEX_FILE = path.resolve(__dirname, "faiss_index.faiss");

// Build index
function buildIndex(data) {
  return new Promise((resolve, reject) => {
    const command = `python3 ${PYTHON_SCRIPT} build '${JSON.stringify(
      data
    )}' ${INDEX_FILE}`;
    exec(command, (error, stdout, stderr) => {
      if (error) reject(stderr);
      else resolve(JSON.parse(stdout));
    });
  });
}

// Search index
function searchIndex(query, k = 1) {
  return new Promise((resolve, reject) => {
    const command = `python3 ${PYTHON_SCRIPT} search '${JSON.stringify(
      query
    )}' ${INDEX_FILE} ${k}`;
    exec(command, (error, stdout, stderr) => {
      if (error) reject(stderr);
      else resolve(JSON.parse(stdout));
    });
  });
}

// Example usage
(async () => {
  const data = [
    [0.1, 0.2, 0.3],
    [0.4, 0.5, 0.6],
    [0.7, 0.8, 0.9],
  ];
  const query = [0.1, 0.2, 0.3];

  try {
    console.log("Building index...");
    const buildResponse = await buildIndex(data);
    console.log(buildResponse);

    console.log("Searching index...");
    const searchResponse = await searchIndex(query);
    console.log(searchResponse);
  } catch (error) {
    console.error("Error:", error);
  }
})();
