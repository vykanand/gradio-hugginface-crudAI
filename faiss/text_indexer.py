import os
import json
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Tuple
from datetime import datetime

class TextIndexer:
    def __init__(self, model_name: str = 'all-MiniLM-L6-v2'):
        """Initialize the text indexer with a sentence transformer model."""
        self.model = SentenceTransformer(model_name)
        self.dimension = 384  # Output dimension of the model
        self.index = faiss.IndexFlatL2(self.dimension)
        self.state_file = 'last_index.json'
        self.index_file = 'text_vectors.faiss'
        self.state = self._load_state()
        self._load_or_create_index()

    def _load_state(self) -> Dict:
        """Load or create the indexing state."""
        if os.path.exists(self.state_file):
            with open(self.state_file, 'r') as f:
                return json.load(f)
        return {
            'files': {},  # Maps file paths to last modified times
            'total_vectors': 0,
            'file_to_indices': {}  # Maps file paths to their vector indices
        }

    def _save_state(self):
        """Save the current indexing state."""
        with open(self.state_file, 'w') as f:
            json.dump(self.state, f, indent=2)

    def _load_or_create_index(self):
        """Load existing index or create a new one."""
        if os.path.exists(self.index_file):
            self.index = faiss.read_index(self.index_file)
        else:
            self.index = faiss.IndexFlatL2(self.dimension)

    def _save_index(self):
        """Save the FAISS index to disk."""
        faiss.write_index(self.index, self.index_file)

    def _get_file_sentences(self, file_path: str) -> List[str]:
        """Split file content into sentences."""
        with open(file_path, 'r') as f:
            content = f.read()
        # Simple sentence splitting on periods followed by whitespace
        sentences = [s.strip() for s in content.split('.') if s.strip()]
        return sentences

    def _needs_update(self, file_path: str) -> bool:
        """Check if a file needs to be indexed or updated."""
        if not os.path.exists(file_path):
            return False
        
        mtime = os.path.getmtime(file_path)
        return (file_path not in self.state['files'] or 
                mtime > self.state['files'][file_path])

    def update_index(self, directory: str):
        """Update the index with new or modified files."""
        for root, _, files in os.walk(directory):
            for file in files:
                if not file.endswith('.txt'):
                    continue
                
                file_path = os.path.join(root, file)
                if not self._needs_update(file_path):
                    continue

                # Remove old vectors for this file if it exists
                if file_path in self.state['file_to_indices']:
                    old_start, old_count = self.state['file_to_indices'][file_path]
                    # Note: In a production system, we'd need to handle deletion properly
                    # For this example, we'll just overwrite the old vectors

                sentences = self._get_file_sentences(file_path)
                if not sentences:
                    continue

                # Convert sentences to embeddings
                embeddings = self.model.encode(sentences, convert_to_numpy=True)
                embeddings = np.ascontiguousarray(embeddings.astype('float32'))

                # Add new vectors
                start_idx = self.state['total_vectors']
                self.index.add(embeddings)

                # Update state
                self.state['files'][file_path] = os.path.getmtime(file_path)
                self.state['file_to_indices'][file_path] = (start_idx, len(sentences))
                self.state['total_vectors'] += len(sentences)

        # Save updated state and index
        self._save_state()
        self._save_index()

    def search(self, query: str, k: int = 5) -> List[Tuple[str, float]]:
        """Search for similar content."""
        # Convert query to embedding
        query_vector = self.model.encode([query], convert_to_numpy=True)
        query_vector = np.ascontiguousarray(query_vector.astype('float32'))

        # Search the index
        distances, indices = self.index.search(query_vector, k)
        
        # Find corresponding files and sentences
        results = []
        for idx, dist in zip(indices[0], distances[0]):
            # Find which file this vector belongs to
            for file_path, (start_idx, count) in self.state['file_to_indices'].items():
                if start_idx <= idx < start_idx + count:
                    # Read the specific sentence
                    sentences = self._get_file_sentences(file_path)
                    sentence_idx = idx - start_idx
                    if sentence_idx < len(sentences):
                        results.append((sentences[sentence_idx], dist))
                    break

        return results

if __name__ == "__main__":
    # Example usage
    indexer = TextIndexer()
    
    # Update index with all txt files in data directory
    print("Updating index...")
    indexer.update_index('data')
    
    # Example search
    query = "machine learning and artificial intelligence"
    print(f"\nSearching for: {query}")
    results = indexer.search(query, k=3)
    
    print("\nResults:")
    for text, score in results:
        print(f"Score: {score:.4f}")
        print(f"Text: {text}")
        print()