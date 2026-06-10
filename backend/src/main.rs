//! Polla Mundialista "Conecta" · Backend Axum.
//! Auth (registro/login + JWT), candado de tiempo en apuestas y cálculo de puntos.

mod auth;
mod partidos;
mod scoring;
mod sim;

use axum::{
    extract::State,
    http::StatusCode,
    response::{Html, IntoResponse},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tower_http::cors::{Any, CorsLayer};
use utoipa::{OpenApi, ToSchema};

use auth::AuthUser;

// ------------------------------------------------------------ Estado y error compartidos
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_secret: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApiError {
    pub error: String,
}
impl ApiError {
    pub fn new(msg: impl Into<String>) -> Self {
        Self { error: msg.into() }
    }
}

// ------------------------------------------------------------ Apuesta por partido (candado de tiempo)
#[derive(Debug, Deserialize, ToSchema)]
struct NuevaApuesta {
    partido_id: i64,
    prediccion_local: i16,
    prediccion_visitante: i16,
}

#[derive(Debug, Serialize, ToSchema)]
struct ApuestaCreada {
    id: i64,
    mensaje: String,
}

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
async fn crear_apuesta(
    user: AuthUser,
    State(state): State<AppState>,
    Json(body): Json<NuevaApuesta>,
) -> impl IntoResponse {
    if body.prediccion_local < 0 || body.prediccion_visitante < 0 {
        return (StatusCode::BAD_REQUEST, Json(ApiError::new("El marcador no puede ser negativo"))).into_response();
    }

    let partido = sqlx::query!(
        r#"SELECT fecha_hora FROM partidos WHERE id = $1"#,
        body.partido_id
    )
    .fetch_optional(&state.pool)
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
    let ahora: DateTime<Utc> = Utc::now();
    if ahora >= partido.fecha_hora {
        return (StatusCode::BAD_REQUEST, Json(ApiError::new("Las apuestas están cerradas: el partido ya inició"))).into_response();
    }

    // Upsert: permite modificar la apuesta mientras no haya iniciado el partido.
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
        user.id,
        body.partido_id,
        body.prediccion_local,
        body.prediccion_visitante,
    )
    .fetch_one(&state.pool)
    .await;

    match inserted {
        Ok(row) => (StatusCode::OK, Json(ApuestaCreada { id: row.id, mensaje: "Apuesta guardada".into() })).into_response(),
        Err(e) => {
            tracing::error!("DB insert error: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("No se pudo registrar la apuesta"))).into_response()
        }
    }
}

#[utoipa::path(get, path = "/health", tag = "sistema", responses((status = 200, description = "Servicio operativo")))]
async fn health() -> impl IntoResponse {
    (StatusCode::OK, Json(serde_json::json!({ "status": "ok" })))
}

// ------------------------------------------------------------ Documentación OpenAPI
#[derive(OpenApi)]
#[openapi(
    info(title = "Conecta · World Cup Predictor API", version = "0.1.0", description = "API de la polla mundialista: autenticación y apuestas."),
    paths(auth::register, auth::login, auth::me, sim::guardar, sim::obtener, crear_apuesta, health),
    components(schemas(
        auth::RegisterReq, auth::LoginReq, auth::AuthResp, auth::UsuarioOut,
        sim::GuardarSim, sim::SimOut,
        ApiError, NuevaApuesta, ApuestaCreada
    )),
    modifiers(&SecurityAddon),
    tags(
        (name = "auth", description = "Registro, login y sesión"),
        (name = "predicciones", description = "Simulación del Mundial del usuario"),
        (name = "apuestas", description = "Predicciones por partido"),
        (name = "sistema", description = "Salud del servicio")
    )
)]
struct ApiDoc;

struct SecurityAddon;
impl utoipa::Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        use utoipa::openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme};
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "bearerAuth",
                SecurityScheme::Http(
                    HttpBuilder::new().scheme(HttpAuthScheme::Bearer).bearer_format("JWT").build(),
                ),
            );
        }
    }
}

async fn openapi_json() -> impl IntoResponse {
    Json(ApiDoc::openapi())
}

/// UI de documentación (Scalar) cargada por CDN — sin descargas en build.
async fn docs_ui() -> impl IntoResponse {
    Html(
        r#"<!doctype html>
<html><head><meta charset="utf-8" /><title>API · Conecta Predictor</title>
<meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body><script id="api-reference" data-url="/openapi.json"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body></html>"#,
    )
}

// ------------------------------------------------------------ Bootstrap
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/conecta".into());
    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "dev-secret-cambiar-en-produccion".into());

    let pool = PgPoolOptions::new().max_connections(10).connect(&db_url).await?;

    // Aplica las migraciones al arrancar (crea las tablas si no existen).
    sqlx::migrate!("./migrations").run(&pool).await?;

    let state = AppState { pool, jwt_secret };

    // CORS abierto (auth por Bearer token, sin cookies) — restringir origen en producción.
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/auth/register", post(auth::register))
        .route("/auth/login", post(auth::login))
        .route("/me", get(auth::me))
        .route("/simulacion", get(sim::obtener).put(sim::guardar))
        .route("/partidos", get(partidos::listar))
        .route("/admin/sync", post(partidos::sync))
        .route("/apuestas", post(crear_apuesta))
        .route("/openapi.json", get(openapi_json))
        .route("/docs", get(docs_ui))
        .layer(cors)
        .with_state(state);

    // Railway (y la mayoría de PaaS) inyectan el puerto vía la variable PORT.
    let port = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(3000u16);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    tracing::info!("Servidor escuchando en http://0.0.0.0:{port}");
    axum::serve(listener, app).await?;

    Ok(())
}
