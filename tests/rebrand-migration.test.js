'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { runRebrandMigration } = require('../migrations/run-rebrand-migration');

const cleanupPaths = [];

after(() => {
  for (const p of cleanupPaths) {
    try { fs.unlinkSync(p); } catch (_) { }
  }
});

function createLegacySynchroDb(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'dev',
      dev_role TEXT,
      seniority TEXT,
      skills TEXT DEFAULT '[]',
      avatar_bg TEXT DEFAULT '#6366f1',
      created_at TEXT NOT NULL
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      code TEXT,
      name TEXT NOT NULL
    );
    CREATE TABLE document_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_default INTEGER DEFAULT 0,
      logo_url TEXT,
      doc_title TEXT NOT NULL,
      doc_subtitle TEXT,
      header_institution TEXT,
      primary_color TEXT DEFAULT '#0284c7',
      footer_text TEXT,
      approval_terms TEXT,
      signee_contratada_title TEXT DEFAULT 'PELA CONTRATADA (SYNCHRO)',
      signee_contratante_title TEXT DEFAULT 'PELA CONTRATANTE (CLIENTE)',
      include_user_story INTEGER DEFAULT 1,
      include_acceptance_criteria INTEGER DEFAULT 1,
      include_qa_evidence INTEGER DEFAULT 1,
      include_signatures INTEGER DEFAULT 1,
      include_kpis INTEGER DEFAULT 1,
      include_status_banner INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_doc_templates_created ON document_templates(created_at ASC);
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const now = '2026-10-10T00:00:00.000Z';
  db.prepare('INSERT INTO users (id, name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('u1', 'Admin', 'admin@synchro.com', 'secret', 'admin', now);
  db.prepare('INSERT INTO users (id, name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('u2', 'Dev Legacy', 'dev@devsquad.com', 'secret2', 'dev', now);
  db.prepare('INSERT INTO projects (id, code, name) VALUES (?, ?, ?)')
    .run('p1', '006', 'DEVSQUAD');
  db.prepare(`
    INSERT INTO document_templates (
      id, name, description, is_default, doc_title, header_institution, footer_text,
      signee_contratada_title, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'tpl_default',
    'Padrão Corporativo Synchro (Oficial)',
    'Template institucional do Synchro ALM.',
    1,
    'RELATÓRIO FORMAL',
    'SYNCHRO ALM PRO — PLATAFORMA INTEGRADA',
    'Synchro ALM Pro — Artefato Formal',
    'PELA CONTRATADA (SYNCHRO)',
    now,
    now
  );
  db.close();
}

describe('Rebrand Global Synchro/DevSquad -> Flow (Migrations DDL/DML + Rollback + Compatibilidade)', () => {
  it('executa migration UP com backup, atualiza DDL/DML preservando projetos históricos, é idempotente e suporta ROLLBACK seguro', () => {
    const dbPath = path.join(os.tmpdir(), `flow_mig_test_${process.pid}_${Date.now()}.db`);
    cleanupPaths.push(dbPath, `${dbPath}-wal`, `${dbPath}-shm`);
    createLegacySynchroDb(dbPath);

    // 1. UP migration
    const upRes = runRebrandMigration({ dbPath, backup: true });
    cleanupPaths.push(upRes.backupPath, `${upRes.backupPath}-wal`, `${upRes.backupPath}-shm`);
    assert.equal(upRes.success, true);
    assert.equal(upRes.schemaHasFlowDefault, true);
    assert.ok(upRes.backupPath && fs.existsSync(upRes.backupPath), 'Deve gerar backup preventivo antes de migrar');

    let db = new DatabaseSync(dbPath);
    const tpl = db.prepare('SELECT * FROM document_templates WHERE id = ?').get('tpl_default');
    assert.equal(tpl.name, 'Padrão Corporativo Flow (Oficial)');
    assert.equal(tpl.header_institution, 'FLOW ALM PRO — PLATAFORMA INTEGRADA');
    assert.equal(tpl.footer_text, 'Flow ALM Pro — Artefato Formal');
    assert.equal(tpl.signee_contratada_title, 'PELA CONTRATADA (FLOW)');

    const users = db.prepare('SELECT id, email FROM users ORDER BY id ASC').all().map(u => ({ id: u.id, email: u.email }));
    assert.deepEqual(users, [
      { id: 'u1', email: 'admin@flow.com' },
      { id: 'u2', email: 'dev@flow.com' }
    ]);

    // Projeto histórico de negócio do cliente não deve ser corrompido
    const proj = db.prepare('SELECT name FROM projects WHERE id = ?').get('p1');
    assert.equal(proj.name, 'DEVSQUAD');

    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_doc_templates_created'").get();
    assert.ok(idx, 'Índice idx_doc_templates_created deve ser preservado após rebuild DDL');
    db.close();

    // 2. Idempotência (2ª execução UP não altera nem falha)
    const secondUp = runRebrandMigration({ dbPath, backup: false });
    assert.equal(secondUp.success, true);
    assert.equal(secondUp.schemaHasFlowDefault, true);

    // 3. Rollback seguro
    const rbRes = runRebrandMigration({ dbPath, rollback: true, backup: false });
    assert.equal(rbRes.success, true);
    assert.equal(rbRes.schemaHasFlowDefault, false);

    db = new DatabaseSync(dbPath);
    const rolledTpl = db.prepare('SELECT * FROM document_templates WHERE id = ?').get('tpl_default');
    assert.equal(rolledTpl.name, 'Padrão Corporativo Synchro (Oficial)');
    assert.equal(rolledTpl.signee_contratada_title, 'PELA CONTRATADA (SYNCHRO)');
    const rolledUsers = db.prepare('SELECT email FROM users WHERE id = ?').get('u1');
    assert.equal(rolledUsers.email, 'admin@synchro.com');
    db.close();
  });

  it('server.js migra automaticamente arquivo synchro.db -> flow.db na inicialização e preserva dados existentes', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `flow_autostart_${process.pid}_`));
    const legacySynchroPath = path.join(tmpDir, 'synchro.db');
    const targetFlowPath = path.join(tmpDir, 'flow.db');
    cleanupPaths.push(legacySynchroPath, `${legacySynchroPath}-wal`, `${legacySynchroPath}-shm`, targetFlowPath, `${targetFlowPath}-wal`, `${targetFlowPath}-shm`);

    createLegacySynchroDb(legacySynchroPath);

    // Executa require('../server') em subprocesso apontando DB_PATH para targetFlowPath (dentro de tmpDir onde synchro.db existe)
    const { spawnSync } = require('node:child_process');
    const script = `
      const assert = require('node:assert/strict');
      const { db } = require(${JSON.stringify(path.join(__dirname, '..', 'server.js'))});
      const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='document_templates'").get();
      assert.match(ddl.sql, /PELA CONTRATADA \\(FLOW\\)/);
      const user = db.prepare("SELECT email FROM users WHERE id='u1'").get();
      assert.equal(user.email, 'admin@flow.com');
      const tpl = db.prepare("SELECT name FROM document_templates WHERE id='tpl_default'").get();
      assert.equal(tpl.name, 'Padrão Corporativo Flow (Oficial)');
      db.close();
      console.log('AUTO_MIGRATE_OK');
    `;
    const run = spawnSync(process.execPath, ['--no-warnings', '--experimental-sqlite', '-e', script], {
      env: { ...process.env, DB_PATH: targetFlowPath },
      encoding: 'utf8'
    });
    assert.equal(run.status, 0, `Subprocesso falhou: ${run.stderr}\n${run.stdout}`);
    assert.ok(run.stdout.includes('AUTO_MIGRATE_OK'));
    assert.ok(fs.existsSync(targetFlowPath), 'flow.db deve ter sido criado automaticamente a partir de synchro.db');

    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { }
  });
});
