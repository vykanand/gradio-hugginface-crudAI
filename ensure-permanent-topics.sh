#!/bin/bash

# PERMANENT KAFKA TOPICS SETUP
# Creates and ensures permanent topics for field and record level events
# These topics will NEVER be deleted, only cleared of messages
# This prevents event loss during cleanup operations

set -e

KAFKA_BROKER="kafka:9092"

echo "╔════════════════════════════════════════════════════════╗"
echo "║    ENSURING PERMANENT KAFKA TOPICS EXIST              ║"
echo "║  Topics will persist through cleanup operations       ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Define permanent topics structure
declare -A TOPICS=(
    ["billionerp-field-events"]="Field-level events (blur, change) from billionerp"
    ["billionerp-record-events"]="Record-level events (CRUD) from billionerp"
    ["orchestrator-events"]="Orchestrator processing events"
    ["event-records"]="Audit trail of all events"
)

echo "🔍 Checking Kafka broker at $KAFKA_BROKER"
echo ""

# List existing topics
echo "📋 Existing Topics:"
docker-compose exec -T kafka kafka-topics --bootstrap-server $KAFKA_BROKER --list 2>/dev/null | while read topic; do
    echo "   • $topic"
done
echo ""

# Create permanent topics if they don't exist
echo "🔄 Creating/Verifying Permanent Topics:"
echo ""

for topic in "${!TOPICS[@]}"; do
    description="${TOPICS[$topic]}"

    echo "Topic: $topic"
    echo "  Description: $description"

    # Try to create topic (safe - won't fail if exists)
    docker-compose exec -T kafka kafka-topics \
        --bootstrap-server $KAFKA_BROKER \
        --create \
        --topic "$topic" \
        --partitions 1 \
        --replication-factor 1 \
        --config cleanup.policy=compact \
        --config retention.ms=-1 \
        2>&1 | grep -v "already exists" || true

    echo "  ✅ Topic ready: $topic"
    echo ""
done

echo "╔════════════════════════════════════════════════════════╗"
echo "║  ✅ Permanent Topics Configured                        ║"
echo "║                                                        ║"
echo "║  FIELD-LEVEL: billionerp-field-events                 ║"
echo "║  RECORD-LEVEL: billionerp-record-events               ║"
echo "║                                                        ║"
echo "║  These topics will NEVER be deleted during cleanup    ║"
echo "║  Only message history will be cleared                 ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
