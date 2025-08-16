use auth_service::AuthService;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use shared::errors::{ApiError, AuthError};
use shared::models::{LoginRequest, LoginResponse};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
struct AppState {
    #[allow(dead_code)]
    redis_client: Arc<redis::Client>,
    #[allow(dead_code)]
    mongo_client: Arc<mongodb::Client>,
    auth_service: Arc<AuthService>,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    version: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "api_gateway=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load environment variables
    dotenv::dotenv().ok();

    // Initialize Redis
    let redis_url =
        std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string());
    let redis_client =
        Arc::new(redis::Client::open(redis_url).expect("Failed to create Redis client"));

    // Initialize MongoDB
    let mongo_url =
        std::env::var("MONGODB_URL").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let mongo_client = Arc::new(
        mongodb::Client::with_uri_str(&mongo_url)
            .await
            .expect("Failed to create MongoDB client"),
    );

    // Get database
    let db = mongo_client.database("alias_game");

    // Initialize Auth Service
    let jwt_secret =
        std::env::var("JWT_SECRET").expect("JWT_SECRET environment variable must be set");
    let twitch_client_id = std::env::var("TWITCH_CLIENT_ID")
        .expect("TWITCH_CLIENT_ID environment variable must be set");
    let twitch_client_secret = std::env::var("TWITCH_CLIENT_SECRET")
        .expect("TWITCH_CLIENT_SECRET environment variable must be set");

    info!("Starting API Gateway with environment variables configured");

    let auth_service = Arc::new(AuthService::new(
        &db,
        &jwt_secret,
        twitch_client_id,
        twitch_client_secret,
    ));

    // Create app state
    let app_state = AppState {
        redis_client,
        mongo_client,
        auth_service,
    };

    // Build the router
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/auth/login", get(login))
        .route("/api/v1/auth/callback", post(auth_callback))
        .route("/api/v1/auth/me", get(get_current_user))
        .route("/api/v1/rooms", post(create_room_placeholder))
        .route("/api/v1/rooms/:id/join", post(join_room_placeholder))
        .route("/ws", get(websocket_placeholder))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(app_state);

    // Start the server
    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    info!("API Gateway listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> impl IntoResponse {
    Json(HealthResponse {
        status: "healthy".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

// Local error wrapper for axum responses
#[derive(Debug)]
struct AppError(ApiError);

impl From<ApiError> for AppError {
    fn from(err: ApiError) -> Self {
        AppError(err)
    }
}

impl From<AuthError> for AppError {
    fn from(err: AuthError) -> Self {
        AppError(ApiError::Auth(err))
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self.0 {
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            ApiError::NotFound => (StatusCode::NOT_FOUND, "Not found".to_string()),
            ApiError::InternalServerError => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error".to_string(),
            ),
            ApiError::Auth(auth_err) => match auth_err {
                AuthError::InvalidCredentials => {
                    (StatusCode::UNAUTHORIZED, "Invalid credentials".to_string())
                }
                AuthError::InvalidToken => (StatusCode::UNAUTHORIZED, "Invalid token".to_string()),
                AuthError::TokenExpired => (StatusCode::UNAUTHORIZED, "Token expired".to_string()),
                AuthError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized".to_string()),
                _ => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Authentication error".to_string(),
                ),
            },
        };

        #[derive(Serialize)]
        struct ErrorResponse {
            error: String,
        }

        (status, Json(ErrorResponse { error: message })).into_response()
    }
}

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

async fn create_room_placeholder() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        "Create room endpoint not implemented",
    )
}

async fn join_room_placeholder() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        "Join room endpoint not implemented",
    )
}

async fn websocket_placeholder() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        "WebSocket endpoint not implemented",
    )
}
