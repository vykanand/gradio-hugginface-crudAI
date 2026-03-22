# Startup Files Summary

## 🚀 Quick Start

Choose your operating system and run the corresponding startup script:

### Windows (Command Prompt)
```cmd
cd C:\dev\gradio-hugginface-crudAI
start-server.bat
```

### Windows (PowerShell)
```powershell
cd C:\dev\gradio-hugginface-crudAI
.\start-server.ps1
```

### macOS / Linux / WSL
```bash
cd /c/dev/gradio-hugginface-crudAI
./start-server.sh
```

## 📋 Files Created

### Startup Scripts (Choose One)

| File | OS | How to Run | Size |
|------|----|-----------|----|
| **start-server.bat** | Windows (CMD) | `start-server.bat` | 4.5 KB |
| **start-server.ps1** | Windows (PowerShell) | `.\start-server.ps1` | 4.7 KB |
| **start-server.sh** | macOS/Linux/WSL | `./start-server.sh` | 3.9 KB |

### Documentation

| File | Purpose |
|------|---------|
| **STARTUP-GUIDE.md** | Complete guide to using startup scripts |
| **STARTUP-FILES-SUMMARY.md** | This file - quick overview |
| **KAFKA-MIGRATION.md** | 5-phase migration guide with code |
| **CLOUD-DEPLOYMENT-SETUP.md** | Production deployment configs |
| **IMPLEMENTATION-SUMMARY.md** | Architecture overview |

## ⚡ What Happens When You Run the Script

```
1. ✅ Check Docker is running
   └─ If not: Error message, exits

2. ✅ Check docker-compose installed
   └─ If not: Error message, exits

3. ✅ Create docker-compose.yml
   └─ If exists: Reuses existing file

4. ✅ Create Dockerfile
   └─ If exists: Reuses existing file

5. ✅ Stop any existing containers
   └─ Cleans up from previous runs

6. ✅ Start all services
   ├─ Zookeeper (port 2181)
   ├─ Kafka (port 9092)
   ├─ Kafka auto-creates 4 compacted topics
   └─ Orchestration Server (port 5050)

7. ✅ Display status and endpoints
   └─ Server ready in ~30-90 seconds
```

## 🎯 Expected Output

When startup is successful, you'll see:

```
========================================
Starting Kafka and Orchestration Server
========================================

[+] Running 4/4
 ✔ Network orchestration_default  Created                      0.0s
 ✔ Container orchestration-zookeeper-1  Created               0.2s
 ✔ Container orchestration-kafka-1  Created                   0.2s
 ✔ Container orchestration-orchestration-1  Created           0.3s

Attaching to orchestration-zookeeper-1, orchestration-kafka-1, ...

[2026-03-21T14:00:00.000Z] [kafkaAdmin] Connected to Kafka cluster
[2026-03-21T14:00:01.000Z] [kafkaAdmin] ✓ Topic 'event-records' created
[2026-03-21T14:00:01.000Z] [kafkaAdmin] ✓ Topic 'event-dlq' created
[2026-03-21T14:00:01.000Z] [kafkaAdmin] ✓ Topic 'event-registry' created
[2026-03-21T14:00:01.000Z] [kafkaAdmin] ✓ Topic 'event-processing-state' created

Server is running on http://localhost:5050

========================================
Startup Complete
========================================

Services:
  Kafka:            localhost:9092
  Zookeeper:        localhost:2181
  Orchestration:    http://localhost:5050

API Endpoints:
  POST /api/orchestrator/event     - Publish event
  GET  /api/event-records          - List events
  GET  /api/events/dlq             - Dead letter queue
  GET  /api/event-registry         - Event registry
  SSE  /events/stream              - Event stream

Press Ctrl+C to stop all services
```

## 📊 Resource Requirements

| Service | Memory | CPU | Disk |
|---------|--------|-----|------|
| Zookeeper | ~256 MB | 1 core | ~100 MB |
| Kafka | ~512 MB | 1 core | ~500 MB |
| Node.js App | ~200 MB | 1 core | ~100 MB |
| **Total** | **~1 GB** | **3 cores** | **~700 MB** |

## 🔌 Network Ports

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| Zookeeper | 2181 | TCP | Kafka coordination |
| Kafka Broker | 9092 | TCP | Event streaming |
| Orchestration | 5050 | HTTP/SSE | REST API + Events |

**Make sure these ports are available before starting!**

## ✅ Verification Checklist

After running the startup script, verify everything works:

```bash
# Check server is responding
curl http://localhost:5050/api/event-registry

# Check Kafka topics exist
docker-compose exec kafka kafka-topics.sh --list --bootstrap-server localhost:9092

# Send test event
curl -X POST http://localhost:5050/api/orchestrator/event \
  -H 'Content-Type: application/json' \
  -d '{"event":"test:event","module":"test","detail":{}}'

# View event was stored
curl http://localhost:5050/api/event-records

# Watch events stream (Ctrl+C to stop)
curl http://localhost:5050/events/stream
```

## 🛑 Stopping Services

### From the Terminal Running docker-compose
```bash
Press Ctrl+C
```

### From Another Terminal
```bash
docker-compose down
```

### Stop without removing containers
```bash
docker-compose stop
```

### Remove all containers and data
```bash
docker-compose down -v
```

## 🐛 Troubleshooting

### "Docker is not running"
**Windows**: Open Docker Desktop from Start Menu
**Mac**: Open Docker from Applications
**Linux**: `sudo systemctl start docker`

### "Port 5050 already in use"
```bash
# Find what's using the port
lsof -i :5050          # macOS/Linux
netstat -ano | findstr 5050  # Windows

# Either stop that process, or change the port in docker-compose.yml:
# Change "5050:5050" to "5051:5050"
```

### Kafka connection timeout
- Kafka takes 10-30 seconds to start
- Wait longer before testing
- Check logs: `docker-compose logs kafka`

### Server won't start
```bash
# Check logs
docker-compose logs orchestration

# Rebuild containers
docker-compose up --build

# Clear everything and restart fresh
docker-compose down -v
docker-compose up --build
```

### Containers running but not responding
```bash
# Verify containers are running
docker-compose ps

# Restart stuck containers
docker-compose restart

# Check container health
docker-compose logs

# Restart from scratch
docker-compose down -v
./start-server.bat  # or .ps1 or .sh
```

## 📚 Next Steps

1. **Test Kafka Persistence** (5 minutes)
   - Run startup script
   - POST an event to `/api/orchestrator/event`
   - Verify it appears in `/api/event-records`

2. **Read STARTUP-GUIDE.md** (10 minutes)
   - Detailed commands and API examples
   - How to monitor logs
   - Performance notes

3. **Implement Phase 2** (2-3 hours)
   - See KAFKA-MIGRATION.md for DualWriter pattern
   - Add Kafka + LevelDB dual-write persistence
   - Test with both backends enabled

4. **Cloud Deployment** (Weeks 2-6)
   - Follow timeline in KAFKA-MIGRATION.md
   - Deploy to Railway, Docker, Kubernetes
   - Monitor Kafka metrics

## 🎓 Key Concepts

### Kafka Topics (Auto-Created)
- **event-records**: All event records (audit trail)
- **event-dlq**: Dead letter queue (failed events)
- **event-registry**: Module registry & event bindings
- **event-processing-state**: Deduplication tracking
- **orchestrator-events**: Legacy event distribution (existing)

### All topics use **cleanup.policy=compact** for efficient storage

### Server Endpoints
```
POST   /api/orchestrator/event      # Publish event
GET    /api/event-records           # List all events
GET    /api/event-records?module=X  # Filter by module
DELETE /api/event-records/{id}      # Delete event
GET    /api/events/pending          # Pending sends
GET    /api/events/dlq              # Dead letter queue
POST   /api/events/requeue/{id}     # Retry failed event
GET    /api/event-registry          # Event discovery
SSE    /events/stream               # Real-time stream
```

## 💡 Pro Tips

1. **Keep logs running in background**
   ```bash
   docker-compose logs -f &
   ```

2. **Monitor Kafka topics**
   ```bash
   watch -n 1 'docker-compose exec kafka kafka-topics.sh --describe --topic event-records --bootstrap-server localhost:9092'
   ```

3. **Test event throughput**
   ```bash
   for i in {1..100}; do
     curl -X POST http://localhost:5050/api/orchestrator/event \
       -H 'Content-Type: application/json' \
       -d "{\"event\":\"test:event\",\"module\":\"test\",\"detail\":{\"id\":$i}}"
   done
   ```

4. **Clear Kafka topics (development only)**
   ```bash
   docker-compose exec kafka kafka-topics.sh \
     --delete \
     --topic event-records \
     --bootstrap-server localhost:9092
   ```

## 📞 Support

For issues:
1. Check logs: `docker-compose logs`
2. Verify services running: `docker-compose ps`
3. Read STARTUP-GUIDE.md for detailed troubleshooting
4. Check KAFKA-MIGRATION.md for architecture details

## 📝 Summary

| What | How | Time |
|------|-----|------|
| Start everything | Run startup script | 60-90 sec |
| Verify working | curl http://localhost:5050/api/event-registry | 1 sec |
| Stop everything | Press Ctrl+C or `docker-compose down` | 10 sec |
| View logs | `docker-compose logs -f` | Continuous |
| Rebuild | `docker-compose up --build` | 2-3 min |

## 🚀 You're Ready!

The startup scripts are production-grade and will:
- ✅ Create all necessary files automatically
- ✅ Start Kafka + Zookeeper + Orchestration
- ✅ Create all 4 required Kafka topics
- ✅ Initialize the event persistence layer
- ✅ Provide real-time status updates

Just run the script and enjoy! 🎉
