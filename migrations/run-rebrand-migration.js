'use strict';

/**
 * Runner seguro e idempotente para migração de branding SQLite (DevSquad/Synchro -> Flow).
 * Uso:
 *   node --no-warnings --experimental-sqlite migrations/run-rebrand-migration.js --up [--db ./flow.db]
 *   node --no-warnings --experimental-sqlite migrations/run-rebrand-migration.js --rollback [--db ./flow.db]
 */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function runRebrandMigration(options = {}) {
  const mode = options.rollback ? 'rollback' : 'up';
  const dbPath = path.resolve(options.dbPath || path.join(__dirname, '..', 'flow.db'));
  const createBackup = options.backup !== false;

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Arquivo SQLite não encontrado: ${dbPath}`);
  }

  let backupPath = null;
  if (createBackup) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = `${dbPath}.pre_${mode}_${stamp}.bak`;
    fs.copyFileSync(dbPath, backupPath);
    if (fs.existsSync(`${dbPath}-wal`)) fs.copyFileSync(`${dbPath}-wal`, `${backupPath}-wal`);
    if (fs.existsSync(`${dbPath}-shm`)) fs.copyFileSync(`${dbPath}-shm`, `${backupPath}-shm`);
  }

  const sqlFile = mode === 'rollback'
    ? path.join(__dirname, '001_rebrand_to_flow.rollback.sql')
    : path.join(__dirname, '001_rebrand_to_flow.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  const db = new DatabaseSync(dbPath);
  try {
    db.exec(sql);
    const tplCount = db.prepare('SELECT count(*) as count FROM document_templates').get()?.count || 0;
    const ddlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='document_templates'").get();
    return {
      success: true,
      mode,
      dbPath,
      backupPath,
      documentTemplatesCount: tplCount,
      schemaHasFlowDefault: /PELA CONTRATADA \(FLOW\)/.test(ddlRow?.sql || '')
    };
  } finally {
    try { db.close(); } catch (_) { }
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const rollback = args.includes('--rollback') || args.includes('--down');
  const noBackup = args.includes('--no-backup');
  const dbIdx = args.indexOf('--db');
  const dbPath = dbIdx >= 0 && args[dbIdx + 1] ? args[dbIdx + 1] : process.env.DB_PATH;
  const result = runRebrandMigration({ rollback, backup: !noBackup, dbPath });
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { runRebrandMigration };
