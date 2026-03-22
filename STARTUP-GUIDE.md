# Orchestration Server Startup Guide

This guide explains how to start the Orchestration Server with all its dependencies (Kafka, Zookeeper, etc.) using the provided startup scripts.

## Quick Start

### Option 1: Windows (Command Prompt)
```batch
start-server.bat
```

### Option 2: Windows (PowerShell)
```powershell
.\start-server.ps1
```

### Option 3: macOS/Linux/WSL
```bash
chmod +x start-server.sh
./start-server.sh
```

## What the Startup Script Does

1. ✅ **Checks Docker** - Verifies Docker Desktop is running
2. ✅ **Checks docker-compose** - Verifies docker-compose is installed
3. ✅ **Creates docker-compose.yml** - If not already present (auto-generates)
4. ✅ **Creates Dockerfile** - If not already present (auto-generates)
5. ✅ **Stops existing containers** - Cleans up any previous instances
6. ✅ **Starts all services**:
   - Zookeeper (port 2181)
   - Kafka (port 9092)
   - Orchestration Server (port 5050)

## Prerequisites

### Windows
- Docker Desktop installed and running
- PowerShell or Command Prompt
- Git Bash (optional, for bash script)

### macOS/Linux
- Docker installed and running
- docker-compose installed
- Bash shell

## Services & Endpoints

Once started, you'll have access to:

### Services
| Service | URL | Port |
|---------|-----|------|
| Zookeeper | localhost:2181 | 2181 |
| Kafka | localhost:9092 | 9092 |
| Orchestration | http://localhost:5050 | 5050 |

### API Endpoints

**Publish Event**
```bash
curl -X POST http://localhost:5050/api/orchestrator/event \
  -H 'Content-Type: application/json' \
  -d '{
    "event": "delivery:created",
    "module": "delivery",
    "detail": {
      "id": "12345",
      "status": "pending"
    }
  }'
```

**List Events**
```bash
curl http://localhost:5050/api/event-records
```

**View Dead Letter Queue**
```bash
curl http://localhost:5050/api/events/dlq
```

**View Event Registry**
```bash
curl http://localhost:5050/api/event-registry
```

**Stream Events (SSE)**
```bash
curl http://localhost:5050/events/stream
```

## Verifying Startup

### Check Server Health
```bash
curl http://localhost:5050/api/event-registry
```

Should return a JSON response with event bindings.

### Check Kafka Topics
From another terminal:
```bash
# Inside the Docker container
docker exec -it orchestration-kafka kafka-topics.sh \
  --list --bootstrap-server localhost:9092

# Should show:
# event-records
# event-dlq
# event-registry
# event-processing-state
# orchestrator-events
```

### View Kafka Messages
```bash
docker exec -it orchestration-kafka kafka-console-consumer.sh \
  --topic event-records \
  --from-beginning \
  --bootstrap-server localhost:9092
```

## Logs

### View All Logs
```bash
docker-compose logs -f
```

### View Orchestration Server Logs Only
```bash
docker-compose logs -f orchestration
```

### View Kafka Logs
```bash
docker-compose logs -f kafka
```

## Environment Variables

The startup script uses these environment variables in the orchestration server:

```
NODE_ENV=development
KAFKA_BROKERS=kafka:9092
KAFKA_GROUP_ID=orchestrator-group
KAFKA_PERSISTENCE_ENABLED=true
LEVELDB_PERSISTENCE_ENABLED=false
EVENT_RECORDS_TOPIC=event-records
EVENT_DLQ_TOPIC=event-dlq
EVENT_REGISTRY_TOPIC=event-registry
EVENT_STATE_TOPIC=event-processing-state
```

To change these, edit `docker-compose.yml` before running the startup script.

## Stopping Services

### Stop All Services
```bash
# In the terminal where docker-compose is running:
Press Ctrl+C

# Or from another terminal:
docker-compose down
```

### Stop Specific Service
```bash
docker-compose stop orchestration
docker-compose stop kafka
docker-compose stop zookeeper
```

## Troubleshooting

### "Docker is not running"
- Start Docker Desktop (Windows/macOS)
- Or start Docker daemon on Linux: `systemctl start docker`

### "Connection timeout" to Kafka
- Kafka takes 10-30 seconds to start
- Check Kafka logs: `docker-compose logs kafka`
- Wait a moment and try again

### "Port already in use"
- Another application is using port 5050, 9092, or 2181
- Kill the existing process or use different ports
- Edit `docker-compose.yml` and change ports:
  ```yaml
  ports:
    - "5051:5050"  # Changed from 5050
  ```

### Server crashes on startup
- Check logs: `docker-compose logs orchestration`
- Ensure Node.js dependencies installed: `npm install`
- Restart: `docker-compose restart orchestration`

### Kafka topics not created
- Check Kafka is running: `docker-compose logs kafka`
- The topics are auto-created by the server on startup
- Wait 10+ seconds for the server to initialize
- Verify with: `docker exec orchestration kafka-topics.sh --list`

## Performance Notes

- **Initial startup**: 30-60 seconds (Docker pulls images, builds, starts services)
- **Kafka initialization**: 10-20 seconds
- **Orchestration server ready**: 5-10 seconds after Kafka
- **Total time to ready**: ~60-90 seconds on first run, ~10-15 seconds on subsequent runs

## Customization

### Change Ports
Edit `docker-compose.yml` before starting:
```yaml
orchestration:
  ports:
    - "5051:5050"  # Changed from 5050:5050
```

### Change Kafka Configuration
Edit `docker-compose.yml` environment section:
```yaml
kafka:
  environment:
    KAFKA_LOG_RETENTION_HOURS: 24  # Changed from 168
    KAFKA_NUM_PARTITIONS: 6         # Add custom settings
```

### Add More Services
Edit `docker-compose.yml` and add additional services (databases, caches, etc.)

## Security Notes (Development Only)

The startup script is configured for **local development** with:
- No authentication required
- All ports exposed
- No TLS/SSL encryption

**For production**, use:
- SASL authentication for Kafka
- TLS certificates
- Network isolation
- Secrets management

See `CLOUD-DEPLOYMENT-SETUP.md` for production configurations.

## Next Steps

After startup, refer to:
1. **KAFKA-MIGRATION.md** - Implementing dual-write persistence
2. **CLOUD-DEPLOYMENT-SETUP.md** - Deploying to production
3. **IMPLEMENTATION-SUMMARY.md** - Understanding the architecture

## Support

For issues:
1. Check the logs: `docker-compose logs`
2. Verify Docker is running: `docker ps`
3. Verify Kafka connectivity: `docker-compose exec kafka kafka-broker-api-versions.sh --bootstrap-server localhost:9092`
4. Check the troubleshooting section above

## Common Commands Reference

```bash
# View all containers
docker-compose ps

# View logs (follow in real-time)
docker-compose logs -f

# Restart a service
docker-compose restart orchestration

# Rebuild and restart
docker-compose up --build

# Remove containers and volumes
docker-compose down -v

# Interactive shell in container
docker-compose exec orchestration sh
docker-compose exec kafka bash

# Check Kafka is healthy
docker-compose exec kafka kafka-broker-api-versions.sh --bootstrap-server localhost:9092

# List all topics
docker-compose exec kafka kafka-topics.sh --list --bootstrap-server localhost:9092

# View topic details
docker-compose exec kafka kafka-topics.sh --describe --topic event-records --bootstrap-server localhost:9092
```
