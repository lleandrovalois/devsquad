-- ==============================================================================
-- Migration 002 (DOWN / Rollback): Remover tabelas filhas da Especificação SUSIS
-- Dialeto: SQLite 3
-- ==============================================================================

PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

DROP INDEX IF EXISTS idx_req_ca_req_id;
DROP TABLE IF EXISTS requirement_acceptance_criteria;

DROP INDEX IF EXISTS idx_req_attrs_req_id;
DROP TABLE IF EXISTS requirement_attributes;

DROP INDEX IF EXISTS idx_req_screens_req_id;
DROP TABLE IF EXISTS requirement_screens;

DROP INDEX IF EXISTS idx_req_history_req_id;
DROP TABLE IF EXISTS requirement_updates_history;

COMMIT;
PRAGMA foreign_keys = ON;

