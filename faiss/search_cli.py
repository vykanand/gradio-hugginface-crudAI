import argparse
from text_indexer import TextIndexer

def main():
    parser = argparse.ArgumentParser(description='Text Search CLI')
    parser.add_argument('--update', action='store_true', help='Update the index before searching')
    parser.add_argument('--query', type=str, help='Search query')
    parser.add_argument('--results', type=int, default=3, help='Number of results to return')
    args = parser.parse_args()

    indexer = TextIndexer()

    if args.update:
        print("Updating index...")
        indexer.update_index('data')
        print("Index updated successfully!")

    if args.query:
        print(f"\nSearching for: {args.query}")
        results = indexer.search(args.query, k=args.results)
        
        print("\nResults:")
        for text, score in results:
            print(f"\nScore: {score:.4f}")
            print(f"Text: {text}")

if __name__ == "__main__":
    main()