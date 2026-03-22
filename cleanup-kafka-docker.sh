#!/bin/bash

# KAFKA CLEANUP SCRIPT (Docker-based)
# Clears all Kafka event topics to reset the event system
# Usage: ./cleanup-kafka-docker.sh [--dry-run]

set -e

KAFKA_BROKER="kafka:9092"
DRY_RUN=${1:-""}

echo "╔════════════════════════════════════════════════════════╗"
echo "║         KAFKA EVENT SYSTEM CLEANUP (Docker)            ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Topics to clean
TOPICS=(
    "orchestrator-events"
    "event-records"
    "event-registry"
    "event-processing-state"
    "ORCHESTRATIONS_EVENTS"
    "ORCHESTRATIONS_JOBS"
)

echo "🔍 Connected to Kafka inside Docker container"
echo ""

# List all topics
echo "📋 Current Kafka Topics:"
docker-compose exec -T kafka kafka-topics --bootstrap-server $KAFKA_BROKER --list | while read topic; do
    if [[ " ${TOPICS[@]} " =~ " ${topic} " ]]; then
        echo "   🎯 $topic"
    else
        echo "   • $topic"
    fi
done
echo ""

if [[ "$DRY_RUN" == "--dry-run" ]]; then
    echo "⚠️  DRY RUN MODE - No changes will be made"
    echo ""
    echo "Topics to DELETE and RECREATE:"
    for topic in "${TOPICS[@]}"; do
        echo "   - $topic"
    done
    echo ""
    echo "To execute: ./cleanup-kafka-docker.sh"
    exit 0
fi

# Confirm before deleting
echo "⚠️  WARNING: This will DELETE all events from Kafka!"
echo "   All event history will be permanently lost."
echo ""
read -p "   Continue? (yes/no): " confirm

if [[ "$confirm" != "yes" ]]; then
    echo "❌ Cleanup cancelled"
    exit 1
fi

echo ""
echo "🔄 Cleaning up Kafka topics..."
echo ""

success_count=0
total_count=${#TOPICS[@]}

for topic in "${TOPICS[@]}"; do
    echo "🗑️  Deleting: $topic"

    # Try to delete the topic
    if docker-compose exec -T kafka kafka-topics --bootstrap-server $KAFKA_BROKER --delete --topic "$topic" 2>/dev/null; then
        echo "   ✅ Topic deleted: $topic"
        success_count=$((success_count + 1))
    else
        # Topic might not exist, that's okay
        echo "   ℹ️  Topic doesn't exist or already deleted: $topic"
        success_count=$((success_count + 1))
    fi

    # Wait a bit for deletion to propagate
    sleep 1
done

echo ""
echo "🔄 Topics cleared. Event system will auto-create on first use."
echo ""

# Show final status
echo "📋 Final Kafka Topics:"
docker-compose exec -T kafka kafka-topics --bootstrap-server $KAFKA_BROKER --list 2>/dev/null | while read topic; do
    if [[ " ${TOPICS[@]} " =~ " ${topic} " ]]; then
        echo "   🎯 $topic (REMAINING - will be recreated on use)"
    else
        echo "   • $topic"
    fi
done

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  ✅ Kafka event system cleared                         ║"
echo "║  Ready for fresh testing                               ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
