import numpy as np
import faiss
import json
import os
import sys

# Generate sample data
def generate_sample_data(num_vectors=1000, dimension=128):
    """Generate random vectors for testing"""
    try:
        return np.random.random((num_vectors, dimension)).astype('float32')
    except Exception as e:
        print(f"Error generating sample data: {str(e)}")
        sys.exit(1)

# Build and save the index
def build_and_save_index(vectors, index_file):
    """Build a FAISS index and save it to disk"""
    try:
        # Get the dimension of the vectors
        dimension = vectors.shape[1]
        
        # Create a new index
        # Using the most basic index type for exact L2 distance computation
        index = faiss.IndexFlatL2(dimension)
        
        # Convert vectors to contiguous float32 array and add to index
        vectors = np.ascontiguousarray(vectors, dtype='float32')
        index.add(vectors)
        
        # Save the index to disk
        faiss.write_index(index, index_file)
        
        return {
            "num_vectors": len(vectors),
            "dimension": dimension,
            "index_file": index_file
        }
    except AttributeError as e:
        print(f"FAISS module error: {str(e)}")
        sys.exit(1)
    except Exception as e:
        print(f"Error building index: {str(e)}")
        sys.exit(1)

# Test search functionality
def test_search(query_vector, index_file, k=5):
    """Test the index by performing a search"""
    try:
        # Load the index
        index = faiss.read_index(index_file)
        
        # Reshape query vector to 2D array and ensure it's contiguous float32
        query_vector = np.ascontiguousarray(query_vector.reshape(1, -1), dtype='float32')
        
        # Perform the search
        distances, indices = index.search(query_vector, k)
        
        return {
            "distances": distances.tolist(),
            "indices": indices.tolist()
        }
    except Exception as e:
        print(f"Error performing search: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    try:
        # Parameters
        NUM_VECTORS = 1000  # Number of vectors in the index
        DIMENSION = 128     # Dimension of each vector
        INDEX_FILE = "vectors.faiss"  # Output file name
        
        print("Generating sample data...")
        vectors = generate_sample_data(NUM_VECTORS, DIMENSION)
        
        print("Building and saving index...")
        result = build_and_save_index(vectors, INDEX_FILE)
        print(f"Index built successfully with {result['num_vectors']} vectors of dimension {result['dimension']}")
        print(f"Index saved to {result['index_file']}")
        
        # Test the index with a random query
        print("\nTesting search functionality...")
        query = np.random.random(DIMENSION).astype('float32')
        search_result = test_search(query, INDEX_FILE)
        
        print("\nSearch results:")
        print(f"Query found {len(search_result['indices'][0])} nearest neighbors")
        print("Distances:", search_result['distances'][0])
        print("Indices:", search_result['indices'][0])
        
    except Exception as e:
        print(f"An unexpected error occurred: {str(e)}")
        sys.exit(1)