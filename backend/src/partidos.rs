//! Partidos: sincronización con football-data.org, listado y cálculo de puntos.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use std::collections::{HashMap, HashSet};

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
    winner: Option<String>, // HOME_TEAM | AWAY_TEAM | DRAW (resuelve penales)
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
        let ganador: Option<String> = if estado == "Finalizado" {
            match m.score.winner.as_deref() {
                Some("HOME_TEAM") => Some(local.clone()),
                Some("AWAY_TEAM") => Some(visit.clone()),
                _ => None,
            }
        } else {
            None
        };

        let r = sqlx::query!(
            r#"
            INSERT INTO partidos
              (external_id, equipo_local, equipo_visitante, local_cod, visitante_cod,
               crest_local, crest_visitante, venue, fecha_hora, fase, grupo,
               goles_local, goles_visitante, estado, ganador)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::fase_partido,$11,$12,$13,$14::estado_partido,$15)
            ON CONFLICT (external_id) DO UPDATE SET
              equipo_local=EXCLUDED.equipo_local, equipo_visitante=EXCLUDED.equipo_visitante,
              local_cod=EXCLUDED.local_cod, visitante_cod=EXCLUDED.visitante_cod,
              crest_local=EXCLUDED.crest_local, crest_visitante=EXCLUDED.crest_visitante,
              venue=EXCLUDED.venue, fecha_hora=EXCLUDED.fecha_hora, fase=EXCLUDED.fase, grupo=EXCLUDED.grupo,
              goles_local=EXCLUDED.goles_local, goles_visitante=EXCLUDED.goles_visitante,
              estado=EXCLUDED.estado, ganador=EXCLUDED.ganador
            WHERE partidos.manual = false
            "#,
            m.id, local, visit,
            m.home_team.tla.as_deref(), m.away_team.tla.as_deref(),
            m.home_team.crest.as_deref(), m.away_team.crest.as_deref(),
            m.venue.as_deref(), m.utc_date, fase as _, grupo_corto(&m.group),
            gl, gv, estado as _, ganador,
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
    // 1. Puntos de TODAS las apuestas en UNA sola query (CASE), no N+1.
    //    Misma lógica que scoring::calcular_puntos (10/7/5/2/0).
    sqlx::query!(
        r#"
        UPDATE apuestas_partidos ap SET puntos_ganados = (CASE
            WHEN ap.prediccion_local = p.goles_local AND ap.prediccion_visitante = p.goles_visitante THEN 10
            WHEN p.goles_local <> p.goles_visitante
                 AND (p.goles_local - p.goles_visitante) = (ap.prediccion_local - ap.prediccion_visitante) THEN 7
            WHEN (p.goles_local > p.goles_visitante AND ap.prediccion_local > ap.prediccion_visitante)
              OR (p.goles_local < p.goles_visitante AND ap.prediccion_local < ap.prediccion_visitante)
              OR (p.goles_local = p.goles_visitante AND ap.prediccion_local = ap.prediccion_visitante) THEN 5
            WHEN ap.prediccion_local = p.goles_local OR ap.prediccion_visitante = p.goles_visitante THEN 2
            ELSE 0
        END)::smallint
        FROM partidos p
        WHERE ap.partido_id = p.id AND p.estado = 'Finalizado'
              AND p.goles_local IS NOT NULL AND p.goles_visitante IS NOT NULL
        "#
    )
    .execute(pool)
    .await?;

    // 2. Bonus del predictor (en memoria) → escritura en LOTE con unnest.
    let bonus = bonus_predictor(pool).await?;
    sqlx::query!("UPDATE usuarios SET puntos_predictor = 0").execute(pool).await?;
    if !bonus.is_empty() {
        let ids: Vec<i64> = bonus.keys().copied().collect();
        let vals: Vec<i32> = ids.iter().map(|id| bonus[id]).collect();
        sqlx::query!(
            r#"UPDATE usuarios u SET puntos_predictor = v.b
               FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::int[]) AS b) v
               WHERE u.id = v.id"#,
            &ids,
            &vals,
        )
        .execute(pool)
        .await?;
    }

    // 3. Conteos de desempate materializados (una pasada).
    sqlx::query!("UPDATE usuarios SET c_exactos = 0, c_diferencias = 0, c_simples = 0").execute(pool).await?;
    sqlx::query!(
        r#"UPDATE usuarios u
           SET c_exactos = s.e, c_diferencias = s.d, c_simples = s.s
           FROM (SELECT usuario_id,
                   COUNT(*) FILTER (WHERE puntos_ganados = 10)::int AS e,
                   COUNT(*) FILTER (WHERE puntos_ganados = 7)::int  AS d,
                   COUNT(*) FILTER (WHERE puntos_ganados = 5)::int  AS s
                 FROM apuestas_partidos GROUP BY usuario_id) s
           WHERE s.usuario_id = u.id"#
    )
    .execute(pool)
    .await?;

    // 4. Total = apuestas + bonus del predictor.
    sqlx::query!(
        r#"UPDATE usuarios u SET puntos_totales = COALESCE(
             (SELECT SUM(ap.puntos_ganados) FROM apuestas_partidos ap WHERE ap.usuario_id = u.id), 0)
             + u.puntos_predictor"#
    )
    .execute(pool)
    .await?;

    let fin = sqlx::query_scalar!("SELECT COUNT(*) FROM partidos WHERE estado = 'Finalizado'")
        .fetch_one(pool)
        .await?
        .unwrap_or(0);
    Ok(fin)
}

// ============================================================
//  Bonus del PREDICTOR: compara la simulación de cada usuario con
//  los resultados reales (tablas de grupos + final).
//    Campeón +25 · Finalista +10 c/u · 1.º de grupo +5 ·
//    Clasificado top-2 +3 c/u · Mejor tercero (grupo) +2 c/u
// ============================================================
pub async fn bonus_predictor(pool: &PgPool) -> Result<HashMap<i64, i32>, sqlx::Error> {
    // ---- 1. Tablas de grupos reales (solo de partidos finalizados) ----
    let gm = sqlx::query!(
        r#"SELECT grupo as "grupo!", equipo_local, equipo_visitante,
                  goles_local, goles_visitante, estado::text as "estado!"
           FROM partidos WHERE fase = 'Grupos' AND grupo IS NOT NULL"#
    )
    .fetch_all(pool)
    .await?;

    // grupo -> (total, finalizados, stats: equipo -> [pts, dif, gf])
    let mut groups: HashMap<String, (i32, i32, HashMap<String, [i32; 3]>)> = HashMap::new();
    for r in &gm {
        let e = groups.entry(r.grupo.clone()).or_insert((0, 0, HashMap::new()));
        e.0 += 1;
        if r.estado == "Finalizado" {
            if let (Some(gl), Some(gv)) = (r.goles_local, r.goles_visitante) {
                e.1 += 1;
                let (gl, gv) = (gl as i32, gv as i32);
                {
                    let s = e.2.entry(r.equipo_local.clone()).or_insert([0, 0, 0]);
                    s[1] += gl - gv; s[2] += gl;
                    if gl > gv { s[0] += 3 } else if gl == gv { s[0] += 1 }
                }
                {
                    let s = e.2.entry(r.equipo_visitante.clone()).or_insert([0, 0, 0]);
                    s[1] += gv - gl; s[2] += gv;
                    if gv > gl { s[0] += 3 } else if gv == gl { s[0] += 1 }
                }
            }
        }
    }

    let cmp = |a: &[i32; 3], b: &[i32; 3]| b[0].cmp(&a[0]).then(b[1].cmp(&a[1])).then(b[2].cmp(&a[2]));
    let mut group_winner: HashMap<String, String> = HashMap::new();
    let mut group_top2: HashMap<String, Vec<String>> = HashMap::new();
    let mut thirds: Vec<(String, [i32; 3])> = Vec::new(); // (letra del grupo, stats del 3.º)
    let total_groups = groups.len();
    let mut completos = 0;
    for (letra, (total, fin, stats)) in &groups {
        if *total > 0 && total == fin && stats.len() >= 2 {
            completos += 1;
            let mut ranked: Vec<(&String, &[i32; 3])> = stats.iter().collect();
            ranked.sort_by(|a, b| cmp(a.1, b.1));
            group_winner.insert(letra.clone(), ranked[0].0.clone());
            group_top2.insert(letra.clone(), vec![ranked[0].0.clone(), ranked[1].0.clone()]);
            if ranked.len() >= 3 {
                thirds.push((letra.clone(), *ranked[2].1));
            }
        }
    }
    let all_groups_done = total_groups > 0 && completos == total_groups;

    // Mejores 8 terceros (por letra de grupo) cuando ya terminaron todos los grupos.
    let mut best_third_letters: HashSet<String> = HashSet::new();
    if all_groups_done {
        thirds.sort_by(|a, b| cmp(&a.1, &b.1));
        for t in thirds.iter().take(8) {
            best_third_letters.insert(t.0.clone());
        }
    }

    // ---- 2. Final real (último partido de fase 'Final') ----
    let final_row = sqlx::query!(
        r#"SELECT equipo_local, equipo_visitante, ganador, goles_local, goles_visitante, estado::text as "estado!"
           FROM partidos WHERE fase = 'Final' ORDER BY fecha_hora DESC LIMIT 1"#
    )
    .fetch_optional(pool)
    .await?;

    let mut champion: Option<String> = None;
    let mut finalists: HashSet<String> = HashSet::new();
    if let Some(f) = final_row {
        if f.estado == "Finalizado" {
            finalists.insert(f.equipo_local.clone());
            finalists.insert(f.equipo_visitante.clone());
            champion = f.ganador.clone().or_else(|| match (f.goles_local, f.goles_visitante) {
                (Some(l), Some(v)) if l > v => Some(f.equipo_local.clone()),
                (Some(l), Some(v)) if v > l => Some(f.equipo_visitante.clone()),
                _ => None,
            });
        }
    }

    // ---- 2b. Ganadores de cada ronda de eliminatorias (quién avanzó) ----
    let ko = sqlx::query!(
        r#"SELECT fase::text as "fase!", ganador
           FROM partidos
           WHERE estado = 'Finalizado' AND ganador IS NOT NULL
                 AND fase IN ('Dieciseisavos','Octavos','Cuartos')"#
    )
    .fetch_all(pool)
    .await?;
    let mut reach_octavos: HashSet<String> = HashSet::new(); // ganaron Dieciseisavos → llegan a Octavos
    let mut reach_cuartos: HashSet<String> = HashSet::new(); // ganaron Octavos → llegan a Cuartos
    let mut reach_semis: HashSet<String> = HashSet::new();   // ganaron Cuartos → llegan a Semis
    for r in &ko {
        if let Some(g) = r.ganador.clone() {
            match r.fase.as_str() {
                "Dieciseisavos" => { reach_octavos.insert(g); }
                "Octavos" => { reach_cuartos.insert(g); }
                "Cuartos" => { reach_semis.insert(g); }
                _ => {}
            }
        }
    }

    // ---- 3. Bonus por usuario ----
    let sims = sqlx::query!(r#"SELECT usuario_id, estructura_bracket_json FROM simulacion_inicial"#)
        .fetch_all(pool)
        .await?;

    let mut bonus: HashMap<i64, i32> = HashMap::new();
    for s in &sims {
        let j = &s.estructura_bracket_json;
        let mut b = 0i32;

        // Grupos: 1.º (+5) y clasificados top-2 (+3 c/u).
        if let Some(obj) = j.get("groups").and_then(|v| v.as_object()) {
            for (letra, arr) in obj {
                let arr = match arr.as_array() {
                    Some(a) => a,
                    None => continue,
                };
                if let Some(w) = group_winner.get(letra) {
                    if arr.get(0).and_then(|v| v.as_str()) == Some(w.as_str()) {
                        b += 5;
                    }
                }
                if let Some(top2) = group_top2.get(letra) {
                    for i in 0..2 {
                        if let Some(pt) = arr.get(i).and_then(|v| v.as_str()) {
                            if top2.iter().any(|t| t == pt) {
                                b += 3;
                            }
                        }
                    }
                }
            }
        }

        // Mejores terceros (+2 por grupo acertado).
        if all_groups_done {
            if let Some(th) = j.get("thirds").and_then(|v| v.as_array()) {
                for v in th {
                    if let Some(letra) = v.as_str() {
                        if best_third_letters.contains(letra) {
                            b += 2;
                        }
                    }
                }
            }
        }

        // Campeón (+25).
        if let Some(champ) = &champion {
            if j.get("f").and_then(|v| v.as_str()) == Some(champ.as_str()) {
                b += 25;
            }
        }
        // Finalistas (+10 c/u).
        if !finalists.is_empty() {
            if let Some(sf) = j.get("sf").and_then(|v| v.as_array()) {
                for v in sf {
                    if let Some(name) = v.as_str() {
                        if finalists.contains(name) {
                            b += 10;
                        }
                    }
                }
            }
        }

        // Avances del bracket: llega a octavos (r32, +3), cuartos (r16, +5), semis (qf, +8).
        for (campo, conjunto, pts) in [
            ("r32", &reach_octavos, 3),
            ("r16", &reach_cuartos, 5),
            ("qf", &reach_semis, 8),
        ] {
            if let Some(arr) = j.get(campo).and_then(|v| v.as_array()) {
                for v in arr {
                    if let Some(name) = v.as_str() {
                        if conjunto.contains(name) {
                            b += pts;
                        }
                    }
                }
            }
        }

        bonus.insert(s.usuario_id, b);
    }

    Ok(bonus)
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
