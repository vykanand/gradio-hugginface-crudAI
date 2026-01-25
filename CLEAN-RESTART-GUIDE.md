# Clean Restart Guide

## Quick Clean Restart

### Using PowerShell (Windows)

```powershell
.\scripts\clean-restart.ps1
```

Or skip image rebuild for faster restart:

```powershell
.\scripts\clean-restart.ps1 -SkipBuild
```

### Using Bash (Linux/Mac)

```bash
./scripts/clean-restart.sh
```

Or skip image rebuild:

```bash
./scripts/clean-restart.sh --skip-build
```

### Manual Clean Restart

```bash
# Stop all services gracefully
docker-compose down --remove-orphans --timeout 60

# Remove any old/dangling containers
docker ps -a --filter "name=gradio-hugginface-crudai" --format "{{.ID}}" | xargs docker rm -f

# Start fresh (preserving all data volumes)
docker-compose up -d --remove-orphans --force-recreate
```

## What Gets Cleaned

✅ **Removed:**

- Old/stopped container instances
- Stale Kafka broker registrations (ephemeral znodes)
- Dangling networks
- Container processes and PIDs
- Runtime caches

✅ **Preserved:**

- All event data in Kafka topics
- Zookeeper state and configuration
- Database data in `app_storage`
- Transaction logs and snapshots
- All named volumes

## Data Volumes

All persistent data is stored in Docker volumes:

- `zk_data` - Zookeeper snapshots
- `zk_datalog` - Zookeeper transaction logs
- `kafka_data` - Kafka topics and offsets
- `app_storage` - Application database and event registry

**These volumes are NEVER deleted during clean restart.**

## Service Startup Order

The compose file ensures proper startup sequence:

1. **Zookeeper** starts first

   - Waits for health check: `srvr` command response
   - 10s startup grace period

2. **ZK-Cleaner** runs once

   - Waits for Zookeeper to be healthy
   - Removes stale broker registrations
   - Exits after cleanup

3. **Kafka** starts after cleaner completes

   - Waits for Zookeeper health check
   - Waits for zk-cleaner completion
   - 40s startup grace period
   - Health check: broker API version query

4. **App & Worker** start in parallel
   - Wait for Kafka health check
   - App has 30s startup grace period
   - Worker has 45s shutdown grace period

## Graceful Shutdown

All services have configured `stop_grace_period` for clean shutdown:

- **Zookeeper**: 30s to flush snapshots
- **Kafka**: 60s to commit offsets and close connections
- **App**: 30s to drain requests and close connections
- **Worker**: 45s to finish processing jobs and commit offsets

## Health Checks

Services report health status:

- **Zookeeper**: `echo srvr | nc localhost 2181`
- **Kafka**: `kafka-broker-api-versions --bootstrap-server localhost:9092`
- **App**: `wget http://localhost:5050/api/health`

View health status:

```bash
docker-compose ps
```

## Fast Startup Tips

1. **Skip image rebuild** when code hasn't changed:

   ```bash
   docker-compose up -d
   ```

2. **Monitor startup** in real-time:

   ```bash
   docker-compose up -d && docker-compose logs -f
   ```

3. **Check specific service**:
   ```bash
   docker-compose logs kafka --tail 50 -f
   ```

## Troubleshooting

### Services won't start

Check dependencies are healthy:

```bash
docker-compose ps
docker logs gradio-hugginface-crudai-zookeeper-1
```

### Kafka NodeExists error

The zk-cleaner should handle this automatically. If it persists:

```bash
docker-compose run --rm zk-cleaner
docker-compose restart kafka
```

### App won't connect

Verify Kafka is healthy:

```bash
docker-compose exec kafka kafka-broker-api-versions --bootstrap-server localhost:9092
```

### Clean everything (DANGER: loses all data)

```bash
# WARNING: This deletes ALL data including events!
docker-compose down -v
rm -rf backups/
```

## Backup Before Destructive Changes

Always backup volumes before major changes:

```bash
mkdir -p backups
docker run --rm -v gradio-hugginface-crudai_kafka_data:/data -v $(pwd)/backups:/backup alpine tar czf /backup/kafka_data_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
docker run --rm -v gradio-hugginface-crudai_zk_data:/data -v $(pwd)/backups:/backup alpine tar czf /backup/zk_data_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
docker run --rm -v gradio-hugginface-crudai_app_storage:/data -v $(pwd)/backups:/backup alpine tar czf /backup/app_storage_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
```

## Production Deployment Notes

For production, consider:

1. **Multi-broker Kafka** for high availability
2. **External Zookeeper ensemble** (3+ nodes)
3. **Volume backups** to external storage
4. **Monitoring** with Prometheus/Grafana
5. **Log aggregation** with ELK or similar
6. **Resource limits** in compose file
7. **Secrets management** instead of env vars

## Performance Tuning

Adjust environment variables in `.env` or compose file:

```env
WORKER_CONCURRENCY=8
KAFKA_SESSION_TIMEOUT_MS=45000
KAFKA_HEARTBEAT_INTERVAL_MS=3000
KAFKA_MAX_POLL_INTERVAL_MS=300000
KAFKA_CONSUMER_FETCH_MAX_BYTES=10485760
```

Restart after changes:

```bash
docker-compose down
docker-compose up -d
```
