-- ==============================================================================
-- Migration 003 (UP): Regras de Negócio e Construtor de Seções Dinâmicas Customizadas
-- Dialeto: SQLite 3 (Idempotente para tabelas novas; colunas tratadas no startup)
-- ==============================================================================

PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

-- Tabela 1:N - Regras de Negócio Estruturadas (RN001..RN999)
CREATE TABLE IF NOT EXISTS requirement_business_rules (
  id TEXT PRIMARY KEY,
  req_id TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (req_id) REFERENCES requirements(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_req_rn_req_id ON requirement_business_rules(req_id, ordem);

-- Tabela 1:N - Seções Dinâmicas Personalizadas (Custom Sections)
CREATE TABLE IF NOT EXISTS requirement_custom_sections (
  id TEXT PRIMARY KEY,
  req_id TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  titulo_secao TEXT NOT NULL,
  campos_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (req_id) REFERENCES requirements(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_req_custom_sections_req_id ON requirement_custom_sections(req_id, ordem);

COMMIT;

