use auth_service::AuthService;
use axum::middleware::from_fn_with_state;
use axum::routing::{get, post};
use axum::{
    body::{to_bytes, Body},
    extract::{Request as AxumRequest, State},
    http::{Method, Request, StatusCode},
    middleware::Next,
    response::Response,
    Router,
};
use chrono::Utc;
use mongodb::bson::oid::ObjectId;
use serde_json::{json, Value};
use shared::errors::AuthError;
use shared::models::{JwtClaims, LoginRequest, LoginResponse, User};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower::ServiceExt;
use tower_http::cors::{Any, CorsLayer};

// Import from the lib.rs
use api_gateway::error::AppError;
use api_gateway::AppState;

/// Test user storage for custom auth middleware
static TEST_USERS: std::sync::OnceLock<Arc<RwLock<HashMap<String, User>>>> =
    std::sync::OnceLock::new();

/// Get or initialize the test users storage
fn get_test_users() -> &'static Arc<RwLock<HashMap<String, User>>> {
    TEST_USERS.get_or_init(|| Arc::new(RwLock::new(HashMap::new())))
}

/// Custom auth middleware for tests that uses in-memory user storage
pub async fn test_auth_middleware(
    State(_state): State<AppState>,
    mut req: AxumRequest,
    next: Next,
) -> Result<Response, AppError> {
    let auth_header = req
        .headers()
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .ok_or(AppError::from(AuthError::Unauthorized))?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(AppError::from(AuthError::InvalidToken))?;

    // Verify token using the test JWT secret
    let claims = verify_test_token(token).map_err(|_| AppError::from(AuthError::InvalidToken))?;

    // Get user from test storage
    let test_users = get_test_users().read().await;
    let user = test_users
        .get(&claims.sub)
        .ok_or(AppError::from(AuthError::Unauthorized))?
        .clone();
    drop(test_users);

    // Insert user into request extensions
    tracing::debug!(
        "Test authenticated user: {} ({})",
        user.username,
        user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default()
    );
    req.extensions_mut().insert(user);

    Ok(next.run(req).await)
}

/// Verify test JWT token
fn verify_test_token(token: &str) -> Result<JwtClaims, AuthError> {
    use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};

    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;

    decode::<JwtClaims>(
        token,
        &DecodingKey::from_secret("test_jwt_secret_key_for_testing_only".as_ref()),
        &validation,
    )
    .map(|token_data| token_data.claims)
    .map_err(|_| AuthError::InvalidCredentials)
}

/// Create a test app instance with mock services
pub async fn create_test_app() -> Router {
    create_test_app_with_mock_auth().await
}

/// Create a test app with mock authentication (no real DB connections)
pub async fn create_test_app_with_mock_auth() -> Router {
    // Create mock Redis client (no actual connection)
    let mock_redis_uri = "redis://mock-for-testing:6379/1";
    let redis_client =
        Arc::new(redis::Client::open(mock_redis_uri).expect("Failed to create mock Redis client"));

    // Create a minimal in-memory MongoDB client for testing
    let _mock_mongo_uri = "mongodb://mock-host:27017";
    let mongo_client = Arc::new(
        mongodb::Client::with_options(
            mongodb::options::ClientOptions::builder()
                .hosts(vec![mongodb::options::ServerAddress::Tcp {
                    host: "mock-host".to_string(),
                    port: Some(27017),
                }])
                .server_selection_timeout(std::time::Duration::from_millis(100))
                .build(),
        )
        .expect("Failed to create mock MongoDB client"),
    );

    // Create a real AuthService but with mock database
    let db = mongo_client.database("test_db");
    let auth_service = Arc::new(AuthService::new(
        &db,
        "test_jwt_secret_key_for_testing_only",
        "test_client_id".to_string(),
        "test_client_secret".to_string(),
    ));

    let app_state = AppState {
        redis_client,
        mongo_client,
        auth_service,
        rooms: Arc::new(RwLock::new(HashMap::new())),
    };

    // Create a custom router with test auth middleware
    create_test_router(app_state)
}

/// Create a test router that uses test auth middleware instead of real auth
fn create_test_router(app_state: AppState) -> Router {
    // Import required modules for router creation
    use api_gateway::rooms;

    let app = Router::new()
        .route("/health", get(test_health_check))
        .route("/api/v1/auth/login", get(test_login))
        .route("/api/v1/auth/callback", post(test_auth_callback))
        .route("/api/v1/auth/me", get(test_get_current_user))
        .route("/ws", get(test_websocket_placeholder))
        // Public room routes (no auth required)
        .route("/api/v1/rooms", get(rooms::list_rooms))
        .route("/api/v1/rooms/:room_code", get(rooms::get_room))
        // Protected room routes (use test auth middleware)
        .nest(
            "/api/v1/rooms",
            Router::new()
                .route("/", post(rooms::create_room))
                .route("/:room_code/join", post(rooms::join_room))
                .route("/:room_code/leave", post(rooms::leave_room))
                .route_layer(from_fn_with_state(app_state.clone(), test_auth_middleware)),
        )
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(app_state);

    app
}

// Test endpoint implementations (simplified versions)
async fn test_health_check() -> axum::Json<serde_json::Value> {
    axum::Json(json!({"status": "healthy", "version": "test"}))
}

async fn test_login() -> axum::Json<serde_json::Value> {
    axum::Json(
        json!({"auth_url": "https://id.twitch.tv/oauth2/authorize?client_id=test&redirect_uri=test&response_type=code&scope=user:read:email"}),
    )
}

async fn test_auth_callback(
    axum::Json(_request): axum::Json<LoginRequest>,
) -> Result<axum::Json<LoginResponse>, AppError> {
    Err(AppError::from(AuthError::InvalidCredentials))
}

async fn test_get_current_user() -> Result<axum::Json<serde_json::Value>, AppError> {
    Err(AppError::from(AuthError::Unauthorized))
}

async fn test_websocket_placeholder() -> (StatusCode, &'static str) {
    (
        StatusCode::NOT_IMPLEMENTED,
        "WebSocket endpoint not implemented",
    )
}

/// Create a test user and return their JWT token
pub async fn create_test_user(_app: &Router, username: &str) -> String {
    // Create a mock user
    let user = User {
        id: Some(ObjectId::new()),
        twitch_id: format!("twitch_{username}"),
        username: username.to_string(),
        display_name: username.to_string(),
        profile_image_url: Some("https://example.com/avatar.png".to_string()),
        email: Some(format!("{username}@test.com")),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    // Add user to test storage
    let user_id = user.id.unwrap().to_hex();
    let test_users = get_test_users();
    let mut users = test_users.write().await;
    users.insert(user_id.clone(), user.clone());
    drop(users);

    // Create JWT token
    create_test_jwt_token(&user)
}

/// Create a test JWT token for a user
fn create_test_jwt_token(user: &User) -> String {
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    use shared::models::JwtClaims;

    let claims = JwtClaims {
        sub: user.id.unwrap().to_hex(),
        twitch_id: user.twitch_id.clone(),
        username: user.username.clone(),
        exp: Utc::now().timestamp() + 3600, // 1 hour
        iat: Utc::now().timestamp(),
    };

    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret("test_jwt_secret_key_for_testing_only".as_ref()),
    )
    .expect("Failed to create test JWT token")
}

/// Clean up test user storage
pub async fn cleanup_test_users() {
    let test_users = get_test_users();
    let mut users = test_users.write().await;
    users.clear();
}

/// Helper to create a test room and return the room code
pub async fn create_test_room(
    app: &Router,
    auth_token: &str,
    name: &str,
    max_players: u8,
) -> String {
    let create_request = json!({
        "name": name,
        "max_players": max_players
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/rooms")
                .header("Authorization", format!("Bearer {auth_token}"))
                .header("Content-Type", "application/json")
                .body(Body::from(create_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let response_json: Value = serde_json::from_slice(&body).unwrap();

    response_json["room_code"].as_str().unwrap().to_string()
}

/// Helper to join a room and return the response
pub async fn join_test_room(
    app: &Router,
    auth_token: &str,
    room_code: &str,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(format!("/api/v1/rooms/{room_code}/join"))
                .header("Authorization", format!("Bearer {auth_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();

    let response_json: Value = if body.is_empty() {
        json!({})
    } else {
        serde_json::from_slice(&body).unwrap_or(json!({}))
    };

    (status, response_json)
}

/// Helper to get room info
pub async fn get_test_room(app: &Router, room_code: &str) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri(format!("/api/v1/rooms/{room_code}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();

    let response_json: Value = if body.is_empty() {
        json!({})
    } else {
        serde_json::from_slice(&body).unwrap_or(json!({}))
    };

    (status, response_json)
}

/// Helper to leave a room
pub async fn leave_test_room(app: &Router, auth_token: &str, room_code: &str) -> StatusCode {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(format!("/api/v1/rooms/{room_code}/leave"))
                .header("Authorization", format!("Bearer {auth_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    response.status()
}

/// Clean up test data (rooms, users, etc.)
pub async fn cleanup_test_data() {
    // For in-memory storage, cleanup happens automatically when the app is dropped
    // If using real databases in tests, implement cleanup logic here
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_helpers_work() {
        let app = create_test_app().await;
        let token = create_test_user(&app, "test_helper_user").await;

        assert!(!token.is_empty());
        assert!(token.contains('.')); // JWT tokens contain dots
    }
}
