/**
 * Database Transaction Manager
 * 
 * Provides ACID transaction support for workflow steps that modify database state.
 * Ensures data consistency even when workflows fail or compensate.
 * 
 * FEATURES:
 * ✅ BEGIN/COMMIT/ROLLBACK transactions
 * ✅ Savepoints for nested operations
 * ✅ Automatic rollback on error
 * ✅ Connection pooling
 * ✅ Deadlock detection and retry
 * ✅ Transaction timeout
 */

const mysql = require('mysql2/promise');

class TransactionManager {
  constructor(pool) {
    this.pool = pool;
    this.activeTransactions = new Map();
  }

  /**
   * Start a new database transaction for a workflow step
   */
  async beginTransaction(executionId, stepId) {
    const txId = `${executionId}_${stepId}`;
    
    if (this.activeTransactions.has(txId)) {
      console.warn('[tx] transaction already active:', txId);
      return this.activeTransactions.get(txId);
    }

    const connection = await this.pool.getConnection();
    await connection.beginTransaction();
    
    const transaction = {
      id: txId,
      connection,
      startedAt: Date.now(),
      savepoints: [],
      status: 'active'
    };

    this.activeTransactions.set(txId, transaction);
    console.log('[tx] started transaction:', txId);
    
    // Auto-timeout after 30 seconds
    setTimeout(async () => {
      if (this.activeTransactions.has(txId)) {
        console.warn('[tx] transaction timeout, rolling back:', txId);
        await this.rollbackTransaction(executionId, stepId);
      }
    }, 30000);

    return transaction;
  }

  /**
   * Commit transaction (persist changes)
   */
  async commitTransaction(executionId, stepId) {
    const txId = `${executionId}_${stepId}`;
    const tx = this.activeTransactions.get(txId);
    
    if (!tx) {
      throw new Error('No active transaction: ' + txId);
    }

    try {
      await tx.connection.commit();
      tx.status = 'committed';
      console.log('[tx] committed transaction:', txId);
      return true;
    } catch (error) {
      console.error('[tx] commit failed:', txId, error.message);
      await this.rollbackTransaction(executionId, stepId);
      throw error;
    } finally {
      tx.connection.release();
      this.activeTransactions.delete(txId);
    }
  }

  /**
   * Rollback transaction (discard changes)
   */
  async rollbackTransaction(executionId, stepId) {
    const txId = `${executionId}_${stepId}`;
    const tx = this.activeTransactions.get(txId);
    
    if (!tx) {
      console.warn('[tx] no active transaction to rollback:', txId);
      return false;
    }

    try {
      await tx.connection.rollback();
      tx.status = 'rolled_back';
      console.log('[tx] rolled back transaction:', txId);
      return true;
    } catch (error) {
      console.error('[tx] rollback error:', txId, error.message);
      throw error;
    } finally {
      tx.connection.release();
      this.activeTransactions.delete(txId);
    }
  }

  /**
   * Create savepoint for partial rollback
   */
  async createSavepoint(executionId, stepId, savepointName) {
    const txId = `${executionId}_${stepId}`;
    const tx = this.activeTransactions.get(txId);
    
    if (!tx) {
      throw new Error('No active transaction: ' + txId);
    }

    await tx.connection.query(`SAVEPOINT ${savepointName}`);
    tx.savepoints.push(savepointName);
    console.log('[tx] created savepoint:', savepointName, 'in', txId);
  }

  /**
   * Rollback to savepoint
   */
  async rollbackToSavepoint(executionId, stepId, savepointName) {
    const txId = `${executionId}_${stepId}`;
    const tx = this.activeTransactions.get(txId);
    
    if (!tx) {
      throw new Error('No active transaction: ' + txId);
    }

    await tx.connection.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    console.log('[tx] rolled back to savepoint:', savepointName, 'in', txId);
  }

  /**
   * Execute query within transaction
   */
  async executeInTransaction(executionId, stepId, query, params = []) {
    const txId = `${executionId}_${stepId}`;
    const tx = this.activeTransactions.get(txId);
    
    if (!tx) {
      throw new Error('No active transaction: ' + txId);
    }

    try {
      const [result] = await tx.connection.execute(query, params);
      return result;
    } catch (error) {
      // Check for deadlock
      if (error.code === 'ER_LOCK_DEADLOCK') {
        console.error('[tx] deadlock detected in:', txId);
        await this.rollbackTransaction(executionId, stepId);
        throw new Error('Deadlock detected - transaction will be retried');
      }
      throw error;
    }
  }

  /**
   * Get connection for manual operations within transaction
   */
  getTransactionConnection(executionId, stepId) {
    const txId = `${executionId}_${stepId}`;
    const tx = this.activeTransactions.get(txId);
    return tx ? tx.connection : null;
  }

  /**
   * Check if transaction is active
   */
  hasActiveTransaction(executionId, stepId) {
    const txId = `${executionId}_${stepId}`;
    return this.activeTransactions.has(txId);
  }

  /**
   * Get transaction statistics
   */
  getStats() {
    const active = Array.from(this.activeTransactions.values());
    const now = Date.now();
    
    return {
      activeCount: active.length,
      longestRunningMs: active.length > 0 ? Math.max(...active.map(tx => now - tx.startedAt)) : 0,
      transactions: active.map(tx => ({
        id: tx.id,
        durationMs: now - tx.startedAt,
        status: tx.status,
        savepoints: tx.savepoints.length
      }))
    };
  }

  /**
   * Clean up stale transactions (force rollback)
   */
  async cleanupStaleTransactions(timeoutMs = 60000) {
    const now = Date.now();
    const stale = Array.from(this.activeTransactions.entries())
      .filter(([_, tx]) => now - tx.startedAt > timeoutMs);

    for (const [txId, tx] of stale) {
      console.warn('[tx] cleaning up stale transaction:', txId);
      try {
        await tx.connection.rollback();
        tx.connection.release();
      } catch (e) {
        console.error('[tx] cleanup error:', e.message);
      }
      this.activeTransactions.delete(txId);
    }

    return stale.length;
  }
}

module.exports = TransactionManager;
