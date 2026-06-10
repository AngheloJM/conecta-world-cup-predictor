//! Partidos: sincronización con football-data.org y listado.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::auth::AuthUser;
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

/// Sincroniza los partidos del Mundial desde football-data.org (solo admin).
pub async fn sync(user: AuthUser, State(st): State<AppState>) -> impl IntoResponse {
    // Verificar rol admin.
    let es_admin = sqlx::query_scalar!("SELECT es_admin FROM usuarios WHERE id = $1", user.id)
        .fetch_optional(&st.pool)
        .await
        .ok()
        .flatten()
        .unwrap_or(false);
    if !es_admin {
        return (StatusCode::FORBIDDEN, Json(ApiError::new("Solo administradores"))).into_response();
    }

    let token = std::env::var("FOOTBALL_DATA_TOKEN").unwrap_or_default();
    if token.is_empty() {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("Falta FOOTBALL_DATA_TOKEN en el servidor"))).into_response();
    }

    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.football-data.org/v4/competitions/WC/matches")
        .header("X-Auth-Token", token)
        .send()
        .await;

    let body = match resp {
        Ok(r) if r.status().is_success() => r.json::<ApiMatchesResp>().await,
        Ok(r) => return (StatusCode::BAD_GATEWAY, Json(ApiError::new(format!("La API respondió {}", r.status())))).into_response(),
        Err(e) => return (StatusCode::BAD_GATEWAY, Json(ApiError::new(format!("No se pudo contactar la API: {e}")))).into_response(),
    };

    let data = match body {
        Ok(d) => d,
        Err(e) => return (StatusCode::BAD_GATEWAY, Json(ApiError::new(format!("Respuesta inválida de la API: {e}")))).into_response(),
    };

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
              (external_id, equipo_local, equipo_visitante, local_cod, visitante_cod, fecha_hora, fase, grupo, goles_local, goles_visitante, estado)
            VALUES ($1,$2,$3,$4,$5,$6,$7::fase_partido,$8,$9,$10,$11::estado_partido)
            ON CONFLICT (external_id) DO UPDATE SET
              equipo_local=EXCLUDED.equipo_local, equipo_visitante=EXCLUDED.equipo_visitante,
              local_cod=EXCLUDED.local_cod, visitante_cod=EXCLUDED.visitante_cod,
              fecha_hora=EXCLUDED.fecha_hora, fase=EXCLUDED.fase, grupo=EXCLUDED.grupo,
              goles_local=EXCLUDED.goles_local, goles_visitante=EXCLUDED.goles_visitante, estado=EXCLUDED.estado
            "#,
            m.id,
            local,
            visit,
            m.home_team.tla.as_deref(),
            m.away_team.tla.as_deref(),
            m.utc_date,
            fase as _,
            grupo_corto(&m.group),
            gl,
            gv,
            estado as _,
        )
        .execute(&st.pool)
        .await;

        if r.is_ok() {
            guardados += 1;
        } else if let Err(e) = r {
            tracing::error!("upsert partido {} error: {e}", m.id);
        }
    }

    (StatusCode::OK, Json(json!({ "sincronizados": guardados, "recibidos": data.matches.len() }))).into_response()
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
    goles_local: Option<i16>,
    goles_visitante: Option<i16>,
    estado: String,
}

pub async fn listar(State(st): State<AppState>) -> impl IntoResponse {
    let rows = sqlx::query!(
        r#"SELECT id, grupo, fase::text as "fase!", fecha_hora,
                  equipo_local, equipo_visitante, local_cod, visitante_cod,
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
                    id: r.id,
                    grupo: r.grupo,
                    fase: r.fase,
                    fecha_hora: r.fecha_hora,
                    equipo_local: r.equipo_local,
                    equipo_visitante: r.equipo_visitante,
                    local_cod: r.local_cod,
                    visitante_cod: r.visitante_cod,
                    goles_local: r.goles_local,
                    goles_visitante: r.goles_visitante,
                    estado: r.estado,
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
