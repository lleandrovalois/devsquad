-- ==============================================================================
-- Migration 002 (UP): Especificação de Requisitos Padrão SUSIS / Banpará
-- Dialeto: SQLite 3 (Idempotente para tabelas novas; colunas tratadas no startup)
-- ==============================================================================

PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

-- Tabela 1:N - Histórico de Atualizações / Controle de Versões do Requisito
CREATE TABLE IF NOT EXISTS requirement_updates_history (
  id TEXT PRIMARY KEY,
  req_id TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  data TEXT NOT NULL,
  versao TEXT NOT NULL,
  descricao TEXT NOT NULL,
  responsavel_id TEXT,
  responsavel_nome TEXT NOT NULL,
  responsavel_cargo TEXT,
  responsavel_email TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (req_id) REFERENCES requirements(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_req_history_req_id ON requirement_updates_history(req_id, ordem);

-- Tabela 1:N - 1.2 Telas / Protótipos anexados ao Requisito
CREATE TABLE IF NOT EXISTS requirement_screens (
  id TEXT PRIMARY KEY,
  req_id TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  titulo_tela TEXT DEFAULT '',
  url TEXT NOT NULL,
  mime_type TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (req_id) REFERENCES requirements(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_req_screens_req_id ON requirement_screens(req_id, ordem);

-- Tabela 1:N - 1.3 Atributos das Funcionalidades (1.3.1 Entradas e 1.3.2 Saídas)
CREATE TABLE IF NOT EXISTS requirement_attributes (
  id TEXT PRIMARY KEY,
  req_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('entrada', 'saida')),
  ordem INTEGER DEFAULT 0,
  campo TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  tipo_campo TEXT DEFAULT 'Alfanumérico',
  obrigatorio INTEGER DEFAULT 0,
  regra TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (req_id) REFERENCES requirements(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_req_attrs_req_id ON requirement_attributes(req_id, direction, ordem);

-- Tabela 1:N - 1.4 Critérios de Aceite Estruturados (CA001..CA999 + Tipo Anexo 01)
CREATE TABLE IF NOT EXISTS requirement_acceptance_criteria (
  id TEXT PRIMARY KEY,
  req_id TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  item TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'Negócio (N)',
  categoria TEXT NOT NULL DEFAULT 'Específico',
  descricao TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (req_id) REFERENCES requirements(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_req_ca_req_id ON requirement_acceptance_criteria(req_id, ordem);

COMMIT;

