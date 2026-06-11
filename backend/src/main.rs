//! Polla Mundialista "Conecta" · Backend Axum.
//! Auth (registro/login + JWT), candado de tiempo en apuestas y cálculo de puntos.

mod apuestas;
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
use serde::Serialize;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tower_http::cors::{Any, CorsLayer};
use utoipa::{OpenApi, ToSchema};

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

#[utoipa::path(get, path = "/health", tag = "sistema", responses((status = 200, description = "Servicio operativo")))]
async fn health() -> impl IntoResponse {
    (StatusCode::OK, Json(serde_json::json!({ "status": "ok" })))
}

// ------------------------------------------------------------ Ranking (tabla de posiciones)
#[derive(Serialize, ToSchema)]
struct RankRow {
    pos: i64,
    id: i64,
    nombre: String,
    nombre_equipo: Option<String>,
    puntos: i32,
}

#[utoipa::path(get, path = "/ranking", tag = "ranking",
    responses((status = 200, description = "Tabla de posiciones", body = [RankRow])))]
async fn ranking(State(state): State<AppState>) -> impl IntoResponse {
    let rows = sqlx::query!(
        r#"SELECT id, nombre, nombre_equipo, puntos_totales
           FROM usuarios ORDER BY puntos_totales DESC, fecha_registro ASC LIMIT 100"#
    )
    .fetch_all(&state.pool)
    .await;

    match rows {
        Ok(rs) => {
            let out: Vec<RankRow> = rs
                .into_iter()
                .enumerate()
                .map(|(i, r)| RankRow {
                    pos: (i as i64) + 1,
                    id: r.id,
                    nombre: r.nombre,
                    nombre_equipo: r.nombre_equipo,
                    puntos: r.puntos_totales,
                })
                .collect();
            (StatusCode::OK, Json(out)).into_response()
        }
        Err(e) => {
            tracing::error!("ranking error: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError::new("Error de base de datos"))).into_response()
        }
    }
}

// ------------------------------------------------------------ Documentación OpenAPI
#[derive(OpenApi)]
#[openapi(
    info(title = "Conecta · World Cup Predictor API", version = "0.1.0", description = "API de la polla mundialista: autenticación y apuestas."),
    paths(auth::register, auth::login, auth::me, sim::guardar, sim::obtener, ranking, apuestas::crear, apuestas::listar, health),
    components(schemas(
        auth::RegisterReq, auth::LoginReq, auth::AuthResp, auth::UsuarioOut,
        sim::GuardarSim, sim::SimOut, RankRow,
        ApiError, apuestas::NuevaApuesta, apuestas::ApuestaCreada, apuestas::ApuestaOut
    )),
    modifiers(&SecurityAddon),
    tags(
        (name = "auth", description = "Registro, login y sesión"),
        (name = "predicciones", description = "Simulación del Mundial del usuario"),
        (name = "ranking", description = "Tabla de posiciones"),
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

    // Auto-sync: sincroniza resultados de la API cada 15 min (y al arrancar).
    {
        let pool = state.pool.clone();
        let token = std::env::var("FOOTBALL_DATA_TOKEN").unwrap_or_default();
        tokio::spawn(async move {
            if token.is_empty() {
                tracing::warn!("Sin FOOTBALL_DATA_TOKEN: auto-sync deshabilitado");
                return;
            }
            let mut intervalo = tokio::time::interval(std::time::Duration::from_secs(900));
            loop {
                intervalo.tick().await; // primer tick inmediato → sincroniza al arrancar
                match partidos::sincronizar(&pool, &token).await {
                    Ok((g, r)) => tracing::info!("auto-sync: {g}/{r} partidos"),
                    Err(e) => tracing::error!("auto-sync error: {e}"),
                }
            }
        });
    }

    // CORS abierto (auth por Bearer token, sin cookies) — restringir origen en producción.
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/auth/register", post(auth::register))
        .route("/auth/login", post(auth::login))
        .route("/me", get(auth::me))
        .route("/simulacion", get(sim::obtener).put(sim::guardar))
        .route("/partidos", get(partidos::listar))
        .route("/ranking", get(ranking))
        .route("/apuestas", get(apuestas::listar).post(apuestas::crear))
        .route("/admin/sync", post(partidos::sync))
        .route("/admin/recalcular", post(partidos::recalcular))
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
