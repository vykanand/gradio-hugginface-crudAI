#!/bin/sh
set -e

echo "Waiting for Zookeeper to be ready..."
sleep 5

ZK_HOST="${ZK_HOST:-zookeeper:2181}"
echo "Cleaning stale broker registrations from $ZK_HOST..."

# List broker IDs using zkCli - capture stderr too and filter for bracketed output
OUT=$(mktemp)
if ! echo "ls /brokers/ids" | zkCli.sh -server "$ZK_HOST" > "$OUT" 2>&1; then
  echo "zkCli failed to connect to $ZK_HOST"
  rm -f "$OUT"
  exit 0
fi

# Extract the bracketed list line
LINE=$(grep -o '\[.*\]' "$OUT" | head -n 1 || true)
rm -f "$OUT"

if [ -z "$LINE" ]; then
  echo "No broker IDs found"
  exit 0
fi

# Parse broker IDs from [id1, id2, ...] format
# Remove brackets and split by comma
BROKER_IDS=$(echo "$LINE" | tr -d '[]' | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

if [ -z "$BROKER_IDS" ]; then
  echo "No broker IDs to clean"
  exit 0
fi

# Delete each broker ID
echo "$BROKER_IDS" | while read -r ID; do
  if [ -n "$ID" ]; then
    echo "Deleting /brokers/ids/$ID"
    echo "delete /brokers/ids/$ID" | zkCli.sh -server "$ZK_HOST" 2>&1 | grep -E '(Node does not exist|deleted)' || echo "Cleanup attempt for $ID"
  fi
done

echo "Stale broker cleanup complete."
exit 0
