# FAISS Text Search Implementation

This directory contains implementations of text search using FAISS (Facebook AI Similarity Search) for efficient similarity-based text search with incremental indexing capabilities.

## Project Structure

```
faiss/
├── data/               # Sample text files for testing
├── faiss.py           # Python implementation of FAISS service
├── vector_service.py  # Renamed FAISS service file
├── text_indexer.py    # Main text indexing implementation
├── search_cli.py      # Command-line interface for search
├── build_index_example.py  # Example implementation
└── faiss.js           # Node.js implementation attempt
```

## Features

- Semantic text search using vector embeddings
- Incremental indexing (only processes new/modified files)
- State tracking for efficient updates
- Command-line interface for easy interaction
- Support for multiple text files
- Ranked search results by relevance

## Python Implementation

The Python implementation uses:

- FAISS for efficient similarity search
- Sentence Transformers for text embeddings
- Incremental indexing with state tracking
- Command-line interface for easy use

### Usage

To update the index and perform a search:

```bash
python3 search_cli.py --update --query "your search query" --results 5
```

Options:

- `--update`: Update the index before searching
- `--query`: The search query text
- `--results`: Number of results to return (default: 3)

### Example

```bash
python3 search_cli.py --update --query "data visualization and analytics" --results 4
```

This will:

1. Update the index with any new or modified files
2. Search for content related to data visualization and analytics
3. Return the top 4 most relevant results

## Sample Data

The `data/` directory contains sample text files for testing the search functionality. These files cover various topics related to:

- Machine Learning and AI
- Data Processing
- Analytics and Visualization
- Business Intelligence

## Implementation Details

### Text Indexing

- Files are processed incrementally
- Only new or modified files are indexed
- File state is tracked in a JSON file
- Vectors are stored using FAISS

### Search Process

1. Convert query to vector embedding
2. Use FAISS for efficient similarity search
3. Rank results by relevance score
4. Return matching text segments with scores

## Storage System

The FAISS implementation stores its embedded data in two main files:

### text_vectors.faiss

- Contains the actual vector embeddings in FAISS binary format
- Stores vectors with 384 dimensions each (using all-MiniLM-L6-v2 model)
- Optimized for fast similarity search operations
- Binary format specific to FAISS
- Located in the faiss directory
- Grows as more text is indexed

### last_index.json

- Tracks metadata and file mappings
- Contains:
  - File paths and their last modified timestamps
  - Total number of vectors in the index
  - Mapping of file paths to their vector indices
- Used to maintain incremental indexing
- Located in the faiss directory
- JSON format for easy inspection and debugging

### Storage Process

1. Text files are processed into sentences
2. Sentences are converted to embeddings using sentence-transformers
3. Embeddings are stored in text_vectors.faiss
4. Metadata and mappings are updated in last_index.json

### Incremental Indexing

The system tracks file modifications to enable incremental updates:

1. Checks file modification times against stored timestamps
2. Only processes new or modified files
3. Updates both vector storage and metadata
4. Maintains mapping between vectors and source text

### Example Storage Structure

```json
{
  "files": {
    "data/sample1.txt": 1736414400.3989196, // File modification timestamps
    "data/sample2.txt": 1736414411.5340147
  },
  "total_vectors": 22, // Total vectors in the index
  "file_to_indices": {
    "data/sample1.txt": [0, 5], // Vectors 0-4 belong to sample1.txt
    "data/sample2.txt": [5, 6] // Vectors 5-10 belong to sample2.txt
  }
}
```

This storage system enables:

- Efficient similarity search
- Incremental updates
- Connection tracking between vectors and source text
- Easy management of indexed content

## Development

To add new files for indexing:

1. Place text files in the `data/` directory
2. Run the search CLI with the --update flag
3. New content will be automatically indexed

The system maintains state between runs, so only new or modified files are processed.
