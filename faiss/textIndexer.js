const tf = require("@tensorflow/tfjs-node");
const use = require("@tensorflow-models/universal-sentence-encoder");
const fs = require("fs").promises;
const path = require("path");

class TextIndexer {
  constructor() {
    this.stateFile = "index_state.json";
    this.vectorFile = "vectors.json";
    this.model = null;
    this.vectors = [];
    this.state = {
      files: {}, // Maps file paths to last modified times
      sentences: [], // Original sentences
      fileToIndices: {}, // Maps file paths to vector indices
    };
  }

  async initialize() {
    // Load Universal Sentence Encoder model
    this.model = await use.load();

    // Load existing state and vectors if they exist
    try {
      const stateExists = await fs
        .access(this.stateFile)
        .then(() => true)
        .catch(() => false);

      if (stateExists) {
        const stateData = await fs.readFile(this.stateFile, "utf-8");
        this.state = JSON.parse(stateData);

        const vectorData = await fs.readFile(this.vectorFile, "utf-8");
        this.vectors = JSON.parse(vectorData);
      }
    } catch (error) {
      console.error("Error loading existing state:", error);
      // Continue with empty state if loading fails
    }
  }

  async saveState() {
    await fs.writeFile(this.stateFile, JSON.stringify(this.state, null, 2));
    await fs.writeFile(this.vectorFile, JSON.stringify(this.vectors));
  }

  async getSentencesFromFile(filePath) {
    const content = await fs.readFile(filePath, "utf-8");
    // Split text into sentences (simple implementation)
    return content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  needsUpdate(filePath) {
    if (!this.state.files[filePath]) {
      return true;
    }

    const stats = fs.statSync(filePath);
    return stats.mtime.getTime() > this.state.files[filePath];
  }

  async updateIndex(directory) {
    const files = await fs.readdir(directory);

    for (const file of files) {
      if (!file.endsWith(".txt")) continue;

      const filePath = path.join(directory, file);
      if (!this.needsUpdate(filePath)) continue;

      // Get sentences from file
      const sentences = await this.getSentencesFromFile(filePath);
      if (sentences.length === 0) continue;

      // Generate embeddings
      const embeddings = await this.model.embed(sentences);
      const vectors = await embeddings.array();

      // Remove old vectors if file was previously indexed
      if (this.state.fileToIndices[filePath]) {
        const [startIdx, count] = this.state.fileToIndices[filePath];
        this.vectors.splice(startIdx, count);
        this.state.sentences.splice(startIdx, count);

        // Update indices for files that come after
        for (const [path, [idx, cnt]] of Object.entries(
          this.state.fileToIndices
        )) {
          if (idx > startIdx) {
            this.state.fileToIndices[path] = [
              idx - count + vectors.length,
              cnt,
            ];
          }
        }
      }

      // Add new vectors and update state
      const startIdx = this.vectors.length;
      this.vectors.push(...vectors);
      this.state.sentences.push(...sentences);
      this.state.fileToIndices[filePath] = [startIdx, vectors.length];
      this.state.files[filePath] = Date.now();
    }

    await this.saveState();
  }

  async search(query, k = 5) {
    if (!this.model || this.vectors.length === 0) {
      return [];
    }

    // Generate query embedding
    const queryEmbedding = await this.model.embed([query]);
    const queryVector = await queryEmbedding.array();

    // Calculate cosine similarity with all vectors
    const similarities = this.vectors.map((vector) => {
      const dotProduct = tf.tensor1d(queryVector[0]).dot(tf.tensor1d(vector));
      const queryNorm = tf.tensor1d(queryVector[0]).norm();
      const vectorNorm = tf.tensor1d(vector).norm();
      const similarity = dotProduct.div(queryNorm.mul(vectorNorm));
      return similarity.arraySync();
    });

    // Get top k results
    const results = similarities
      .map((score, index) => ({ score, text: this.state.sentences[index] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    return results;
  }
}

// Example usage
async function main() {
  const indexer = new TextIndexer();
  await indexer.initialize();

  // Update index with all txt files in data directory
  console.log("Updating index...");
  await indexer.updateIndex("data");

  // Example search
  const query = "machine learning and artificial intelligence";
  console.log(`\nSearching for: ${query}`);
  const results = await indexer.search(query, 3);

  console.log("\nResults:");
  for (const { score, text } of results) {
    console.log(`\nScore: ${score.toFixed(4)}`);
    console.log(`Text: ${text}`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = TextIndexer;
