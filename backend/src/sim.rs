//! Simulación inicial del usuario: grupos + mejores terceros + bracket + campeón.
//! Se guarda completa como JSONB y se recupera al iniciar sesión.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::json;
use utoipa::ToSchema;

use crate::auth::AuthUser;
use crate::{ApiError, AppState};

#[derive(Deserialize, ToSchema)]
pub struct GuardarSim {
    pub campeon_predicho: Option<String>,
    pub subcampeon_predicho: Option<String>,
    /// Estado completo de la predicción (grupos, terceros, bracket, apuestas).
    #[schema(value_type = Object)]
    pub estructura_bracket_json: serde_json::Value,
}

#[derive(Serialize, ToSchema)]
pub struct SimOut {
    pub campeon_predicho: Option<String>,
    pub subcampeon_predicho: Option<String>,
    #[schema(value_type = Object)]
    pub estructura_bracket_json: serde_json::Value,
    pub bloqueado: bool,
}

/// Guarda (o actualiza) la predicción del usuario autenticado.
#[utoipa::path(
    put, path = "/simulacion", tag = "predicciones",
    security(("bearerAuth" = [])),
    request_body = GuardarSim,
    responses(
        (status = 200, description = "Predicción guardada"),
        (status = 401, description = "No autenticado", body = ApiError),
    )
)]
pub async fn guardar(
    user: AuthUser,
    State(st): State<AppState>,
    Json(body): Json<GuardarSim>,
) -> impl IntoResponse {
    let res = sqlx::query!(
        r#"
        INSERT INTO simulacion_inicial (usuario_id, campeon_predicho, subcampeon_predicho, estructura_bracket_json)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (usuario_id) DO UPDATE SET
            campeon_predicho = EXCLUDED.campeon_predicho,
            subcampeon_predicho = EXCLUDED.subcampeon_predicho,
            estructura_bracket_json = EXCLUDED.estructura_bracket_json,
            actualizado = now()
        "#,
        user.id,
        body.campeon_predicho,
        body.subcampeon_predicho,
        body.estructura_bracket_json,
    )
    .execute(&st.pool)
    .await;

    match res {
        Ok(_) => (StatusCode::OK, Json(json!({ "mensaje": "Predicción guardada" }))).into_response(),
        Err(e) => {
            tracing::error!("guardar sim error: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("No se pudo guardar la predicción"))).into_response()
        }
    }
}

/// Devuelve la predicción guardada del usuario (o `null` si no tiene).
#[utoipa::path(
    get, path = "/simulacion", tag = "predicciones",
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Predicción del usuario (o null)", body = SimOut),
        (status = 401, description = "No autenticado", body = ApiError),
    )
)]
pub async fn obtener(user: AuthUser, State(st): State<AppState>) -> impl IntoResponse {
    let row = sqlx::query!(
        r#"SELECT campeon_predicho, subcampeon_predicho, estructura_bracket_json, bloqueado
           FROM simulacion_inicial WHERE usuario_id = $1"#,
        user.id,
    )
    .fetch_optional(&st.pool)
    .await;

    match row {
        Ok(Some(r)) => (
            StatusCode::OK,
            Json(Some(SimOut {
                campeon_predicho: r.campeon_predicho,
                subcampeon_predicho: r.subcampeon_predicho,
                estructura_bracket_json: r.estructura_bracket_json,
                bloqueado: r.bloqueado,
            })),
        )
            .into_response(),
        Ok(None) => (StatusCode::OK, Json(None::<SimOut>)).into_response(),
        Err(e) => {
            tracing::error!("obtener sim error: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("Error de base de datos"))).into_response()
        }
    }
}
