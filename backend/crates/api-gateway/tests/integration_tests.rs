use axum::{
    body::{to_bytes, Body},
    http::{Method, Request, StatusCode},
};
use serde_json::{json, Value};
use tower::ServiceExt;

mod test_helpers;
use test_helpers::*;

#[tokio::test]
async fn test_room_creation_flow() {
    let app = create_test_app().await;
    let auth_token = create_test_user(&app, "test_user_1").await;

    // Test successful room creation
    let create_request = json!({
        "name": "Test Room",
        "max_players": 8
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/rooms")
                .header("Authorization", format!("Bearer {}", auth_token))
                .header("Content-Type", "application/json")
                .body(Body::from(create_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let response_json: Value = serde_json::from_slice(&body).unwrap();

    assert!(response_json["room_code"].is_string());
    assert_eq!(response_json["name"], "Test Room");
    assert!(response_json["room_id"].is_string());
}

#[tokio::test]
async fn test_room_creation_validation() {
    let app = create_test_app().await;
    let auth_token = create_test_user(&app, "test_user_1").await;

    // Test invalid max_players (too low)
    let invalid_request = json!({
        "name": "Test Room",
        "max_players": 3
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/rooms")
                .header("Authorization", format!("Bearer {}", auth_token))
                .header("Content-Type", "application/json")
                .body(Body::from(invalid_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    // Test invalid max_players (too high)
    let invalid_request = json!({
        "name": "Test Room",
        "max_players": 15
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/rooms")
                .header("Authorization", format!("Bearer {}", auth_token))
                .header("Content-Type", "application/json")
                .body(Body::from(invalid_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_room_join_flow() {
    let app = create_test_app().await;
    let admin_token = create_test_user(&app, "admin_user").await;
    let player_token = create_test_user(&app, "player_user").await;

    // Create a room
    let room_code = create_test_room(&app, &admin_token, "Test Room", 8).await;

    // Join the room
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(&format!("/api/v1/rooms/{}/join", room_code))
                .header("Authorization", format!("Bearer {}", player_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let room: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(room["room_code"], room_code);
    assert_eq!(room["participants"].as_object().unwrap().len(), 2);

    // Verify both admin and player are in participants
    let participants = room["participants"].as_object().unwrap();
    assert!(participants.iter().any(|(_, p)| p["role"] == "admin"));
    assert!(participants.iter().any(|(_, p)| p["role"] == "player"));
}

#[tokio::test]
async fn test_room_join_nonexistent() {
    let app = create_test_app().await;
    let token = create_test_user(&app, "test_user").await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/rooms/NONEXISTENT/join")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_room_join_already_member() {
    let app = create_test_app().await;
    let token = create_test_user(&app, "test_user").await;

    // Create a room (user becomes admin)
    let room_code = create_test_room(&app, &token, "Test Room", 8).await;

    // Try to join the same room again
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(&format!("/api/v1/rooms/{}/join", room_code))
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let room: Value = serde_json::from_slice(&body).unwrap();

    // Should still have only 1 participant (no duplicate)
    assert_eq!(room["participants"].as_object().unwrap().len(), 1);
}

#[tokio::test]
async fn test_room_join_full_room() {
    let app = create_test_app().await;
    let admin_token = create_test_user(&app, "admin_user").await;

    // Create a room with max 4 players
    let room_code = create_test_room(&app, &admin_token, "Small Room", 4).await;

    // Fill the room with 3 more players
    for i in 1..4 {
        let token = create_test_user(&app, &format!("player_{}", i)).await;
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(&format!("/api/v1/rooms/{}/join", room_code))
                    .header("Authorization", format!("Bearer {}", token))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    // Try to add one more player (should fail)
    let extra_token = create_test_user(&app, "extra_player").await;
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(&format!("/api/v1/rooms/{}/join", room_code))
                .header("Authorization", format!("Bearer {}", extra_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_get_room_info() {
    let app = create_test_app().await;
    let token = create_test_user(&app, "test_user").await;

    // Create a room
    let room_code = create_test_room(&app, &token, "Info Room", 6).await;

    // Get room info (public endpoint)
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri(&format!("/api/v1/rooms/{}", room_code))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let room: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(room["room_code"], room_code);
    assert_eq!(room["name"], "Info Room");
    assert_eq!(room["max_players"], 6);
    assert_eq!(room["state"], "waiting");
}

#[tokio::test]
async fn test_get_nonexistent_room() {
    let app = create_test_app().await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/rooms/NOTFOUND")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_list_rooms() {
    let app = create_test_app().await;
    let token1 = create_test_user(&app, "user1").await;
    let token2 = create_test_user(&app, "user2").await;

    // Create multiple rooms
    let room1 = create_test_room(&app, &token1, "Room One", 6).await;
    let room2 = create_test_room(&app, &token2, "Room Two", 8).await;

    // List rooms (public endpoint)
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/rooms")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let rooms: Value = serde_json::from_slice(&body).unwrap();

    let rooms_array = rooms.as_array().unwrap();
    assert_eq!(rooms_array.len(), 2);

    // Verify room information
    let room_codes: Vec<&str> = rooms_array
        .iter()
        .map(|r| r["room_code"].as_str().unwrap())
        .collect();
    assert!(room_codes.contains(&room1.as_str()));
    assert!(room_codes.contains(&room2.as_str()));
}

#[tokio::test]
async fn test_leave_room() {
    let app = create_test_app().await;
    let admin_token = create_test_user(&app, "admin_user").await;
    let player_token = create_test_user(&app, "player_user").await;

    // Create room and join
    let room_code = create_test_room(&app, &admin_token, "Leave Test", 8).await;

    // Player joins
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(&format!("/api/v1/rooms/{}/join", room_code))
                .header("Authorization", format!("Bearer {}", player_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // Player leaves
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(&format!("/api/v1/rooms/{}/leave", room_code))
                .header("Authorization", format!("Bearer {}", player_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify room still exists with only admin
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri(&format!("/api/v1/rooms/{}", room_code))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let room: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(room["participants"].as_object().unwrap().len(), 1);
}

#[tokio::test]
async fn test_admin_leaves_room_deletion() {
    let app = create_test_app().await;
    let admin_token = create_test_user(&app, "admin_user").await;

    // Create room
    let room_code = create_test_room(&app, &admin_token, "Admin Leave Test", 8).await;

    // Admin leaves (should delete room)
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(&format!("/api/v1/rooms/{}/leave", room_code))
                .header("Authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify room no longer exists
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri(&format!("/api/v1/rooms/{}", room_code))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_admin_leaves_room_transfer() {
    let app = create_test_app().await;
    let admin_token = create_test_user(&app, "admin_user").await;
    let player_token = create_test_user(&app, "player_user").await;

    // Create room and have player join
    let room_code = create_test_room(&app, &admin_token, "Admin Transfer Test", 8).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(&format!("/api/v1/rooms/{}/join", room_code))
                .header("Authorization", format!("Bearer {}", player_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // Admin leaves (should transfer admin to player)
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(&format!("/api/v1/rooms/{}/leave", room_code))
                .header("Authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify room still exists with transferred admin
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri(&format!("/api/v1/rooms/{}", room_code))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let room: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(room["participants"].as_object().unwrap().len(), 1);

    // The remaining participant should be admin
    let participants = room["participants"].as_object().unwrap();
    let remaining_participant = participants.values().next().unwrap();
    assert_eq!(remaining_participant["role"], "admin");
}

#[tokio::test]
async fn test_unauthorized_access() {
    let app = create_test_app().await;

    // Try to create room without auth
    let create_request = json!({
        "name": "Test Room",
        "max_players": 8
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/rooms")
                .header("Content-Type", "application/json")
                .body(Body::from(create_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    // Try to join room without auth
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/rooms/TESTCODE/join")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    // Try to leave room without auth
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/rooms/TESTCODE/leave")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_invalid_token() {
    let app = create_test_app().await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/rooms")
                .header("Authorization", "Bearer invalid_token")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    json!({"name": "Test", "max_players": 8}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}
