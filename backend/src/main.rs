//! Polla Mundialista "Conecta" · Backend Axum.
//! Resuelve los dos cuellos de botella críticos:
//!   1) Candado de apuestas por tiempo (POST /apuestas)
//!   2) Algoritmo puro de cálculo de puntos (módulo `scoring`)

mod scoring;

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::post,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

// ------------------------------------------------------------
// Estado compartido
// ------------------------------------------------------------
#[derive(Clone)]
struct AppState {
    pool: PgPool,
}

// ------------------------------------------------------------
// DTOs
// ------------------------------------------------------------
#[derive(Debug, Deserialize)]
struct NuevaApuesta {
    usuario_id: i64,
    partido_id: i64,
    prediccion_local: i16,
    prediccion_visitante: i16,
}

#[derive(Debug, Serialize)]
struct ApiError {
    error: String,
}

impl ApiError {
    fn new(msg: impl Into<String>) -> Self {
        Self { error: msg.into() }
    }
}

#[derive(Debug, Serialize)]
struct ApuestaCreada {
    id: i64,
    mensaje: String,
}

// ------------------------------------------------------------
// 1. ENDPOINT: Candado de apuestas por tiempo
// ------------------------------------------------------------
async fn crear_apuesta(
    State(state): State<AppState>,
    Json(body): Json<NuevaApuesta>,
) -> impl IntoResponse {
    // Validación básica de marcador.
    if body.prediccion_local < 0 || body.prediccion_visitante < 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiError::new("El marcador no puede ser negativo")),
        )
            .into_response();
    }

    // Trae la fecha de inicio y estado del partido.
    let partido = sqlx::query!(
        r#"SELECT fecha_hora, estado AS "estado: String" FROM partidos WHERE id = $1"#,
        body.partido_id
    )
    .fetch_optional(&state.pool)
    .await;

    let partido = match partido {
        Ok(Some(p)) => p,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(ApiError::new("Partido no encontrado")),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!("DB error: {e}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::new("Error de base de datos")),
            )
                .into_response();
        }
    };

    // ----- CANDADO: el partido no debe haber iniciado -----
    let ahora: DateTime<Utc> = Utc::now();
    if ahora >= partido.fecha_hora {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiError::new(
                "Las apuestas están cerradas: el partido ya inició",
            )),
        )
            .into_response();
    }

    // Inserta respetando el UNIQUE(usuario_id, partido_id) del esquema.
    let inserted = sqlx::query!(
        r#"
        INSERT INTO apuestas_partidos
            (usuario_id, partido_id, prediccion_local, prediccion_visitante)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        "#,
        body.usuario_id,
        body.partido_id,
        body.prediccion_local,
        body.prediccion_visitante,
    )
    .fetch_one(&state.pool)
    .await;

    match inserted {
        Ok(row) => (
            StatusCode::CREATED,
            Json(ApuestaCreada {
                id: row.id,
                mensaje: "Apuesta registrada".into(),
            }),
        )
            .into_response(),
        // Violación de UNIQUE -> apuesta duplicada.
        Err(sqlx::Error::Database(db)) if db.constraint() == Some("uq_usuario_partido") => (
            StatusCode::CONFLICT,
            Json(ApiError::new("Ya apostaste en este partido")),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("DB insert error: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::new("No se pudo registrar la apuesta")),
            )
                .into_response()
        }
    }
}

// ------------------------------------------------------------
// Bootstrap
// ------------------------------------------------------------
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/conecta".into());

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&db_url)
        .await?;

    let state = AppState { pool };

    let app = Router::new()
        .route("/apuestas", post(crear_apuesta))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    tracing::info!("Servidor escuchando en http://0.0.0.0:3000");
    axum::serve(listener, app).await?;

    Ok(())
}
