//! Endpoints de administración (gestión de usuarios y carga manual de resultados).

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::auth::AdminUser;
use crate::partidos::recalcular_puntos;
use crate::{ApiError, AppState};

#[derive(Serialize)]
struct UsuarioAdmin {
    id: i64,
    nombre: String,
    email: String,
    es_admin: bool,
    puntos_totales: i32,
}

/// Lista todos los usuarios (solo admin).
pub async fn usuarios(_admin: AdminUser, State(st): State<AppState>) -> impl IntoResponse {
    let rows = sqlx::query!(
        "SELECT id, nombre, email, es_admin, puntos_totales FROM usuarios ORDER BY fecha_registro ASC"
    )
    .fetch_all(&st.pool)
    .await;

    match rows {
        Ok(rs) => {
            let out: Vec<UsuarioAdmin> = rs
                .into_iter()
                .map(|r| UsuarioAdmin {
                    id: r.id,
                    nombre: r.nombre,
                    email: r.email,
                    es_admin: r.es_admin,
                    puntos_totales: r.puntos_totales,
                })
                .collect();
            (StatusCode::OK, Json(out)).into_response()
        }
        Err(e) => {
            tracing::error!("admin usuarios error: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("Error de base de datos"))).into_response()
        }
    }
}

/// Elimina un usuario (no a sí mismo).
pub async fn borrar_usuario(admin: AdminUser, State(st): State<AppState>, Path(id): Path<i64>) -> impl IntoResponse {
    if id == admin.id {
        return (StatusCode::BAD_REQUEST, Json(ApiError::new("No puedes eliminarte a ti mismo"))).into_response();
    }
    match sqlx::query!("DELETE FROM usuarios WHERE id = $1", id).execute(&st.pool).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "mensaje": "Usuario eliminado" }))).into_response(),
        Err(e) => {
            tracing::error!("borrar usuario error: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("Error de base de datos"))).into_response()
        }
    }
}

#[derive(Deserialize)]
pub struct NuevaPassword {
    pub password: String,
}

/// El admin restablece la contraseña de un usuario (contraseña temporal).
pub async fn reset_password(_admin: AdminUser, State(st): State<AppState>, Path(id): Path<i64>, Json(b): Json<NuevaPassword>) -> impl IntoResponse {
    if b.password.len() < 8 {
        return (StatusCode::BAD_REQUEST, Json(ApiError::new("La contraseña debe tener al menos 8 caracteres"))).into_response();
    }
    let hash = match crate::auth::hash_password(&b.password) {
        Ok(h) => h,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("Error al procesar la contraseña"))).into_response(),
    };
    match sqlx::query!("UPDATE usuarios SET password_hash = $1 WHERE id = $2", hash, id).execute(&st.pool).await {
        Ok(r) if r.rows_affected() == 1 => (StatusCode::OK, Json(json!({ "mensaje": "Contraseña restablecida" }))).into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(ApiError::new("Usuario no encontrado"))).into_response(),
        Err(e) => {
            tracing::error!("reset password error: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("Error de base de datos"))).into_response()
        }
    }
}

#[derive(Deserialize)]
pub struct ResultadoReq {
    pub goles_local: i16,
    pub goles_visitante: i16,
}

/// Carga/corrige manualmente el resultado de un partido y recalcula puntos.
pub async fn set_resultado(
    _admin: AdminUser,
    State(st): State<AppState>,
    Path(id): Path<i64>,
    Json(b): Json<ResultadoReq>,
) -> impl IntoResponse {
    if b.goles_local < 0 || b.goles_visitante < 0 {
        return (StatusCode::BAD_REQUEST, Json(ApiError::new("Goles inválidos"))).into_response();
    }

    let r = sqlx::query!(
        r#"UPDATE partidos
           SET goles_local = $1, goles_visitante = $2, estado = 'Finalizado'::estado_partido
           WHERE id = $3"#,
        b.goles_local,
        b.goles_visitante,
        id,
    )
    .execute(&st.pool)
    .await;

    match r {
        Ok(res) if res.rows_affected() == 1 => {
            let _ = recalcular_puntos(&st.pool).await;
            (StatusCode::OK, Json(json!({ "mensaje": "Resultado guardado y puntos recalculados" }))).into_response()
        }
        Ok(_) => (StatusCode::NOT_FOUND, Json(ApiError::new("Partido no encontrado"))).into_response(),
        Err(e) => {
            tracing::error!("set resultado error: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("No se pudo guardar el resultado"))).into_response()
        }
    }
}
