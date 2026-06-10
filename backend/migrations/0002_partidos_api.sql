-- ============================================================
--  Migración 0002 · campos para sincronizar con football-data.org
-- ============================================================

-- ID del partido en la API externa (para upsert sin duplicar).
ALTER TABLE partidos ADD COLUMN IF NOT EXISTS external_id BIGINT;
ALTER TABLE partidos ADD COLUMN IF NOT EXISTS grupo         VARCHAR(8);
ALTER TABLE partidos ADD COLUMN IF NOT EXISTS local_cod     VARCHAR(3);
ALTER TABLE partidos ADD COLUMN IF NOT EXISTS visitante_cod VARCHAR(3);

CREATE UNIQUE INDEX IF NOT EXISTS uq_partidos_external ON partidos (external_id);
