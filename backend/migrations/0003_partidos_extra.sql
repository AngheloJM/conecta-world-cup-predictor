-- ============================================================
--  Migración 0003 · escudos y sede (datos gratuitos de la API)
-- ============================================================

ALTER TABLE partidos ADD COLUMN IF NOT EXISTS crest_local     TEXT;
ALTER TABLE partidos ADD COLUMN IF NOT EXISTS crest_visitante TEXT;
ALTER TABLE partidos ADD COLUMN IF NOT EXISTS venue           VARCHAR(140);
