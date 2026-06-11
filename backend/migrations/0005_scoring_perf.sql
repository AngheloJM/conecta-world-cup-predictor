-- Índices para el scoring y joins a escala (miles de apuestas).
CREATE INDEX IF NOT EXISTS idx_apuestas_partido ON apuestas_partidos(partido_id);
CREATE INDEX IF NOT EXISTS idx_partidos_estado ON partidos(estado);

-- Conteos de desempate materializados en el usuario (evita GROUP BY en cada apertura del tablero).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS c_exactos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS c_diferencias INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS c_simples INTEGER NOT NULL DEFAULT 0;
