const askQuestion = async (question) => {
  console.log("Starting to process the question...");
  const maxRetries = 3;
  const baseDelay = 2000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(
        "https://gradio-hugginface-aiserver-production.up.railway.app/large",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            aiquestion: question,
            sessionId: "wkqgml2",
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        
        // Extract the response text from the JSON structure
        let aiMessage = '';
        
        if (typeof data === 'string') {
          try {
            const parsedData = JSON.parse(data);
            aiMessage = parsedData.response || data;
          } catch (e) {
            aiMessage = data;
          }
        } else if (data && typeof data === 'object') {
          aiMessage = data.response || JSON.stringify(data);
        } else {
          aiMessage = 'Received an unexpected response format';
        }
        
        return String(aiMessage || '').trim();
      }

      if (attempt < maxRetries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelay * (attempt + 1))
        );
        continue;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    } catch (error) {
      if (attempt === maxRetries - 1) {
        console.error(`Error with API request: ${error.message}`);
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelay * (attempt + 1))
      );
    }
  }
};

const chunkText = (text, chunkSize) => {
  console.log("Chunking text...");
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  console.log("Text chunked into", chunks.length, "chunks.");
  return chunks;
};

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
      // Continue processing remaining chunks even if one fails
    }
  }
  console.log("All chunks processed.");
  return combinedResponse.trim();
};

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
