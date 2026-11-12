-- ==============================================================================
-- Migration 003 (DOWN): Rollback de Regras de Negócio e Seções Dinâmicas Customizadas
-- Dialeto: SQLite 3
-- ==============================================================================

PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

DROP INDEX IF EXISTS idx_req_custom_sections_req_id;
DROP TABLE IF EXISTS requirement_custom_sections;

DROP INDEX IF EXISTS idx_req_rn_req_id;
DROP TABLE IF EXISTS requirement_business_rules;

COMMIT;

