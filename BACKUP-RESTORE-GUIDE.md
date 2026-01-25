# Event Data Backup & Restore System

## Overview

The application now includes a comprehensive backup/restore system for event data with automatic recovery capabilities. The system is designed for high reliability and migration-friendly architecture.

## Features

✅ **Auto-Restore on Startup** - Automatically restores from `restore/` folder if backups exist  
✅ **Auto-Backup** - Periodic backups every hour (configurable)  
✅ **Backup Rotation** - Maintains maximum 10 backups (configurable)  
✅ **Stale Lock Cleanup** - Automatically removes stale LevelDB locks  
✅ **Migration Friendly** - Portable tar.gz backups  
✅ **Instant Recovery** - Restore in seconds  
✅ **REST API** - Full API for backup operations

## Directory Structure

```
gradio-hugginface-crudAI/
├── storage/
│   └── event_registry_db/     # Active event database
├── backups/                    # Auto-generated backups
│   ├── backup_2024-12-27_120000.tar.gz
│   ├── backup_2024-12-27_130000.tar.gz
│   └── ...
└── restore/                    # Drop backup here for auto-restore
    └── backup_to_restore.tar.gz  # Will auto-restore on startup
```

## Configuration

Environment variables (in docker-compose.yml):

```yaml
AUTO_BACKUP_ENABLED: "true" # Enable/disable auto-backup
AUTO_RESTORE_ENABLED: "true" # Enable/disable auto-restore
AUTO_BACKUP_INTERVAL: "3600000" # Backup interval in ms (1 hour)
MAX_BACKUPS: "10" # Maximum backups to keep
```

## Auto-Restore Process

1. Place backup file in `restore/` folder
2. Restart application: `docker-compose restart app worker`
3. On startup, BackupManager detects backup in `restore/`
4. Automatically extracts and restores to `storage/`
5. Backup is archived after successful restore

## Manual Backup/Restore

### Create Backup via API

```powershell
Invoke-WebRequest -Method POST -Uri "http://localhost:5050/api/backup/create" `
  -ContentType "application/json" `
  -Body '{"label":"manual-backup"}' | Select-Object -ExpandProperty Content
```

### List Backups

```powershell
Invoke-WebRequest -Uri "http://localhost:5050/api/backup/list" |
  Select-Object -ExpandProperty Content | ConvertFrom-Json
```

### Restore from Backup

```powershell
Invoke-WebRequest -Method POST -Uri "http://localhost:5050/api/backup/restore" `
  -ContentType "application/json" `
  -Body '{"backupName":"backup_2024-12-27_120000.tar.gz"}' |
  Select-Object -ExpandProperty Content
```

After restore, restart: `docker-compose restart app worker`

## Migration Workflow

### Export Events from Old System

1. Create backup:

```powershell
Invoke-WebRequest -Method POST -Uri "http://localhost:5050/api/backup/create" `
  -Body '{"label":"migration-export"}'
```

2. Copy backup file from `backups/` folder

### Import to New System

1. Copy backup to new system's `restore/` folder
2. Start/restart application
3. Events automatically restored

## Health Check

Check backup status:

```powershell
Invoke-WebRequest -Uri "http://localhost:5050/api/health" |
  Select-Object -ExpandProperty Content | ConvertFrom-Json |
  Select-Object -ExpandProperty backup
```

Response includes:

- `available`: Backup system status
- `count`: Number of backups
- `latest`: Most recent backup info
- `totalSizeMB`: Total backup storage used

## Troubleshooting

### LevelDB LOCK Error

**Fixed!** The system now:

- Automatically removes stale LOCK files on startup
- Uses shared DB instance between eventBus and eventRegistry
- Properly sequences initialization

### Backup Not Auto-Restoring

1. Check backup file is in `restore/` folder (not `backups/`)
2. Verify file name ends with `.tar.gz`
3. Check logs: `docker-compose logs app | Select-String "BackupManager"`

### Manual Lock Cleanup

If needed, manually remove stale lock:

```powershell
docker-compose exec app rm -f /usr/src/app/storage/event_registry_db/LOCK
docker-compose restart app
```

## Architecture Details

### Initialization Sequence

1. **BackupManager.initialize()**

   - Creates directories
   - Checks for backups in `restore/`
   - Restores if found
   - Cleans stale LOCK files

2. **EventBus.init()**

   - Opens LevelDB
   - Shares DB handle with eventRegistry
   - Starts Kafka consumers

3. **Server Start**
   - Starts HTTP server
   - Starts Kafka monitor
   - Begins handling requests

### Shared DB Architecture

To prevent LOCK conflicts:

- EventBus opens the LevelDB once
- EventRegistry receives shared DB handle
- No duplicate DB instances
- Clean shutdown and startup cycles

### Worker Process

The worker container:

- Runs `npm run worker` (not server.js)
- Does NOT initialize BackupManager
- Does NOT open event DB
- Only processes jobs from Kafka queue

## Best Practices

1. **Regular Backups**: Enable auto-backup (default: enabled)
2. **Before Migrations**: Create manual backup with descriptive label
3. **Test Restores**: Periodically test restore process
4. **Monitor Disk**: Backups rotate automatically but monitor disk space
5. **Clean Restarts**: Use `docker-compose down && docker-compose up -d` for full cleanup

## API Reference

### POST /api/backup/create

Create immediate backup.

**Request:**

```json
{
  "label": "optional-label"
}
```

**Response:**

```json
{
  "success": true,
  "backupPath": "/usr/src/app/backups/backup_2024-12-27_120000.tar.gz",
  "size": 12345
}
```

### GET /api/backup/list

List all available backups.

**Response:**

```json
{
  "success": true,
  "backups": [
    {
      "name": "backup_2024-12-27_120000.tar.gz",
      "path": "/usr/src/app/backups/backup_2024-12-27_120000.tar.gz",
      "size": 12345,
      "sizeMB": "0.01",
      "created": "2024-12-27T12:00:00.000Z"
    }
  ]
}
```

### POST /api/backup/restore

Restore from specific backup.

**Request:**

```json
{
  "backupName": "backup_2024-12-27_120000.tar.gz"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Restore complete. Restart application to apply changes.",
  "restartCommand": "docker-compose restart app worker"
}
```

### GET /api/backup/export-metadata

Export backup metadata for migration planning.

**Response:**

```json
{
  "success": true,
  "metadata": {
    "backupCount": 5,
    "totalSize": 61725,
    "oldestBackup": "2024-12-27T10:00:00.000Z",
    "newestBackup": "2024-12-27T15:00:00.000Z",
    "backups": [...]
  }
}
```

## Data Safety Guarantees

✅ No event data lost during clean restarts  
✅ Named Docker volumes preserve data across container removals  
✅ Auto-backup ensures recovery point every hour  
✅ Backups stored outside container (host-mounted)  
✅ Stale lock cleanup prevents startup failures  
✅ Shared DB prevents data corruption from concurrent access

## Support

For issues or questions:

1. Check logs: `docker-compose logs app`
2. Verify health: `http://localhost:5050/api/health`
3. Review this guide's troubleshooting section
