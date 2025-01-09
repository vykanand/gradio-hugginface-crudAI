// Function to send a question to external AI server
const askQuestion = async (question) => {
  console.log("Starting to process the question...");

  try {
    const response = await fetch(
      "https://gitops-production.up.railway.app/aiserver",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          aiquestion: question,
          sessionId: "vsacs",
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.response || data;
  } catch (error) {
    console.error(`Error with API request: ${error.message}`);
    throw error;
  }
};

// Function to chunk text into manageable sizes
const chunkText = (text, chunkSize) => {
  console.log("Chunking text...");
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  console.log("Text chunked into", chunks.length, "chunks.");
  return chunks;
};

// Process all text chunks and combine responses
const processChunks = async (chunks) => {
  console.log("Processing chunks...");
  let combinedResponse = "";
  const totalChunks = chunks.length;

  for (const [index, chunk] of chunks.entries()) {
    console.log(`Processing chunk ${index + 1} of ${totalChunks}...`);
    try {
      const response = await askQuestion(chunk);
      combinedResponse += response + " ";

      const percentageCompleted = ((index + 1) / totalChunks) * 100;
      console.log(`Progress: ${percentageCompleted.toFixed(2)}% completed.`);
    } catch (error) {
      console.error(`Error processing chunk ${index + 1}: ${error.message}`);
    }
  }
  console.log("All chunks processed.");
  return combinedResponse.trim();
};

// Main function to process HTML content
const processHtmlLLM = async (htmlContent) => {
  console.log("Starting HTML processing...");

  console.log("Converting HTML to plain text...");
  const plainText = htmlContent
    .replace(/<\/?[^>]+>/gi, "")
    .replace(/&nbsp;/g, " ");
  console.log("HTML converted to plain text.");

  const tokenLimit = 20000;
  const chunkSize = Math.floor(tokenLimit * 0.95);
  console.log(`Chunking text into chunks of size ${chunkSize}...`);
  const chunks = chunkText(plainText, chunkSize);

  console.log("Processing chunks...");
  const finalResponse = await processChunks(chunks);

  console.log("HTML processing completed check the results!");
  return finalResponse;
};

module.exports = processHtmlLLM;
