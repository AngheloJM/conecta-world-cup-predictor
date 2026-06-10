-- ============================================================
--  PREDICTOR MUNDIALISTA "CONECTA" · Esquema PostgreSQL
--  Compatible con PostgreSQL 13+
-- ============================================================

BEGIN;

-- ---------- Tipos ENUM ----------
DO $$ BEGIN
  CREATE TYPE fase_partido AS ENUM ('Grupos', 'Octavos', 'Cuartos', 'Semifinal', 'Final');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_partido AS ENUM ('Pendiente', 'Finalizado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 1. USUARIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id              BIGSERIAL PRIMARY KEY,
  nombre          VARCHAR(120)  NOT NULL,
  celular         VARCHAR(20)   NOT NULL,
  carnet          VARCHAR(40)   NOT NULL UNIQUE,
  nombre_equipo   VARCHAR(80),
  puntos_totales  INTEGER       NOT NULL DEFAULT 0,
  fecha_registro  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_puntos ON usuarios (puntos_totales DESC);

-- ============================================================
-- 2. PARTIDOS
-- ============================================================
CREATE TABLE IF NOT EXISTS partidos (
  id                BIGSERIAL PRIMARY KEY,
  equipo_local      VARCHAR(60)    NOT NULL,
  equipo_visitante  VARCHAR(60)    NOT NULL,
  fecha_hora        TIMESTAMPTZ    NOT NULL,
  fase              fase_partido   NOT NULL DEFAULT 'Grupos',
  goles_local       SMALLINT,                       -- nullable hasta finalizar
  goles_visitante   SMALLINT,                       -- nullable hasta finalizar
  estado            estado_partido NOT NULL DEFAULT 'Pendiente',

  CONSTRAINT chk_goles_no_negativos
    CHECK ((goles_local IS NULL OR goles_local >= 0) AND
           (goles_visitante IS NULL OR goles_visitante >= 0)),
  CONSTRAINT chk_finalizado_con_marcador
    CHECK (estado <> 'Finalizado'
           OR (goles_local IS NOT NULL AND goles_visitante IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_partidos_fecha_hora ON partidos (fecha_hora);
CREATE INDEX IF NOT EXISTS idx_partidos_estado     ON partidos (estado);

-- ============================================================
-- 3. APUESTAS POR PARTIDO
-- ============================================================
CREATE TABLE IF NOT EXISTS apuestas_partidos (
  id                    BIGSERIAL PRIMARY KEY,
  usuario_id            BIGINT      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  partido_id            BIGINT      NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
  prediccion_local      SMALLINT    NOT NULL CHECK (prediccion_local >= 0),
  prediccion_visitante  SMALLINT    NOT NULL CHECK (prediccion_visitante >= 0),
  puntos_ganados        SMALLINT    NOT NULL DEFAULT 0,
  fecha_apuesta         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Evita apuestas duplicadas del mismo usuario en el mismo partido.
  CONSTRAINT uq_usuario_partido UNIQUE (usuario_id, partido_id)
);

CREATE INDEX IF NOT EXISTS idx_apuestas_usuario ON apuestas_partidos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_apuestas_partido ON apuestas_partidos (partido_id);

-- ============================================================
-- 4. SIMULACIÓN INICIAL (grupos + bracket completo del usuario)
-- ============================================================
CREATE TABLE IF NOT EXISTS simulacion_inicial (
  id                       BIGSERIAL PRIMARY KEY,
  usuario_id               BIGINT      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  campeon_predicho         VARCHAR(60) NOT NULL,
  subcampeon_predicho      VARCHAR(60) NOT NULL,
  -- Guarda la simulación completa (orden de grupos + avances del bracket) en un solo campo.
  estructura_bracket_json  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  bloqueado                BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Una sola simulación inicial por usuario.
  CONSTRAINT uq_simulacion_usuario UNIQUE (usuario_id)
);

COMMIT;
