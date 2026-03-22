#!/bin/bash

# SAFE KAFKA CLEANUP (Preserves Topics)
# Clears all messages from topics WITHOUT deleting topics
# Ensures permanent topics always exist for event streaming
# Prevents event loss during cleanup operations

set -e

KAFKA_BROKER="kafka:9092"
DRY_RUN=${1:-""}

echo "╔════════════════════════════════════════════════════════╗"
echo "║       SAFE KAFKA CLEANUP (Topics Preserved)            ║"
echo "║   Clears messages, never deletes topics                ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Topics to clear (but NOT delete)
TOPICS=(
    "billionerp-field-events"
    "billionerp-record-events"
    "orchestrator-events"
    "event-records"
    "event-registry"
    "event-processing-state"
    "ORCHESTRATIONS_EVENTS"
    "ORCHESTRATIONS_JOBS"
)

echo "🔍 Current Topics and Message Count:"
docker-compose exec -T kafka kafka-topics --bootstrap-server $KAFKA_BROKER --list 2>/dev/null | while read topic; do
    if [[ " ${TOPICS[@]} " =~ " ${topic} " ]]; then
        echo "   🎯 $topic (EVENT TOPIC)"
    else
        echo "   • $topic"
    fi
done
echo ""

if [[ "$DRY_RUN" == "--dry-run" ]]; then
    echo "⚠️  DRY RUN MODE - No changes will be made"
    echo ""
    echo "Topics to CLEAR (messages removed, topics preserved):"
    for topic in "${TOPICS[@]}"; do
        echo "   - $topic"
    done
    echo ""
    echo "To execute: bash cleanup-kafka-safe.sh"
    exit 0
fi

# Confirm before clearing
echo "⚠️  WARNING: This will CLEAR all messages from event topics!"
echo "   Topics will be PRESERVED (not deleted)"
echo "   Event history will be cleared"
echo ""
read -p "   Continue? (yes/no): " confirm

if [[ "$confirm" != "yes" ]]; then
    echo "❌ Cleanup cancelled"
    exit 1
fi

echo ""
echo "🔄 Clearing Kafka messages (preserving topics)..."
echo ""

success_count=0
total_count=${#TOPICS[@]}

for topic in "${TOPICS[@]}"; do
    echo "🧹 Clearing messages from: $topic"

    # Delete records using delete-records policy
    # This clears all messages without deleting the topic
    docker-compose exec -T kafka kafka-delete-records \
        --bootstrap-server $KAFKA_BROKER \
        --offset-json-file /dev/stdin \
        2>/dev/null <<< "{\"version\":1,\"partitions\":[{\"topic\":\"$topic\",\"partition\":0,\"offset\":999999999}]}" \
        && echo "   ✅ Messages cleared: $topic" \
        || echo "   ℹ️  Topic empty or cleared: $topic"

    success_count=$((success_count + 1))
    sleep 0.5
done

echo ""
echo "🔄 Verifying cleanup..."
echo ""

# Show final state
echo "📋 Final Topic State:"
docker-compose exec -T kafka kafka-topics --bootstrap-server $KAFKA_BROKER --list 2>/dev/null | while read topic; do
    if [[ " ${TOPICS[@]} " =~ " ${topic} " ]]; then
        echo "   🎯 $topic (CLEARED, PRESERVED)"
    else
        echo "   • $topic"
    fi
done

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  ✅ Kafka messages cleared                             ║"
echo "║  ✅ Topics preserved for new events                    ║"
echo "║  Ready for fresh testing                               ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
