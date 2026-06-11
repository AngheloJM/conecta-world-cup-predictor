//! Apuestas por partido (relacional): guardar con candado de tiempo y listar las del usuario.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::auth::AuthUser;
use crate::{ApiError, AppState};

#[derive(Debug, Deserialize, ToSchema)]
pub struct NuevaApuesta {
    pub partido_id: i64,
    pub prediccion_local: i16,
    pub prediccion_visitante: i16,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApuestaCreada {
    pub id: i64,
    pub mensaje: String,
}

#[derive(Serialize, ToSchema)]
pub struct ApuestaOut {
    pub partido_id: i64,
    pub prediccion_local: i16,
    pub prediccion_visitante: i16,
    pub puntos_ganados: i16,
}

/// Guarda (o actualiza) la apuesta del usuario para un partido, con candado de tiempo.
#[utoipa::path(
    post, path = "/apuestas", tag = "apuestas",
    security(("bearerAuth" = [])),
    request_body = NuevaApuesta,
    responses(
        (status = 200, description = "Apuesta guardada", body = ApuestaCreada),
        (status = 400, description = "Apuesta cerrada o inválida", body = ApiError),
        (status = 404, description = "Partido no encontrado", body = ApiError),
    )
)]
pub async fn crear(user: AuthUser, State(st): State<AppState>, Json(body): Json<NuevaApuesta>) -> impl IntoResponse {
    if body.prediccion_local < 0 || body.prediccion_visitante < 0 {
        return (StatusCode::BAD_REQUEST, Json(ApiError::new("El marcador no puede ser negativo"))).into_response();
    }

    let partido = sqlx::query!(r#"SELECT fecha_hora FROM partidos WHERE id = $1"#, body.partido_id)
        .fetch_optional(&st.pool)
        .await;

    let partido = match partido {
        Ok(Some(p)) => p,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(ApiError::new("Partido no encontrado"))).into_response(),
        Err(e) => {
            tracing::error!("DB error: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("Error de base de datos"))).into_response();
        }
    };

    // ----- CANDADO: el partido no debe haber iniciado -----
    if Utc::now() >= partido.fecha_hora {
        return (StatusCode::BAD_REQUEST, Json(ApiError::new("Las apuestas están cerradas: el partido ya inició"))).into_response();
    }

    let inserted = sqlx::query!(
        r#"
        INSERT INTO apuestas_partidos (usuario_id, partido_id, prediccion_local, prediccion_visitante)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (usuario_id, partido_id)
        DO UPDATE SET prediccion_local = EXCLUDED.prediccion_local,
                      prediccion_visitante = EXCLUDED.prediccion_visitante,
                      fecha_apuesta = now()
        RETURNING id
        "#,
        user.id, body.partido_id, body.prediccion_local, body.prediccion_visitante,
    )
    .fetch_one(&st.pool)
    .await;

    match inserted {
        Ok(row) => (StatusCode::OK, Json(ApuestaCreada { id: row.id, mensaje: "Apuesta guardada".into() })).into_response(),
        Err(e) => {
            tracing::error!("DB insert error: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("No se pudo registrar la apuesta"))).into_response()
        }
    }
}

/// Lista las apuestas del usuario autenticado (para precargar el calendario).
#[utoipa::path(
    get, path = "/apuestas", tag = "apuestas",
    security(("bearerAuth" = [])),
    responses((status = 200, description = "Apuestas del usuario", body = [ApuestaOut]))
)]
pub async fn listar(user: AuthUser, State(st): State<AppState>) -> impl IntoResponse {
    let rows = sqlx::query!(
        r#"SELECT partido_id, prediccion_local, prediccion_visitante, puntos_ganados
           FROM apuestas_partidos WHERE usuario_id = $1"#,
        user.id
    )
    .fetch_all(&st.pool)
    .await;

    match rows {
        Ok(rs) => {
            let out: Vec<ApuestaOut> = rs
                .into_iter()
                .map(|r| ApuestaOut {
                    partido_id: r.partido_id,
                    prediccion_local: r.prediccion_local,
                    prediccion_visitante: r.prediccion_visitante,
                    puntos_ganados: r.puntos_ganados,
                })
                .collect();
            (StatusCode::OK, Json(out)).into_response()
        }
        Err(e) => {
            tracing::error!("listar apuestas error: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("Error de base de datos"))).into_response()
        }
    }
}
