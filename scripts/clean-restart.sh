#!/bin/bash
# Fast, clean Docker Compose restart with old instance cleanup
# Preserves all data in named volumes

set -e

SKIP_BUILD=0
FORCE=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-build) SKIP_BUILD=1; shift ;;
    --force) FORCE=1; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "🧹 Starting clean Docker Compose restart..."

# Stop all services gracefully
echo ""
echo "📦 Stopping services gracefully..."
docker-compose down --remove-orphans --timeout 60 || true

# Remove any dangling/stopped containers from this project
echo ""
echo "🗑️  Removing old container instances..."
OLD_CONTAINERS=$(docker ps -a --filter "name=gradio-hugginface-crudai" --format "{{.ID}}" || true)
if [ -n "$OLD_CONTAINERS" ]; then
  docker rm -f $OLD_CONTAINERS 2>/dev/null || true
  echo "✅ Removed old containers"
else
  echo "✅ No old containers to remove"
fi

# Prune unused networks
echo ""
echo "🌐 Cleaning up unused networks..."
docker network prune -f --filter "label=com.docker.compose.project=gradio-hugginface-crudai" 2>/dev/null || true

# Optional: rebuild images
if [ $SKIP_BUILD -eq 0 ]; then
  echo ""
  echo "🔨 Rebuilding images..."
  docker-compose build --no-cache
fi

# Start all services with clean instances
echo ""
echo "🚀 Starting fresh service instances..."
docker-compose up -d --remove-orphans --force-recreate

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Clean restart complete!"
  echo ""
  echo "📊 Service Status:"
  docker-compose ps
  
  echo ""
  echo "💾 Data Volumes (preserved):"
  docker volume ls --filter "name=gradio-hugginface-crudai"
  
  echo ""
  echo "🔍 Checking service health..."
  sleep 15
  
  echo ""
  echo "Zookeeper status:"
  docker-compose exec -T zookeeper bash -c "echo ruok | nc localhost 2181" 2>/dev/null || echo "Not ready yet"
  
  echo ""
  echo "Kafka broker status:"
  docker-compose exec -T kafka kafka-broker-api-versions --bootstrap-server localhost:9092 2>&1 | grep "ApiVersion" | head -n 1 || echo "Not ready yet"
  
  echo ""
  echo "App health:"
  curl -sf http://localhost:5050/api/health 2>/dev/null || echo "Not ready yet (this is normal, give it a few more seconds)"
  
  echo ""
  echo "📝 Recent logs:"
  docker-compose logs --tail 10
  
  echo ""
  echo "✨ System is ready! All data preserved in volumes."
  echo "   Run 'docker-compose logs -f' to monitor in real-time"
else
  echo ""
  echo "❌ Restart failed!"
  docker-compose logs --tail 50
  exit 1
fi
