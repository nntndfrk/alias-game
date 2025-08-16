use axum::{
    routing::{get, post},
    Router,
    response::IntoResponse,
    Json,
    http::StatusCode,
    extract::State,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{CorsLayer, Any};
use tracing::{info, error};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
struct AppState {
    redis_client: Arc<redis::Client>,
    mongo_client: Arc<mongodb::Client>,
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
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string());
    let redis_client = Arc::new(
        redis::Client::open(redis_url).expect("Failed to create Redis client")
    );

    // Initialize MongoDB
    let mongo_url = std::env::var("MONGODB_URL").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let mongo_client = Arc::new(
        mongodb::Client::with_uri_str(&mongo_url).await.expect("Failed to create MongoDB client")
    );

    // Create app state
    let app_state = AppState {
        redis_client,
        mongo_client,
    };

    // Build the router
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/auth/login", post(login_placeholder))
        .route("/api/v1/auth/callback", get(auth_callback_placeholder))
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

async fn login_placeholder() -> impl IntoResponse {
    (StatusCode::NOT_IMPLEMENTED, "Login endpoint not implemented")
}

async fn auth_callback_placeholder() -> impl IntoResponse {
    (StatusCode::NOT_IMPLEMENTED, "Auth callback endpoint not implemented")
}

async fn create_room_placeholder() -> impl IntoResponse {
    (StatusCode::NOT_IMPLEMENTED, "Create room endpoint not implemented")
}

async fn join_room_placeholder() -> impl IntoResponse {
    (StatusCode::NOT_IMPLEMENTED, "Join room endpoint not implemented")
}

async fn websocket_placeholder() -> impl IntoResponse {
    (StatusCode::NOT_IMPLEMENTED, "WebSocket endpoint not implemented")
}