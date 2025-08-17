use auth_service::AuthService;
use axum::{
    extract::State,
    http::HeaderMap,
    middleware::from_fn_with_state,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use shared::errors::AuthError;
use shared::models::{GameRoom, LoginRequest, LoginResponse};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};

pub mod auth_middleware;
pub mod error;
pub mod rooms;
#[cfg(debug_assertions)]
mod test_utils;
pub mod websocket;

#[derive(Clone)]
pub struct AppState {
    #[allow(dead_code)]
    pub redis_client: Arc<redis::Client>,
    #[allow(dead_code)]
    pub mongo_client: Arc<mongodb::Client>,
    pub auth_service: Arc<AuthService>,
    pub rooms: Arc<RwLock<HashMap<String, GameRoom>>>,
    pub websocket_manager: Arc<websocket::WebSocketManager>,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    version: String,
}

/// Create the application router with all routes configured
pub fn create_router(app_state: AppState) -> Router {
    // Build the router
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/auth/login", get(login))
        .route("/api/v1/auth/callback", post(auth_callback))
        .route("/api/v1/auth/me", get(get_current_user))
        .route("/ws", get(websocket::websocket_handler))
        // Public room routes (no auth required)
        .route("/api/v1/rooms", get(rooms::list_rooms))
        .route("/api/v1/rooms/:room_code", get(rooms::get_room));

    // Add test route in debug mode
    #[cfg(debug_assertions)]
    let app = app.route(
        "/api/v1/test/rooms/:room_code/join",
        post(test_utils::test_join_room),
    );

    app
        // Protected room routes (auth required)
        .nest(
            "/api/v1/rooms",
            Router::new()
                .route("/", post(rooms::create_room))
                .route("/:room_code/join", post(rooms::join_room))
                .route("/:room_code/leave", post(rooms::leave_room))
                .route("/:room_code/kick/:player_id", post(rooms::kick_player))
                .route_layer(from_fn_with_state(
                    app_state.clone(),
                    auth_middleware::auth_middleware,
                )),
        )
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(app_state)
}

async fn health_check() -> impl IntoResponse {
    Json(HealthResponse {
        status: "healthy".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

use error::AppError;

#[derive(Deserialize)]
#[allow(dead_code)]
struct AuthCallbackQuery {
    code: String,
    state: Option<String>,
}

async fn login() -> impl IntoResponse {
    // This endpoint will be used to initiate the OAuth flow
    // For now, return the Twitch OAuth URL
    let client_id = std::env::var("TWITCH_CLIENT_ID").unwrap_or_default();
    let redirect_uri = std::env::var("TWITCH_REDIRECT_URI")
        .unwrap_or_else(|_| "http://localhost:4200/auth/callback".to_string());

    let auth_url = format!(
        "https://id.twitch.tv/oauth2/authorize?client_id={}&redirect_uri={}&response_type=code&scope=user:read:email",
        client_id,
        urlencoding::encode(&redirect_uri)
    );

    #[derive(Serialize)]
    struct LoginUrlResponse {
        auth_url: String,
    }

    Json(LoginUrlResponse { auth_url })
}

async fn auth_callback(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    state
        .auth_service
        .login(request)
        .await
        .map(Json)
        .map_err(AppError::from)
}

async fn get_current_user(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let auth_header = headers
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .ok_or(AppError::from(AuthError::Unauthorized))?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(AppError::from(AuthError::InvalidToken))?;

    let claims = state
        .auth_service
        .verify_token(token)
        .map_err(AppError::from)?;

    #[derive(Serialize)]
    struct UserResponse {
        id: String,
        username: String,
        twitch_id: String,
    }

    Ok(Json(UserResponse {
        id: claims.sub,
        username: claims.username,
        twitch_id: claims.twitch_id,
    }))
}
