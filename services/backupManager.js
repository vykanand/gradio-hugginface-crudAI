/**
 * Backup Manager - Automated backup/restore for event data
 * Supports instant backup, restore, and migration
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class BackupManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || path.join(__dirname, '../storage');
    this.backupDir = config.backupDir || path.join(__dirname, '../backups');
    this.restoreDir = config.restoreDir || path.join(__dirname, '../restore');
    this.autoBackupInterval = config.autoBackupInterval || 3600000; // 1 hour
    this.maxBackups = config.maxBackups || 10;
    this.autoBackupEnabled = config.autoBackupEnabled !== false;
    this.autoRestoreEnabled = config.autoRestoreEnabled !== false;
  }

  async initialize() {
    // Ensure directories exist
    await fs.mkdir(this.storageDir, { recursive: true });
    await fs.mkdir(this.backupDir, { recursive: true });
    await fs.mkdir(this.restoreDir, { recursive: true });

    console.log('[BackupManager] Initialized');
    console.log(`  Storage: ${this.storageDir}`);
    console.log(`  Backups: ${this.backupDir}`);
    console.log(`  Restore: ${this.restoreDir}`);

    // Check for restore folder - auto-restore if backups exist
    if (this.autoRestoreEnabled) {
      await this.checkAndAutoRestore();
    }

    // Clean stale locks before starting
    await this.cleanStaleLocks();

    // Start auto-backup if enabled
    if (this.autoBackupEnabled) {
      this.startAutoBackup();
    }

    return this;
  }

  /**
   * Check restore folder and automatically restore if backups exist
   */
  async checkAndAutoRestore() {
    try {
      const restoreFiles = await fs.readdir(this.restoreDir);
      const backupFiles = restoreFiles.filter(f => f.endsWith('.tar.gz') || f.endsWith('.backup'));
      
      if (backupFiles.length > 0) {
        console.log(`[BackupManager] Found ${backupFiles.length} backup(s) in restore folder`);
        
        // Use the most recent backup
        backupFiles.sort().reverse();
        const latestBackup = backupFiles[0];
        const backupPath = path.join(this.restoreDir, latestBackup);
        
        console.log(`[BackupManager] Auto-restoring from: ${latestBackup}`);
        await this.restore(backupPath);
        
        // Move restored backup to backups folder for archival
        const archivePath = path.join(this.backupDir, `restored_${Date.now()}_${latestBackup}`);
        await fs.rename(backupPath, archivePath);
        console.log(`[BackupManager] ✅ Auto-restore complete. Backup archived to: ${archivePath}`);
        
        return true;
      }
      
      console.log('[BackupManager] No backups found in restore folder, starting fresh');
      return false;
    } catch (err) {
      console.error('[BackupManager] Auto-restore check failed:', err.message);
      return false;
    }
  }

  /**
   * Clean stale lock files that prevent DB from opening
   */
  async cleanStaleLocks() {
    try {
      const eventDbPath = path.join(this.storageDir, 'event_registry_db');
      const lockPath = path.join(eventDbPath, 'LOCK');
      
      try {
        await fs.access(lockPath);
        console.log('[BackupManager] Found stale LOCK file, removing...');
        await fs.unlink(lockPath);
        console.log('[BackupManager] ✅ Stale lock removed');
      } catch (err) {
        // Lock doesn't exist, that's fine
        if (err.code !== 'ENOENT') {
          console.warn('[BackupManager] Lock check warning:', err.message);
        }
      }
    } catch (err) {
      console.error('[BackupManager] Error cleaning locks:', err.message);
    }
  }

  /**
   * Create a full backup of all event data
   */
  async backup(label = '') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `events_backup_${timestamp}${label ? '_' + label : ''}.tar.gz`;
    const backupPath = path.join(this.backupDir, backupName);

    console.log(`[BackupManager] Creating backup: ${backupName}`);

    try {
      // Create tar.gz of storage directory
      const cmd = process.platform === 'win32'
        ? `tar -czf "${backupPath}" -C "${path.dirname(this.storageDir)}" "${path.basename(this.storageDir)}"`
        : `tar -czf "${backupPath}" -C "${path.dirname(this.storageDir)}" "${path.basename(this.storageDir)}"`;
      
      await execAsync(cmd);

      // Get backup size
      const stats = await fs.stat(backupPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      console.log(`[BackupManager] ✅ Backup created: ${backupName} (${sizeMB} MB)`);

      // Rotate old backups
      await this.rotateBackups();

      return {
        success: true,
        path: backupPath,
        name: backupName,
        size: stats.size,
        timestamp: new Date()
      };
    } catch (err) {
      console.error('[BackupManager] Backup failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Restore from a backup file
   */
  async restore(backupPath, options = {}) {
    const { cleanFirst = true, restartRequired = true } = options;

    console.log(`[BackupManager] Restoring from: ${backupPath}`);

    try {
      // Verify backup exists
      await fs.access(backupPath);

      // Clean existing storage if requested
      if (cleanFirst) {
        console.log('[BackupManager] Cleaning existing storage...');
        await this.cleanStorage();
      }

      // Extract backup
      const cmd = process.platform === 'win32'
        ? `tar -xzf "${backupPath}" -C "${path.dirname(this.storageDir)}"`
        : `tar -xzf "${backupPath}" -C "${path.dirname(this.storageDir)}"`;
      
      await execAsync(cmd);

      // Clean any locks from the restored backup
      await this.cleanStaleLocks();

      console.log('[BackupManager] ✅ Restore complete');

      if (restartRequired) {
        console.log('[BackupManager] ⚠️  Note: Application restart may be required for changes to take effect');
      }

      return { success: true, path: backupPath };
    } catch (err) {
      console.error('[BackupManager] Restore failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Clean all storage data (use with caution!)
   */
  async cleanStorage() {
    try {
      const items = await fs.readdir(this.storageDir);
      for (const item of items) {
        const itemPath = path.join(this.storageDir, item);
        const stat = await fs.stat(itemPath);
        if (stat.isDirectory()) {
          await fs.rm(itemPath, { recursive: true, force: true });
        } else {
          await fs.unlink(itemPath);
        }
      }
      console.log('[BackupManager] Storage cleaned');
    } catch (err) {
      console.error('[BackupManager] Clean storage failed:', err.message);
    }
  }

  /**
   * Rotate old backups to maintain max limit
   */
  async rotateBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups = files
        .filter(f => f.startsWith('events_backup_') && f.endsWith('.tar.gz'))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f),
          time: fs.stat(path.join(this.backupDir, f)).then(s => s.mtime)
        }));

      const backupsWithTime = await Promise.all(
        backups.map(async b => ({ ...b, time: await b.time }))
      );

      backupsWithTime.sort((a, b) => b.time - a.time);

      // Remove old backups beyond max limit
      if (backupsWithTime.length > this.maxBackups) {
        const toRemove = backupsWithTime.slice(this.maxBackups);
        for (const backup of toRemove) {
          await fs.unlink(backup.path);
          console.log(`[BackupManager] Rotated old backup: ${backup.name}`);
        }
      }
    } catch (err) {
      console.error('[BackupManager] Backup rotation failed:', err.message);
    }
  }

  /**
   * List all available backups
   */
  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups = [];

      for (const file of files) {
        if (file.endsWith('.tar.gz') || file.endsWith('.backup')) {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.stat(filePath);
          backups.push({
            name: file,
            path: filePath,
            size: stats.size,
            created: stats.mtime,
            sizeMB: (stats.size / (1024 * 1024)).toFixed(2)
          });
        }
      }

      backups.sort((a, b) => b.created - a.created);
      return backups;
    } catch (err) {
      console.error('[BackupManager] List backups failed:', err.message);
      return [];
    }
  }

  /**
   * Start automatic periodic backups
   */
  startAutoBackup() {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
    }

    console.log(`[BackupManager] Auto-backup enabled (interval: ${this.autoBackupInterval / 1000}s)`);

    this.backupTimer = setInterval(async () => {
      console.log('[BackupManager] Running scheduled backup...');
      await this.backup('auto');
    }, this.autoBackupInterval);

    // Don't prevent process exit
    if (this.backupTimer.unref) {
      this.backupTimer.unref();
    }
  }

  /**
   * Stop automatic backups
   */
  stopAutoBackup() {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
      console.log('[BackupManager] Auto-backup stopped');
    }
  }

  /**
   * Export backup metadata for migration
   */
  async exportMetadata() {
    const backups = await this.listBackups();
    const metadata = {
      version: '1.0',
      exported: new Date().toISOString(),
      backups: backups.map(b => ({
        name: b.name,
        size: b.size,
        created: b.created
      })),
      config: {
        maxBackups: this.maxBackups,
        autoBackupInterval: this.autoBackupInterval
      }
    };

    const metadataPath = path.join(this.backupDir, 'backup_metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    return metadata;
  }
}

module.exports = BackupManager;
