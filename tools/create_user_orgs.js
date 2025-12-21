/*
Dynamic safe DDL runner for creating `user_organizations` and adding FKs.
Usage:
  1) Install dependencies:
     npm install mysql2
  2) Run (dry-run first):
     node tools/create_user_orgs.js --host=localhost --user=root --password=secret --database=mydb --dry-run
  3) Run for real (without --dry-run):
     node tools/create_user_orgs.js --host=localhost --user=root --password=secret --database=mydb

What it does:
 - Inspects INFORMATION_SCHEMA for referenced tables/column types
 - Builds a CREATE TABLE IF NOT EXISTS using matching parent types for `user_id`, `organization_id`, `active_role_id`, `active_group_id`
 - Executes CREATE TABLE (or prints in dry-run)
 - Adds FK constraints only when the referenced table/column exists and when the constraint isn't already present
 - Runs each DDL step sequentially with detailed logs and continues on non-fatal errors

Note: Run using an account with CREATE/ALTER privileges. Review statements in dry-run before executing.
*/

const mysql = require('mysql2/promise');
const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs');

// Try to source DB config from command-line, env, or repo config/database.json
const cli = {
  host: argv.host,
  port: argv.port,
  user: argv.user,
  password: argv.password || argv.pass,
  database: argv.database || argv.db,
  dryRun: !!argv['dry-run'] || !!argv.dryRun || false,
  configPath: argv.config || 'config/database.json'
};

let cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || null,
  dryRun: cli.dryRun
};

// If repo config exists and no CLI/database provided, read it
try {
  if ((!cli.database) && fs.existsSync(cli.configPath)) {
    const confRaw = fs.readFileSync(cli.configPath, 'utf8');
    const conf = JSON.parse(confRaw);
    const active = conf.activeConfig || Object.keys(conf.configurations || {})[0];
    const selected = (conf.configurations && conf.configurations[active]) || null;
    if (selected) {
      cfg.host = selected.host || cfg.host;
      cfg.port = selected.port || cfg.port;
      cfg.user = selected.user || cfg.user;
      cfg.password = selected.password || cfg.password;
      cfg.database = selected.database || cfg.database;
      console.log(`Using DB config from ${cli.configPath} (profile: ${active})`);
    }
  }
} catch (e) {
  // ignore parse errors and continue with env/cli
}

// CLI overrides
if (cli.host) cfg.host = cli.host;
if (cli.port) cfg.port = cli.port;
if (cli.user) cfg.user = cli.user;
if (cli.password) cfg.password = cli.password;
if (cli.database) cfg.database = cli.database;

if (!cfg.database) {
  console.error('Missing database name. Provide --database or set config/database.json or DB_NAME env.');
  process.exit(1);
}

(async function main() {
  let conn;
  try {
    conn = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      multipleStatements: false
    });

    console.log(`Connected to ${cfg.host}:${cfg.port}/${cfg.database} as ${cfg.user}`);

    const refs = {
      users: 'users',
      organizations: 'organizations',
      roles: 'roles',
      groups: 'groups'
    };

    async function tableExists(table) {
      const [rows] = await conn.execute(
        `SELECT COUNT(*) as c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [cfg.database, table]
      );
      return rows[0].c > 0;
    }

    async function columnType(table, column) {
      const [rows] = await conn.execute(
        `SELECT COLUMN_TYPE, COLUMN_KEY FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
        [cfg.database, table, column]
      );
      if (!rows || rows.length === 0) return null;
      return { type: rows[0].COLUMN_TYPE, key: rows[0].COLUMN_KEY };
    }

    // discover referenced table/column types
    const exists = {};
    for (const t of Object.values(refs)) {
      exists[t] = await tableExists(t);
      console.log(`table ${t} exists: ${exists[t]}`);
    }

    const usersId = exists.users ? (await columnType('users', 'id')) : null;
    const orgsId = exists.organizations ? (await columnType('organizations', 'id')) : null;
    const rolesId = exists.roles ? (await columnType('roles', 'id')) : null;
    const groupsId = exists.groups ? (await columnType('groups', 'id')) : null;

    console.log('Discovered id column types:');
    console.log(' users.id ->', usersId && usersId.type);
    console.log(' organizations.id ->', orgsId && orgsId.type);
    console.log(' roles.id ->', rolesId && rolesId.type);
    console.log(' groups.id ->', groupsId && groupsId.type);

    // choose column types (fallback to INT if not found)
    const UTYPE = usersId ? usersId.type : 'INT';
    const OTYPE = orgsId ? orgsId.type : 'INT';
    const RTYPE = rolesId ? rolesId.type : 'INT';
    const GTYPE = groupsId ? groupsId.type : 'INT';

    // Build CREATE TABLE statement
    const createSql = `CREATE TABLE IF NOT EXISTS \`user_organizations\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`user_id\` ${UTYPE} NOT NULL,
  \`organization_id\` ${OTYPE} NOT NULL,
  \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
  \`active_role_id\` ${RTYPE} NULL,
  \`active_group_id\` ${GTYPE} NULL,
  \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY \`ux_user_org\` (\`user_id\`,\`organization_id\`),
  KEY \`idx_org\` (\`organization_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;

    console.log('\n== CREATE TABLE statement ==');
    console.log(createSql);

    if (!cfg.dryRun) {
      try {
        await conn.execute(createSql);
        console.log('Created (or verified) table `user_organizations`.');
      } catch (e) {
        console.error('Error executing CREATE TABLE:', e && e.message ? e.message : e);
        // If creation fails due to incompatible types, advise SHOW CREATE TABLE for parents
        console.error('If this failed with "foreign key" or "incompatible" errors, run the script in dry-run and inspect parent table types:');
        console.error('  SHOW CREATE TABLE users;');
        console.error('  SHOW CREATE TABLE organizations;');
        throw e;
      }
    } else {
      console.log('Dry-run mode: not executing CREATE TABLE.');
    }

    // helper to check if FK exists
    async function fkExists(constraintName) {
      const [rows] = await conn.execute(
        `SELECT COUNT(*) as c FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_organizations' AND CONSTRAINT_NAME = ?`,
        [cfg.database, constraintName]
      );
      return rows[0].c > 0;
    }

    // helper to add FK safely
    async function addFK(constraintName, localCol, refTable, refCol, onDelete) {
      if (!await tableExists(refTable)) {
        console.log(`Skipping FK ${constraintName}: referenced table ${refTable} missing.`);
        return;
      }
      if (await fkExists(constraintName)) {
        console.log(`FK ${constraintName} already exists, skipping.`);
        return;
      }
      const sql = `ALTER TABLE \`user_organizations\` ADD CONSTRAINT \`${constraintName}\` FOREIGN KEY (\`${localCol}\`) REFERENCES \`${refTable}\`(\`${refCol}\`) ON DELETE ${onDelete} ON UPDATE CASCADE;`;
      console.log('\n== ALTER TABLE add FK ==');
      console.log(sql);
      if (!cfg.dryRun) {
        try {
          await conn.execute(sql);
          console.log(`Added FK ${constraintName}`);
        } catch (e) {
          console.error(`Failed to add FK ${constraintName}:`, e && e.message ? e.message : e);
        }
      }
    }

    // Add user FK (ON DELETE CASCADE)
    await addFK('uo_user_fk', 'user_id', 'users', 'id', 'CASCADE');
    // Add org FK (ON DELETE CASCADE)
    await addFK('uo_org_fk', 'organization_id', 'organizations', 'id', 'CASCADE');
    // Add role FK (ON DELETE SET NULL)
    await addFK('uo_active_role_fk', 'active_role_id', 'roles', 'id', 'SET NULL');
    // Add group FK (ON DELETE SET NULL)
    await addFK('uo_active_group_fk', 'active_group_id', 'groups', 'id', 'SET NULL');

    console.log('\nAll steps complete.');

    if (cfg.dryRun) console.log('Run again without --dry-run to execute the statements.');

  } catch (err) {
    console.error('Fatal error:', err && err.message ? err.message : err);
    process.exitCode = 2;
  } finally {
    if (conn) await conn.end();
  }
})();
