# Smart Startup Features

All startup scripts now include intelligent detection and graceful restart capabilities.

## 🎯 What's New

### Automatic Running Server Detection
When you run the startup script, it checks if services are already running:

```
[!] Orchestration server is already running!

Options:
  1) Stop and restart fresh
  2) Leave running and exit
  3) Restart Kafka only
```

### Three Response Options

#### **Option 1: Restart Fresh** ⚡
```
Gracefully stops existing containers
Removes containers
Starts fresh from scratch
```
- Best for: Resetting state, clearing events
- Time: 60-90 seconds
- No data loss: Events in Kafka persist

#### **Option 2: Leave Running** ✓
```
Exits script, services continue running
Shows current endpoint URLs
No interruption to API clients
```
- Best for: Continuous development
- Time: Immediate
- Use when: You just want to check status

#### **Option 3: Restart Kafka Only** 🔄
```
Stops Kafka and Zookeeper only
Keeps Orchestration server running
Waits 10 seconds for Kafka to be ready
```
- Best for: Kafka restart without app downtime
- Time: 15 seconds
- Use when: Kafka has issues but app is fine

---

## 📋 Startup Flow

```
1. Check Docker running
   ↓
2. Check docker-compose available
   ↓
3. Check if containers already running
   ├─ Yes → Ask user (options 1-3)
   ├─ Option 1 → Stop & restart
   ├─ Option 2 → Exit
   └─ Option 3 → Restart Kafka only
   │
   ↓
4. Create docker-compose.yml (if needed)
   ↓
5. Create Dockerfile (if needed)
   ↓
6. Start all services
   ├─ Zookeeper
   ├─ Kafka (waits for Zookeeper)
   └─ Orchestration Server (waits for Kafka)
   ↓
7. Display running status
   ↓
8. Attach to logs (Ctrl+C to stop)
   ↓
9. On exit → Gracefully stop all services
```

---

## 💡 Common Scenarios

### Scenario 1: First Time Running
```bash
$ ./start-server.sh
[OK] Docker is running
[OK] docker-compose is available
[OK] docker-compose.yml created
[OK] Dockerfile created

Starting Services...
(services start, logs stream)
```

### Scenario 2: Server Already Running, Want to Restart
```bash
$ ./start-server.sh
[OK] Docker is running
[!] Orchestration server is already running!

Options:
  1) Stop and restart fresh
  2) Leave running and exit
  3) Restart Kafka only

Enter choice (1-3): 1

Gracefully stopping existing containers...
[OK] Containers stopped
Removing containers...
[OK] Containers removed

Starting Services...
(fresh start)
```

### Scenario 3: Server Running, Want to Keep It
```bash
$ ./start-server.sh
[OK] Docker is running
[!] Orchestration server is already running!

Options:
  1) Stop and restart fresh
  2) Leave running and exit
  3) Restart Kafka only

Enter choice (1-3): 2

Services already running at:
  Orchestration: http://localhost:5050
  Kafka:         localhost:9092
```

### Scenario 4: Just Restart Kafka
```bash
$ ./start-server.sh
[OK] Docker is running
[!] Orchestration server is already running!

Enter choice (1-3): 3

Restarting Kafka and Zookeeper...
[OK] Kafka and Zookeeper restarted

Waiting for Kafka to be ready (10 seconds)...

Kafka services:
NAME                           STATUS
orchestration-zookeeper-1      running
orchestration-kafka-1          running
orchestration-orchestration-1  running
```

---

## 🛑 Graceful Shutdown

When you press **Ctrl+C** to stop the startup script:

```
^C
========================================
Shutdown in Progress
========================================

Stopping orchestration server... (10 sec timeout)
[OK] Server stopped

Stopping Kafka and Zookeeper... (10 sec timeout)
[OK] Kafka and Zookeeper stopped

All services stopped gracefully
```

- **10-second timeout** allows graceful shutdown
- Container exits cleanly
- No data loss
- Next startup picks up where it left off

---

## ⏱️ Timing

### First Run
- Docker pulls images: 30-60 seconds
- Build orchestration app: 20-30 seconds
- Services start: 20-30 seconds
- **Total: 90-120 seconds**

### Subsequent Runs (no changes)
- Container startup: 10-15 seconds
- **Total: 10-15 seconds**

### Restart with Option 1 (fresh)
- Graceful stop: 5 seconds
- Container removal: 3 seconds
- Fresh start: 60-90 seconds
- **Total: 70-100 seconds**

### Restart with Option 3 (Kafka only)
- Graceful stop: 5 seconds
- Fresh start: 10-15 seconds
- **Total: 15-20 seconds**

---

## 🔍 What the Scripts Check

### Docker Running
```bash
docker ps
# If fails → "Docker is not running"
```

### docker-compose Installed
```bash
docker-compose --version
# If not found → "docker-compose not found"
```

### Containers Already Running
```bash
docker-compose ps | grep "orchestration-orchestration"
# If found → Show options menu
```

### File Existence
```bash
[ ! -f "docker-compose.yml" ]
# If missing → Create from template

[ ! -f "Dockerfile" ]
# If missing → Create from template
```

---

## 🎯 Option Selection Tips

### Choose **Option 1** (Restart) if:
- ✅ You want a fresh start
- ✅ Events have accumulated and you want to clear them
- ✅ Something seems stuck or broken
- ✅ You want to test from a clean state

### Choose **Option 2** (Keep Running) if:
- ✅ Services are working fine
- ✅ You just want to check status
- ✅ You don't want any interruption
- ✅ You're testing against live data

### Choose **Option 3** (Restart Kafka) if:
- ✅ Kafka has issues but app seems OK
- ✅ You want to reset the event stream
- ✅ You need to clear Kafka topics
- ✅ Minimal downtime required

---

## 🛠️ Troubleshooting

### "Container already running" appears but app is broken
- Choose option 1: Restart fresh
- This stops everything and restarts cleanly

### Can't decide which option
- Default to **Option 1** (restart fresh)
- Most reliable recovery method
- Only takes 60-90 seconds

### Need to keep app running while fixing Kafka
- Choose **Option 3** (restart Kafka only)
- App continues serving, Kafka gets restarted
- 15-20 seconds total downtime

### Want to manually check status first
- Press Ctrl+C before choosing option
- Then run: `docker-compose ps`
- Then run startup script again

---

## 📊 Script Comparison

| Feature | Old | New |
|---------|-----|-----|
| Auto-detect running | ❌ No | ✅ Yes |
| Graceful stop | ❌ No | ✅ Yes (10s timeout) |
| Running options menu | ❌ No | ✅ Yes |
| Partial restart (Kafka) | ❌ No | ✅ Yes |
| Keep running option | ❌ No | ✅ Yes |
| Status display | ❌ No | ✅ Yes |

---

## 💾 State Preservation

### When You Choose Option 1 (Restart Fresh)
**Events**
- ✅ Saved in Kafka topics (not deleted)
- ✅ Can query `/api/event-records` after restart
- ✅ Full recovery from Kafka

**Topics**
- ✅ Created automatically on restart
- ✅ Data persists (compacted topics)
- ✅ No data loss

### When You Choose Option 2 (Keep Running)
**Services**
- ✅ Continue running
- ✅ No interruption

### When You Choose Option 3 (Restart Kafka)
**Orchestration App**
- ✅ Continues running
- ✅ Can still query events

**Kafka**
- ⚠️ Topics created fresh
- ⚠️ Recent events may be lost
- ✅ App recovers from restart

---

## 🚀 Pro Tips

### Fastest Restart
```bash
# Option 3: Just restart Kafka (15-20 sec)
# Best for: Testing event flow repeatedly
```

### Cleanest Start
```bash
# Option 1: Full restart (60-90 sec)
# Best for: Final testing, reproducible behavior
```

### Never Stop Development
```bash
# Option 2: Keep running (0 sec)
# Best for: Quick status check, continuous work
```

---

## 🔄 Example Development Workflow

```
Day 1: First startup
$ ./start-server.sh
# First run, everything created and started

During development: Need to test fresh
$ ./start-server.sh
Choose Option 1 (restart fresh)
# Cleans everything, starts fresh (90 sec)

Testing Kafka issues: Restart just Kafka
$ ./start-server.sh
Choose Option 3 (restart Kafka only)
# App keeps running, Kafka restarts (15 sec)

Need to check something: Keep it running
$ ./start-server.sh
Choose Option 2 (leave running)
# Services continue, no interruption (0 sec)
```

---

## 📝 Summary

The new startup scripts are **smart enough to**:
- ✅ Detect if already running
- ✅ Ask what you want to do
- ✅ Gracefully stop existing services
- ✅ Offer targeted restart options
- ✅ Preserve data in Kafka
- ✅ Provide clear status messages

**Just run the script and choose your option!** 🚀
