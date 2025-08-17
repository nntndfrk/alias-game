use auth_service::AuthService;
use axum::{
    body::{to_bytes, Body},
    http::{Method, Request, StatusCode},
    Router,
};
use chrono::Utc;
use mongodb::bson::oid::ObjectId;
use serde_json::{json, Value};
use shared::models::User;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower::ServiceExt;

// Import from the lib.rs
use api_gateway::{create_router, AppState};

/// Create a test app instance with in-memory storage
pub async fn create_test_app() -> Router {
    // Use in-memory Redis and MongoDB for testing
    let redis_client = Arc::new(
        redis::Client::open("redis://127.0.0.1:6379/1")
            .expect("Failed to create test Redis client"),
    );

    let mongo_client = Arc::new(
        mongodb::Client::with_uri_str("mongodb://localhost:27017")
            .await
            .expect("Failed to create test MongoDB client"),
    );

    let db = mongo_client.database("alias_game_test");

    // Create auth service with test secrets
    let auth_service = Arc::new(AuthService::new(
        &db,
        "test_jwt_secret_key_for_testing_only",
        "test_twitch_client_id".to_string(),
        "test_twitch_client_secret".to_string(),
    ));

    let app_state = AppState {
        redis_client,
        mongo_client,
        auth_service,
        rooms: Arc::new(RwLock::new(HashMap::new())),
    };

    create_router(app_state)
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

    // For testing, we'll create a simple JWT token
    // In a real test environment, you'd use the actual auth service
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
