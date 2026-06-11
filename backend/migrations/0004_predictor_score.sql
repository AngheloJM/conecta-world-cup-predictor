-- Ganador real de cada partido (para campeón/finalistas; resuelve penales vía la API).
ALTER TABLE partidos ADD COLUMN IF NOT EXISTS ganador TEXT;

-- Puntos del predictor (bracket/grupos) por usuario, separados de las apuestas por partido.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS puntos_predictor INTEGER NOT NULL DEFAULT 0;
