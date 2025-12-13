const mysql = require('mysql2/promise');

module.exports = {
  // Execute using a provided connection (for transactional flows)
  async execWithConnection(connection, action, resource, params) {
    // resource is table name, simple CRUD mapping
    try {
      if (action === 'query') {
        const [rows] = await connection.query(`SELECT * FROM \`${resource}\``);
        return { success: true, data: rows };
      }
      if (action === 'create') {
        const record = params.record || {};
        const keys = Object.keys(record);
        const vals = keys.map(k => record[k]);
        const placeholders = keys.map(() => '?').join(',');
        const sql = `INSERT INTO \`${resource}\` (${keys.map(k=>`\`${k}\``).join(',')}) VALUES (${placeholders})`;
        const [res] = await connection.execute(sql, vals);
        return { success: true, data: { insertId: res.insertId } };
      }
      if (action === 'update') {
        const { filter, patch } = params;
        const setKeys = Object.keys(patch || {});
        const setClause = setKeys.map(k => `\`${k}\` = ?`).join(', ');
        const vals = setKeys.map(k => patch[k]);
        const whereKeys = Object.keys(filter || {});
        const whereClause = whereKeys.map(k => `\`${k}\` = ?`).join(' AND ');
        const whereVals = whereKeys.map(k => filter[k]);
        const sql = `UPDATE \`${resource}\` SET ${setClause} WHERE ${whereClause}`;
        const [res] = await connection.execute(sql, vals.concat(whereVals));
        return { success: true, data: { affectedRows: res.affectedRows } };
      }
      if (action === 'delete') {
        const { filter } = params;
        const whereKeys = Object.keys(filter || {});
        const whereClause = whereKeys.map(k => `\`${k}\` = ?`).join(' AND ');
        const whereVals = whereKeys.map(k => filter[k]);
        const sql = `DELETE FROM \`${resource}\` WHERE ${whereClause}`;
        const [res] = await connection.execute(sql, whereVals);
        return { success: true, data: { affectedRows: res.affectedRows } };
      }
      return { success: false, error: 'unknown action' };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  },

  // Non-transactional convenience (uses pool provided externally)
  async exec(action, resource, params, pool) {
    try {
      if (!pool) throw new Error('No DB pool provided');
      const conn = await pool.getConnection();
      try {
        const res = await this.execWithConnection(conn, action, resource, params);
        return res;
      } finally {
        conn.release();
      }
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  }
};
