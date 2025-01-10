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
- Example size: ~33KB for 22 vectors (1.5KB per vector average)

### last_index.json

- Tracks metadata and file mappings
- Lightweight JSON file (~0.5KB for tracking multiple files)
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

## Scaling and Big Data Handling

### Quick Reference Guide

Choose the appropriate solution based on your data size:

| Data Size  | Vectors | Recommended Approach                 |
| ---------- | ------- | ------------------------------------ |
| Small      | <100K   | IndexFlatL2 (current implementation) |
| Medium     | 100K-1M | IVF + Single Machine                 |
| Large      | 1M-10M  | IVF/IMI + Memory Optimization        |
| Very Large | >10M    | Distributed Setup + PQ Compression   |

### Current Limitations

- In-memory index: FAISS loads the entire index into memory
- Single machine implementation
- Sequential processing of files
- File-based storage system

### Recommendations for Big Data

1. Index Partitioning

   - Split large datasets into multiple FAISS indices
   - Use multiple smaller indices instead of one large index
   - Implement sharding based on content categories or time periods

2. Distributed Processing

   - Implement parallel processing for vector generation
   - Use distributed FAISS for larger datasets
   - Consider using Spark or Dask for data processing

3. Storage Optimizations

   - Implement database storage for metadata instead of JSON
   - Use compressed vector formats
   - Consider using FAISS's compressed index types (IVF, IMI)
   - Implement vector pruning for outdated content

4. Memory Management

   - Implement index loading/unloading strategies
   - Use memory-mapped files for large indices
   - Consider streaming processing for continuous updates

5. Performance Improvements
   - Batch processing for vector generation
   - Asynchronous index updates
   - Caching frequently accessed vectors
   - Implement approximate nearest neighbor search

### Example Big Data Architecture

```
Large-Scale Implementation:
├── Distributed Vector Generation
│   ├── Multiple Worker Nodes
│   └── Batch Processing
├── Sharded FAISS Indices
│   ├── Category-based Shards
│   └── Time-based Partitions
├── Database Backend
│   ├── Metadata Storage
│   └── Vector Mappings
└── Load Balancer
    ├── Query Distribution
    └── Index Selection
```

### Distributed Storage Implementation

#### 1. Vector Storage Distribution

```
Distributed FAISS Setup:
├── Primary Node
│   ├── Index Registry
│   ├── Shard Map
│   └── Load Balancer
├── Storage Nodes (Multiple)
│   ├── FAISS Index Shards
│   │   ├── Shard-001.faiss
│   │   ├── Shard-002.faiss
│   │   └── ...
│   ├── Local Metadata Cache
│   └── Health Monitor
└── Backup Nodes
    ├── Replicated Shards
    └── Failover System
```

Implementation approach:

```python
# Example: Implementing distributed FAISS
from distributed_faiss import DistributedIndex

# Initialize distributed index
dist_index = DistributedIndex(
    shard_size=1000000,  # vectors per shard
    replication_factor=2, # each shard is replicated twice
    nodes=['node1:port', 'node2:port', 'node3:port']
)

# Add vectors to distributed system
dist_index.add_vectors(vectors, auto_shard=True)

# Distributed search
results = dist_index.search(query_vector, k=5)
```

#### 2. Metadata Distribution

Use distributed database (e.g., MongoDB) for metadata:

```javascript
// MongoDB schema example
{
  "shard_map": {
    "shard_001": {
      "node": "node1:port",
      "vector_range": [0, 999999],
      "replicas": ["node2:port", "node3:port"]
    }
  },
  "file_mappings": {
    "file_id": {
      "shards": ["shard_001", "shard_002"],
      "vector_counts": {
        "shard_001": 500,
        "shard_002": 300
      }
    }
  }
}
```

#### 3. Coordination System

Use ZooKeeper/etcd for coordination:

- Shard leadership election
- Node health monitoring
- Configuration management
- Service discovery

```yaml
# ZooKeeper structure
/faiss_cluster
  /nodes
    /node1
      status: active
      shards: [001, 002]
    /node2
      status: active
      shards: [003, 004]
  /shards
    /shard_001
      primary: node1
      replicas: [node2, node3]
    /shard_002
      primary: node1
      replicas: [node2, node3]
```

#### 4. Load Balancing

Implement smart routing:

```python
class ShardRouter:
    def route_query(self, query_vector):
        # Find relevant shards
        relevant_shards = self.find_nearest_shards(query_vector)

        # Load balance across replicas
        selected_nodes = self.balance_load(relevant_shards)

        # Aggregate results
        results = self.aggregate_results(
            [node.search(query_vector) for node in selected_nodes]
        )
        return results
```

#### 5. Replication Strategy

- Primary-Secondary replication
- Automatic failover
- Consistency management
- Regular health checks

```python
class ReplicationManager:
    def replicate_shard(self, shard_id, source_node, target_nodes):
        # Copy shard data
        for node in target_nodes:
            self.copy_shard(shard_id, source_node, node)

        # Verify replication
        self.verify_consistency(shard_id, [source_node, *target_nodes])

        # Update metadata
        self.update_shard_map(shard_id, source_node, target_nodes)
```

#### 6. Data Consistency and Synchronization

Implement consistency protocols:

```python
class ConsistencyManager:
    def __init__(self):
        self.version_tracker = VersionTracker()
        self.lock_manager = DistributedLock()

    async def update_shard(self, shard_id, vectors):
        # Get distributed lock
        async with self.lock_manager.lock(f"shard_{shard_id}"):
            # Update version
            version = self.version_tracker.new_version()

            # Update primary
            primary = self.get_primary_node(shard_id)
            await primary.update(vectors, version)

            # Sync replicas
            replicas = self.get_replica_nodes(shard_id)
            await self.sync_replicas(replicas, vectors, version)

            # Verify consistency
            await self.verify_all_nodes(shard_id, version)
```

Synchronization Protocol:

```yaml
# Sync Process
1. Write to Primary:
  - Acquire distributed lock
  - Update version number
  - Write data to primary node
  - Update metadata

2. Replicate to Secondaries:
  - Parallel replication to all replicas
  - Each replica acknowledges receipt
  - Verify version numbers match

3. Consistency Check:
  - Compare checksums across nodes
  - Verify vector counts
  - Validate metadata consistency

4. Recovery Process:
  - Detect inconsistencies
  - Identify lagging nodes
  - Force re-sync if needed
```

Node Health Management:

```python
class HealthManager:
    def monitor_node_health(self):
        while True:
            for node in self.get_all_nodes():
                status = self.check_node_status(node)
                if status.needs_attention:
                    self.handle_node_issues(node)

            # Update cluster status
            self.update_cluster_health()
            await asyncio.sleep(HEALTH_CHECK_INTERVAL)

    def handle_node_issues(self, node):
        if node.is_primary:
            self.initiate_failover(node)
        else:
            self.repair_replica(node)
```

### Storage Requirements

- Vector Size: ~1.5KB per vector
- Index Overhead: ~50% for optimized indices
- Example Scaling:
  - 1M vectors ≈ 1.5GB + overhead
  - 10M vectors ≈ 15GB + overhead
  - 100M vectors: Consider distributed setup

### FAISS Index Types for Big Data

FAISS provides specialized index types optimized for large-scale data:

1. IVF (Inverted File Index)

   - Clusters vectors for faster search
   - Reduces memory usage and search time
   - Good for datasets up to 1M vectors
   - Example: `IndexIVFFlat`

2. IMI (Inverted Multi-Index)

   - More efficient than IVF for very large datasets
   - Better clustering for high-dimensional data
   - Suitable for 1M+ vectors
   - Example: `IndexIVFPQ`

3. HNSW (Hierarchical NSW)

   - Extremely fast search times
   - Good accuracy/performance trade-off
   - Works well with up to 10M vectors
   - Example: `IndexHNSWFlat`

4. Product Quantization (PQ)
   - Compresses vectors for memory efficiency
   - Can reduce memory usage by 4x-16x
   - Suitable for very large datasets
   - Example: `IndexPQ`

To implement these optimizations:

```python
# Example: Using IVF index for better scaling
dimension = 384  # vector dimension
nlist = 100     # number of clusters
quantizer = faiss.IndexFlatL2(dimension)
index = faiss.IndexIVFFlat(quantizer, dimension, nlist)
index.train(training_vectors)  # Required for IVF indices
```

## Development

To add new files for indexing:

1. Place text files in the `data/` directory
2. Run the search CLI with the --update flag
3. New content will be automatically indexed

The system maintains state between runs, so only new or modified files are processed.
