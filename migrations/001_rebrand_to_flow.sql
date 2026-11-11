-- ==============================================================================
-- Migration 001 (UP): Rebrand Global DevSquad / Synchro -> Flow (IFPUG ALM)
-- Dialeto: SQLite 3 (Idempotente e Transacional)
-- ==============================================================================

PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

-- 1. Atualizar textos de sistema nos templates documentais (preservando projetos e auditoria histórica)
UPDATE document_templates
SET
  name = REPLACE(REPLACE(REPLACE(REPLACE(name, 'Synchro', 'Flow'), 'SYNCHRO', 'FLOW'), 'DevSquad', 'Flow'), 'DEVSQUAD', 'FLOW'),
  description = REPLACE(REPLACE(REPLACE(REPLACE(description, 'Synchro', 'Flow'), 'SYNCHRO', 'FLOW'), 'DevSquad', 'Flow'), 'DEVSQUAD', 'FLOW'),
  header_institution = REPLACE(REPLACE(REPLACE(REPLACE(header_institution, 'SYNCHRO', 'FLOW'), 'Synchro', 'Flow'), 'DEVSQUAD', 'FLOW'), 'DevSquad', 'Flow'),
  footer_text = REPLACE(REPLACE(REPLACE(REPLACE(footer_text, 'Synchro', 'Flow'), 'SYNCHRO', 'FLOW'), 'DevSquad', 'Flow'), 'DEVSQUAD', 'FLOW'),
  signee_contratada_title = REPLACE(REPLACE(REPLACE(REPLACE(signee_contratada_title, 'SYNCHRO', 'FLOW'), 'Synchro', 'Flow'), 'DEVSQUAD', 'FLOW'), 'DevSquad', 'Flow')
WHERE name LIKE '%Synchro%' OR name LIKE '%DevSquad%'
   OR description LIKE '%Synchro%' OR description LIKE '%DevSquad%'
   OR header_institution LIKE '%SYNCHRO%' OR header_institution LIKE '%Synchro%' OR header_institution LIKE '%DEVSQUAD%' OR header_institution LIKE '%DevSquad%'
   OR footer_text LIKE '%Synchro%' OR footer_text LIKE '%SYNCHRO%' OR footer_text LIKE '%DevSquad%' OR footer_text LIKE '%DEVSQUAD%'
   OR signee_contratada_title LIKE '%SYNCHRO%' OR signee_contratada_title LIKE '%Synchro%' OR signee_contratada_title LIKE '%DEVSQUAD%' OR signee_contratada_title LIKE '%DevSquad%';

-- 2. Migrar e-mails corporativos legados (@devsquad.com / @synchro.com -> @flow.com) sem violar UNIQUE(email)
UPDATE users
SET email = REPLACE(email, '@devsquad.com', '@flow.com')
WHERE lower(email) LIKE '%@devsquad.com'
  AND NOT EXISTS (
    SELECT 1 FROM users u2
    WHERE lower(u2.email) = lower(REPLACE(users.email, '@devsquad.com', '@flow.com'))
  );

UPDATE users
SET email = REPLACE(email, '@synchro.com', '@flow.com')
WHERE lower(email) LIKE '%@synchro.com'
  AND NOT EXISTS (
    SELECT 1 FROM users u2
    WHERE lower(u2.email) = lower(REPLACE(users.email, '@synchro.com', '@flow.com'))
  );

-- 3. Reconstruir DDL da tabela document_templates atualizando DEFAULT 'PELA CONTRATADA (FLOW)'
DROP TABLE IF EXISTS document_templates_new;
CREATE TABLE document_templates_new (
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
  signee_contratada_title TEXT DEFAULT 'PELA CONTRATADA (FLOW)',
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

INSERT INTO document_templates_new (
  id, name, description, is_default, logo_url, doc_title, doc_subtitle,
  header_institution, primary_color, footer_text, approval_terms,
  signee_contratada_title, signee_contratante_title,
  include_user_story, include_acceptance_criteria, include_qa_evidence,
  include_signatures, include_kpis, include_status_banner,
  created_at, updated_at
)
SELECT
  id, name, description, is_default, logo_url, doc_title, doc_subtitle,
  header_institution, primary_color, footer_text, approval_terms,
  signee_contratada_title, signee_contratante_title,
  include_user_story, include_acceptance_criteria, include_qa_evidence,
  include_signatures, include_kpis, include_status_banner,
  created_at, updated_at
FROM document_templates;

DROP TABLE document_templates;
ALTER TABLE document_templates_new RENAME TO document_templates;
CREATE INDEX IF NOT EXISTS idx_doc_templates_created ON document_templates(created_at ASC);

-- 4. Atualizar registro de metadados de versão de schema/branding
INSERT INTO app_settings (key, value, updated_at)
VALUES ('branding_migration_version', '"flow_001"', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = '"flow_001"', updated_at = datetime('now');

COMMIT;
PRAGMA foreign_keys = ON;
