-- ============================================================
--  PREDICTOR MUNDIALISTA "CONECTA" · Migración inicial
--  La aplica el backend al arrancar (sqlx::migrate!) y también
--  docker-compose en local. Compatible con PostgreSQL 13+.
-- ============================================================

-- ---------- Tipos ENUM ----------
DO $$ BEGIN
  CREATE TYPE fase_partido AS ENUM ('Grupos', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'Final');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_partido AS ENUM ('Pendiente', 'Finalizado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 1. USUARIOS  (autenticación por email + contraseña)
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id              BIGSERIAL PRIMARY KEY,
  nombre          VARCHAR(120)  NOT NULL,
  email           VARCHAR(160)  NOT NULL UNIQUE,
  password_hash   TEXT          NOT NULL,
  nombre_equipo   VARCHAR(80),
  es_admin        BOOLEAN       NOT NULL DEFAULT FALSE,
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
  goles_local       SMALLINT,
  goles_visitante   SMALLINT,
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
  campeon_predicho         VARCHAR(60),
  subcampeon_predicho      VARCHAR(60),
  estructura_bracket_json  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  bloqueado                BOOLEAN     NOT NULL DEFAULT FALSE,
  actualizado              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_simulacion_usuario UNIQUE (usuario_id)
);
