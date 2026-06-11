//! Partidos: sincronización con football-data.org, listado y cálculo de puntos.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;

use crate::auth::AuthUser;
use crate::scoring::calcular_puntos;
use crate::{ApiError, AppState};

// ---------- Mapeo de la respuesta de football-data.org ----------
#[derive(Deserialize)]
struct ApiMatchesResp {
    matches: Vec<ApiMatch>,
}
#[derive(Deserialize)]
struct ApiMatch {
    id: i64,
    #[serde(rename = "utcDate")]
    utc_date: DateTime<Utc>,
    status: String,
    stage: String,
    group: Option<String>,
    venue: Option<String>,
    #[serde(rename = "homeTeam")]
    home_team: ApiTeam,
    #[serde(rename = "awayTeam")]
    away_team: ApiTeam,
    score: ApiScore,
}
#[derive(Deserialize)]
struct ApiTeam {
    name: Option<String>,
    tla: Option<String>,
    crest: Option<String>,
}
#[derive(Deserialize)]
struct ApiScore {
    #[serde(rename = "fullTime")]
    full_time: ApiFullTime,
}
#[derive(Deserialize)]
struct ApiFullTime {
    home: Option<i32>,
    away: Option<i32>,
}

fn fase_de(stage: &str) -> &'static str {
    match stage {
        "GROUP_STAGE" => "Grupos",
        "LAST_32" => "Dieciseisavos",
        "LAST_16" => "Octavos",
        "QUARTER_FINALS" => "Cuartos",
        "SEMI_FINALS" => "Semifinal",
        "FINAL" | "THIRD_PLACE" => "Final",
        _ => "Grupos",
    }
}
fn grupo_corto(g: &Option<String>) -> Option<String> {
    g.as_ref().map(|s| s.trim_start_matches("GROUP_").to_string())
}

// ============================================================
//  Sincronización (reusable: la usan el endpoint admin y el auto-sync)
// ============================================================
pub async fn sincronizar(pool: &PgPool, token: &str) -> Result<(i64, usize), String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.football-data.org/v4/competitions/WC/matches")
        .header("X-Auth-Token", token)
        .send()
        .await
        .map_err(|e| format!("No se pudo contactar la API: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("La API respondió {}", resp.status()));
    }
    let data: ApiMatchesResp = resp.json().await.map_err(|e| format!("Respuesta inválida: {e}"))?;

    let mut guardados = 0i64;
    for m in &data.matches {
        let fase = fase_de(&m.stage);
        let estado = if m.status == "FINISHED" { "Finalizado" } else { "Pendiente" };
        let gl = if estado == "Finalizado" { m.score.full_time.home.map(|v| v as i16) } else { None };
        let gv = if estado == "Finalizado" { m.score.full_time.away.map(|v| v as i16) } else { None };
        let local = m.home_team.name.clone().unwrap_or_else(|| "Por definir".into());
        let visit = m.away_team.name.clone().unwrap_or_else(|| "Por definir".into());

        let r = sqlx::query!(
            r#"
            INSERT INTO partidos
              (external_id, equipo_local, equipo_visitante, local_cod, visitante_cod,
               crest_local, crest_visitante, venue, fecha_hora, fase, grupo,
               goles_local, goles_visitante, estado)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::fase_partido,$11,$12,$13,$14::estado_partido)
            ON CONFLICT (external_id) DO UPDATE SET
              equipo_local=EXCLUDED.equipo_local, equipo_visitante=EXCLUDED.equipo_visitante,
              local_cod=EXCLUDED.local_cod, visitante_cod=EXCLUDED.visitante_cod,
              crest_local=EXCLUDED.crest_local, crest_visitante=EXCLUDED.crest_visitante,
              venue=EXCLUDED.venue, fecha_hora=EXCLUDED.fecha_hora, fase=EXCLUDED.fase, grupo=EXCLUDED.grupo,
              goles_local=EXCLUDED.goles_local, goles_visitante=EXCLUDED.goles_visitante, estado=EXCLUDED.estado
            "#,
            m.id, local, visit,
            m.home_team.tla.as_deref(), m.away_team.tla.as_deref(),
            m.home_team.crest.as_deref(), m.away_team.crest.as_deref(),
            m.venue.as_deref(), m.utc_date, fase as _, grupo_corto(&m.group),
            gl, gv, estado as _,
        )
        .execute(pool)
        .await;

        if r.is_ok() {
            guardados += 1;
        } else if let Err(e) = r {
            tracing::error!("upsert partido {} error: {e}", m.id);
        }
    }

    // Tras actualizar resultados, recalcular puntos.
    recalcular_puntos(pool).await.map_err(|e| format!("scoring: {e}"))?;

    Ok((guardados, data.matches.len()))
}

// ============================================================
//  Cálculo de puntos (idempotente): por cada partido finalizado,
//  puntúa todas sus apuestas y suma a usuarios.puntos_totales.
// ============================================================
pub async fn recalcular_puntos(pool: &PgPool) -> Result<i64, sqlx::Error> {
    let partidos = sqlx::query!(
        r#"SELECT id, goles_local, goles_visitante
           FROM partidos
           WHERE estado = 'Finalizado' AND goles_local IS NOT NULL AND goles_visitante IS NOT NULL"#
    )
    .fetch_all(pool)
    .await?;

    for p in &partidos {
        let gl = p.goles_local.unwrap_or(0) as i32;
        let gv = p.goles_visitante.unwrap_or(0) as i32;

        let apuestas = sqlx::query!(
            r#"SELECT id, prediccion_local, prediccion_visitante FROM apuestas_partidos WHERE partido_id = $1"#,
            p.id
        )
        .fetch_all(pool)
        .await?;

        for a in &apuestas {
            let pts = calcular_puntos(gl, gv, a.prediccion_local as i32, a.prediccion_visitante as i32) as i16;
            sqlx::query!("UPDATE apuestas_partidos SET puntos_ganados = $1 WHERE id = $2", pts, a.id)
                .execute(pool)
                .await?;
        }
    }

    // Recalcular el acumulado de cada usuario.
    sqlx::query!(
        r#"UPDATE usuarios u SET puntos_totales = COALESCE(
             (SELECT SUM(ap.puntos_ganados) FROM apuestas_partidos ap WHERE ap.usuario_id = u.id), 0)"#
    )
    .execute(pool)
    .await?;

    Ok(partidos.len() as i64)
}

async fn es_admin(pool: &PgPool, uid: i64) -> bool {
    sqlx::query_scalar!("SELECT es_admin FROM usuarios WHERE id = $1", uid)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .unwrap_or(false)
}

// ---------- Endpoints admin ----------
pub async fn sync(user: AuthUser, State(st): State<AppState>) -> impl IntoResponse {
    if !es_admin(&st.pool, user.id).await {
        return (StatusCode::FORBIDDEN, Json(ApiError::new("Solo administradores"))).into_response();
    }
    let token = std::env::var("FOOTBALL_DATA_TOKEN").unwrap_or_default();
    if token.is_empty() {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("Falta FOOTBALL_DATA_TOKEN en el servidor"))).into_response();
    }
    match sincronizar(&st.pool, &token).await {
        Ok((g, r)) => (StatusCode::OK, Json(json!({ "sincronizados": g, "recibidos": r }))).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, Json(ApiError::new(e))).into_response(),
    }
}

pub async fn recalcular(user: AuthUser, State(st): State<AppState>) -> impl IntoResponse {
    if !es_admin(&st.pool, user.id).await {
        return (StatusCode::FORBIDDEN, Json(ApiError::new("Solo administradores"))).into_response();
    }
    match recalcular_puntos(&st.pool).await {
        Ok(n) => (StatusCode::OK, Json(json!({ "partidos_finalizados": n }))).into_response(),
        Err(e) => {
            tracing::error!("recalcular error: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("Error al recalcular"))).into_response()
        }
    }
}

// ---------- Listado público de partidos ----------
#[derive(Serialize)]
struct PartidoOut {
    id: i64,
    grupo: Option<String>,
    fase: String,
    fecha_hora: DateTime<Utc>,
    equipo_local: String,
    equipo_visitante: String,
    local_cod: Option<String>,
    visitante_cod: Option<String>,
    crest_local: Option<String>,
    crest_visitante: Option<String>,
    venue: Option<String>,
    goles_local: Option<i16>,
    goles_visitante: Option<i16>,
    estado: String,
}

pub async fn listar(State(st): State<AppState>) -> impl IntoResponse {
    let rows = sqlx::query!(
        r#"SELECT id, grupo, fase::text as "fase!", fecha_hora,
                  equipo_local, equipo_visitante, local_cod, visitante_cod,
                  crest_local, crest_visitante, venue,
                  goles_local, goles_visitante, estado::text as "estado!"
           FROM partidos ORDER BY fecha_hora, id"#
    )
    .fetch_all(&st.pool)
    .await;

    match rows {
        Ok(rs) => {
            let out: Vec<PartidoOut> = rs
                .into_iter()
                .map(|r| PartidoOut {
                    id: r.id, grupo: r.grupo, fase: r.fase, fecha_hora: r.fecha_hora,
                    equipo_local: r.equipo_local, equipo_visitante: r.equipo_visitante,
                    local_cod: r.local_cod, visitante_cod: r.visitante_cod,
                    crest_local: r.crest_local, crest_visitante: r.crest_visitante, venue: r.venue,
                    goles_local: r.goles_local, goles_visitante: r.goles_visitante, estado: r.estado,
                })
                .collect();
            (StatusCode::OK, Json(out)).into_response()
        }
        Err(e) => {
            tracing::error!("listar partidos error: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("Error de base de datos"))).into_response()
        }
    }
}
