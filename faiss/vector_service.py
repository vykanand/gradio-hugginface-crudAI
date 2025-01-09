import faiss
import numpy as np
import json
import sys

def build_index(data, output_file):
    embeddings = np.array(data, dtype="float32")
    dimension = embeddings.shape[1]
    index = faiss.IndexFlatL2(dimension)
    index.add(embeddings)
    faiss.write_index(index, output_file)
    return {"message": "Index built and saved successfully"}

def search_index(query, index_file, k):
    index = faiss.read_index(index_file)
    query_vector = np.array([query], dtype="float32")
    distances, indices = index.search(query_vector, k)
    return {"indices": indices.tolist(), "distances": distances.tolist()}

if __name__ == "__main__":
    command = sys.argv[1]
    if command == "build":
        data = json.loads(sys.argv[2])
        output_file = sys.argv[3]
        print(json.dumps(build_index(data, output_file)))
    elif command == "search":
        query = json.loads(sys.argv[2])
        index_file = sys.argv[3]
        k = int(sys.argv[4])
        print(json.dumps(search_index(query, index_file, k)))
