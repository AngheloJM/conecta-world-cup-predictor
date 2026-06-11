//! Autenticación: registro / login con contraseña hasheada (Argon2) y token JWT.

use argon2::password_hash::{PasswordHash, SaltString};
use argon2::{Argon2, PasswordHasher, PasswordVerifier};
use axum::extract::{FromRequestParts, State};
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{ApiError, AppState};

// ------------------------------------------------------------ DTOs
#[derive(Deserialize, ToSchema)]
pub struct RegisterReq {
    #[schema(example = "Ana Pérez")]
    pub nombre: String,
    #[schema(example = "ana@conecta.com")]
    pub email: String,
    #[schema(example = "secreta123")]
    pub password: String,
}

#[derive(Deserialize, ToSchema)]
pub struct LoginReq {
    #[schema(example = "ana@conecta.com")]
    pub email: String,
    #[schema(example = "secreta123")]
    pub password: String,
}

#[derive(Serialize, ToSchema)]
pub struct UsuarioOut {
    pub id: i64,
    pub nombre: String,
    pub email: String,
    pub es_admin: bool,
    pub puntos_totales: i32,
}

#[derive(Serialize, ToSchema)]
pub struct AuthResp {
    pub token: String,
    pub usuario: UsuarioOut,
}

#[derive(Serialize, Deserialize)]
pub struct Claims {
    pub sub: i64,    // id de usuario
    pub exp: usize,  // expiración (epoch)
}

// ------------------------------------------------------------ Helpers
pub fn hash_password(pw: &str) -> Result<String, ()> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(pw.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|_| ())
}

fn verify_password(pw: &str, hash: &str) -> bool {
    match PasswordHash::new(hash) {
        Ok(parsed) => Argon2::default().verify_password(pw.as_bytes(), &parsed).is_ok(),
        Err(_) => false,
    }
}

pub fn make_token(uid: i64, secret: &str) -> Result<String, ()> {
    let exp = (chrono::Utc::now() + chrono::Duration::days(30)).timestamp() as usize;
    encode(
        &Header::default(),
        &Claims { sub: uid, exp },
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|_| ())
}

fn err(code: StatusCode, msg: &str) -> (StatusCode, Json<ApiError>) {
    (code, Json(ApiError::new(msg)))
}

/// ¿El email corresponde al admin configurado en la variable ADMIN_EMAIL?
fn es_admin_email(email: &str) -> bool {
    std::env::var("ADMIN_EMAIL")
        .ok()
        .map(|a| a.trim().to_lowercase() == email)
        .unwrap_or(false)
}

// ------------------------------------------------------------ Extractor de usuario autenticado
pub struct AuthUser {
    pub id: i64,
}

#[axum::async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = (StatusCode, Json<ApiError>);

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|h| h.strip_prefix("Bearer "))
            .ok_or_else(|| err(StatusCode::UNAUTHORIZED, "Falta el token"))?;

        let data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| err(StatusCode::UNAUTHORIZED, "Token inválido o expirado"))?;

        Ok(AuthUser { id: data.claims.sub })
    }
}

// ------------------------------------------------------------ Extractor de admin
pub struct AdminUser {
    pub id: i64,
}

#[axum::async_trait]
impl FromRequestParts<AppState> for AdminUser {
    type Rejection = (StatusCode, Json<ApiError>);

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        let es = sqlx::query_scalar!("SELECT es_admin FROM usuarios WHERE id = $1", user.id)
            .fetch_optional(&state.pool)
            .await
            .ok()
            .flatten()
            .unwrap_or(false);
        if es {
            Ok(AdminUser { id: user.id })
        } else {
            Err(err(StatusCode::FORBIDDEN, "Solo administradores"))
        }
    }
}

// ------------------------------------------------------------ Handlers
#[utoipa::path(
    post, path = "/auth/register", tag = "auth",
    request_body = RegisterReq,
    responses(
        (status = 201, description = "Usuario creado", body = AuthResp),
        (status = 400, description = "Datos inválidos", body = ApiError),
        (status = 409, description = "Email ya registrado", body = ApiError),
    )
)]
pub async fn register(
    State(st): State<AppState>,
    Json(body): Json<RegisterReq>,
) -> impl IntoResponse {
    let email = body.email.trim().to_lowercase();
    if body.nombre.trim().is_empty() || email.is_empty() || body.password.len() < 8 {
        return err(StatusCode::BAD_REQUEST, "Nombre, email y contraseña (mín. 8) son obligatorios").into_response();
    }

    let hash = match hash_password(&body.password) {
        Ok(h) => h,
        Err(_) => return err(StatusCode::INTERNAL_SERVER_ERROR, "No se pudo procesar la contraseña").into_response(),
    };

    // El usuario cuyo email coincide con ADMIN_EMAIL se crea como administrador.
    let es_admin = es_admin_email(&email);

    let row = sqlx::query!(
        r#"
        INSERT INTO usuarios (nombre, email, password_hash, es_admin)
        VALUES ($1, $2, $3, $4)
        RETURNING id, nombre, email, es_admin, puntos_totales
        "#,
        body.nombre.trim(),
        email,
        hash,
        es_admin,
    )
    .fetch_one(&st.pool)
    .await;

    match row {
        Ok(u) => {
            let token = match make_token(u.id, &st.jwt_secret) {
                Ok(t) => t,
                Err(_) => return err(StatusCode::INTERNAL_SERVER_ERROR, "No se pudo emitir el token").into_response(),
            };
            (
                StatusCode::CREATED,
                Json(AuthResp {
                    token,
                    usuario: UsuarioOut {
                        id: u.id,
                        nombre: u.nombre,
                        email: u.email,
                        es_admin: u.es_admin,
                        puntos_totales: u.puntos_totales,
                    },
                }),
            )
                .into_response()
        }
        Err(sqlx::Error::Database(db)) if db.constraint() == Some("usuarios_email_key") => {
            err(StatusCode::CONFLICT, "Ese correo ya está registrado").into_response()
        }
        Err(e) => {
            tracing::error!("register error: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "No se pudo registrar").into_response()
        }
    }
}

#[utoipa::path(
    post, path = "/auth/login", tag = "auth",
    request_body = LoginReq,
    responses(
        (status = 200, description = "Login correcto", body = AuthResp),
        (status = 401, description = "Credenciales incorrectas", body = ApiError),
    )
)]
pub async fn login(State(st): State<AppState>, Json(body): Json<LoginReq>) -> impl IntoResponse {
    let email = body.email.trim().to_lowercase();

    // Rate limiting anti fuerza bruta: máx. 5 intentos por minuto por correo.
    {
        let mut intentos = st.login_attempts.lock().unwrap();
        let entry = intentos.entry(email.clone()).or_insert((0, std::time::Instant::now()));
        if entry.1.elapsed() > std::time::Duration::from_secs(60) {
            *entry = (0, std::time::Instant::now());
        }
        if entry.0 >= 5 {
            return err(StatusCode::TOO_MANY_REQUESTS, "Demasiados intentos. Espera un minuto.").into_response();
        }
        entry.0 += 1;
    }

    let row = sqlx::query!(
        r#"SELECT id, nombre, email, password_hash, es_admin, puntos_totales
           FROM usuarios WHERE email = $1"#,
        email,
    )
    .fetch_optional(&st.pool)
    .await;

    let user = match row {
        Ok(Some(u)) => u,
        Ok(None) => return err(StatusCode::UNAUTHORIZED, "Correo o contraseña incorrectos").into_response(),
        Err(e) => {
            tracing::error!("login db error: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "Error de base de datos").into_response();
        }
    };

    if !verify_password(&body.password, &user.password_hash) {
        return err(StatusCode::UNAUTHORIZED, "Correo o contraseña incorrectos").into_response();
    }

    // Login correcto: limpia el contador de intentos.
    st.login_attempts.lock().unwrap().remove(&email);

    // Promueve a admin si el email coincide con ADMIN_EMAIL (y aún no lo es).
    let mut es_admin = user.es_admin;
    if es_admin_email(&email) && !es_admin {
        let _ = sqlx::query!("UPDATE usuarios SET es_admin = true WHERE id = $1", user.id)
            .execute(&st.pool)
            .await;
        es_admin = true;
    }

    let token = match make_token(user.id, &st.jwt_secret) {
        Ok(t) => t,
        Err(_) => return err(StatusCode::INTERNAL_SERVER_ERROR, "No se pudo emitir el token").into_response(),
    };

    (
        StatusCode::OK,
        Json(AuthResp {
            token,
            usuario: UsuarioOut {
                id: user.id,
                nombre: user.nombre,
                email: user.email,
                es_admin,
                puntos_totales: user.puntos_totales,
            },
        }),
    )
        .into_response()
}

/// Devuelve el usuario autenticado (ruta protegida de ejemplo).
#[utoipa::path(
    get, path = "/me", tag = "auth",
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Usuario autenticado", body = UsuarioOut),
        (status = 401, description = "No autenticado", body = ApiError),
    )
)]
pub async fn me(user: AuthUser, State(st): State<AppState>) -> impl IntoResponse {
    let row = sqlx::query!(
        r#"SELECT id, nombre, email, es_admin, puntos_totales FROM usuarios WHERE id = $1"#,
        user.id,
    )
    .fetch_optional(&st.pool)
    .await;

    match row {
        Ok(Some(u)) => (
            StatusCode::OK,
            Json(UsuarioOut {
                id: u.id,
                nombre: u.nombre,
                email: u.email,
                es_admin: u.es_admin,
                puntos_totales: u.puntos_totales,
            }),
        )
            .into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "Usuario no encontrado").into_response(),
        Err(_) => err(StatusCode::INTERNAL_SERVER_ERROR, "Error de base de datos").into_response(),
    }
}

#[derive(Deserialize)]
pub struct CambioPassword {
    pub actual: String,
    pub nueva: String,
}

/// El usuario cambia su propia contraseña (verifica la actual).
pub async fn cambiar_password(user: AuthUser, State(st): State<AppState>, Json(b): Json<CambioPassword>) -> impl IntoResponse {
    if b.nueva.len() < 8 {
        return err(StatusCode::BAD_REQUEST, "La nueva contraseña debe tener al menos 8 caracteres").into_response();
    }
    let row = sqlx::query!("SELECT password_hash FROM usuarios WHERE id = $1", user.id)
        .fetch_optional(&st.pool)
        .await;
    let hash = match row {
        Ok(Some(r)) => r.password_hash,
        _ => return err(StatusCode::NOT_FOUND, "Usuario no encontrado").into_response(),
    };
    if !verify_password(&b.actual, &hash) {
        return err(StatusCode::UNAUTHORIZED, "La contraseña actual es incorrecta").into_response();
    }
    let nuevo = match hash_password(&b.nueva) {
        Ok(h) => h,
        Err(_) => return err(StatusCode::INTERNAL_SERVER_ERROR, "No se pudo procesar la contraseña").into_response(),
    };
    match sqlx::query!("UPDATE usuarios SET password_hash = $1 WHERE id = $2", nuevo, user.id)
        .execute(&st.pool)
        .await
    {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "mensaje": "Contraseña actualizada" }))).into_response(),
        Err(_) => err(StatusCode::INTERNAL_SERVER_ERROR, "No se pudo actualizar la contraseña").into_response(),
    }
}
