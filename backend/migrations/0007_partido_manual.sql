-- Marca de resultado cargado manualmente: el auto-sync NO debe pisarlo.
ALTER TABLE partidos ADD COLUMN IF NOT EXISTS manual BOOLEAN NOT NULL DEFAULT false;
