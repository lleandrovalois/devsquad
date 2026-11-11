-- ==============================================================================
-- Migration 001 (ROLLBACK): Reverte Flow -> Synchro em caso de contingência
-- Dialeto: SQLite 3 (Idempotente e Transacional)
-- ==============================================================================

PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

UPDATE document_templates
SET
  name = REPLACE(REPLACE(name, 'Flow', 'Synchro'), 'FLOW', 'SYNCHRO'),
  description = REPLACE(REPLACE(description, 'Flow', 'Synchro'), 'FLOW', 'SYNCHRO'),
  header_institution = REPLACE(REPLACE(header_institution, 'FLOW', 'SYNCHRO'), 'Flow', 'Synchro'),
  footer_text = REPLACE(REPLACE(footer_text, 'Flow', 'Synchro'), 'FLOW', 'SYNCHRO'),
  signee_contratada_title = REPLACE(REPLACE(signee_contratada_title, 'FLOW', 'SYNCHRO'), 'Flow', 'Synchro')
WHERE name LIKE '%Flow%' OR name LIKE '%FLOW%'
   OR description LIKE '%Flow%' OR description LIKE '%FLOW%'
   OR header_institution LIKE '%FLOW%' OR header_institution LIKE '%Flow%'
   OR footer_text LIKE '%Flow%' OR footer_text LIKE '%FLOW%'
   OR signee_contratada_title LIKE '%FLOW%' OR signee_contratada_title LIKE '%Flow%';

UPDATE users
SET email = REPLACE(email, '@flow.com', '@synchro.com')
WHERE lower(email) LIKE '%@flow.com'
  AND NOT EXISTS (
    SELECT 1 FROM users u2
    WHERE lower(u2.email) = lower(REPLACE(users.email, '@flow.com', '@synchro.com'))
  );

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

DELETE FROM app_settings WHERE key = 'branding_migration_version';

COMMIT;
PRAGMA foreign_keys = ON;
