use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use serde_json::{json, Value};
use tower::ServiceExt;

mod test_helpers;
use test_helpers::*;

#[tokio::test]
async fn test_room_creation_broadcasts_to_lobby() {
    let app = create_test_app().await;
    let user1_token = create_test_user(&app, "user1").await;
    let user2_token = create_test_user(&app, "user2").await;

    // Create first room
    let room1_code = create_test_room(&app, &user1_token, "Room 1", 8).await;

    // Create second room
    let room2_code = create_test_room(&app, &user2_token, "Room 2", 6).await;

    // List rooms - should see both
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

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let rooms: Value = serde_json::from_slice(&body).unwrap();
    let rooms_array = rooms.as_array().unwrap();

    assert_eq!(rooms_array.len(), 2);

    // Verify both rooms are in the list
    let room_codes: Vec<&str> = rooms_array
        .iter()
        .map(|r| r["room_code"].as_str().unwrap())
        .collect();
    assert!(room_codes.contains(&room1_code.as_str()));
    assert!(room_codes.contains(&room2_code.as_str()));
}

#[tokio::test]
async fn test_room_deletion_when_empty() {
    let app = create_test_app().await;
    let admin_token = create_test_user(&app, "admin").await;
    let player_token = create_test_user(&app, "player").await;

    // Create room
    let room_code = create_test_room(&app, &admin_token, "Test Room", 8).await;

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

    // List rooms - should have one room with 2 players
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

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let rooms: Value = serde_json::from_slice(&body).unwrap();
    let rooms_array = rooms.as_array().unwrap();
    assert_eq!(rooms_array.len(), 1);
    assert_eq!(rooms_array[0]["current_players"], 2);

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

    // List rooms - should still have room with 1 player
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

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let rooms: Value = serde_json::from_slice(&body).unwrap();
    let rooms_array = rooms.as_array().unwrap();
    assert_eq!(rooms_array.len(), 1);
    assert_eq!(rooms_array[0]["current_players"], 1);

    // Admin leaves - room should be deleted
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

    // List rooms - should be empty
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

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let rooms: Value = serde_json::from_slice(&body).unwrap();
    let rooms_array = rooms.as_array().unwrap();
    assert_eq!(rooms_array.len(), 0);
}

#[tokio::test]
async fn test_room_info_updates_on_player_join_leave() {
    let app = create_test_app().await;
    let admin_token = create_test_user(&app, "admin").await;
    let player1_token = create_test_user(&app, "player1").await;
    let player2_token = create_test_user(&app, "player2").await;

    // Create room
    let room_code = create_test_room(&app, &admin_token, "Update Test", 6).await;

    // Initial state - 1 player
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

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let rooms: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(rooms[0]["current_players"], 1);

    // Player 1 joins - should have 2 players
    let _ = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(&format!("/api/v1/rooms/{}/join", room_code))
                .header("Authorization", format!("Bearer {}", player1_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

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

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let rooms: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(rooms[0]["current_players"], 2);

    // Player 2 joins - should have 3 players
    let _ = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(&format!("/api/v1/rooms/{}/join", room_code))
                .header("Authorization", format!("Bearer {}", player2_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

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

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let rooms: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(rooms[0]["current_players"], 3);

    // Player 1 leaves - should have 2 players
    let _ = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(&format!("/api/v1/rooms/{}/leave", room_code))
                .header("Authorization", format!("Bearer {}", player1_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

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

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let rooms: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(rooms[0]["current_players"], 2);
}

#[tokio::test]
async fn test_multiple_rooms_independent_management() {
    let app = create_test_app().await;
    let admin1_token = create_test_user(&app, "admin1").await;
    let admin2_token = create_test_user(&app, "admin2").await;
    let player_token = create_test_user(&app, "player").await;

    // Create two rooms
    let room1_code = create_test_room(&app, &admin1_token, "Room A", 8).await;
    let room2_code = create_test_room(&app, &admin2_token, "Room B", 6).await;

    // Player joins room 1
    let _ = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(&format!("/api/v1/rooms/{}/join", room1_code))
                .header("Authorization", format!("Bearer {}", player_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // List rooms - room 1 should have 2 players, room 2 should have 1
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

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let rooms: Value = serde_json::from_slice(&body).unwrap();
    let rooms_array = rooms.as_array().unwrap();

    assert_eq!(rooms_array.len(), 2);

    // Find room 1 and verify player count
    let room1 = rooms_array
        .iter()
        .find(|r| r["room_code"] == room1_code)
        .unwrap();
    assert_eq!(room1["current_players"], 2);

    // Find room 2 and verify player count
    let room2 = rooms_array
        .iter()
        .find(|r| r["room_code"] == room2_code)
        .unwrap();
    assert_eq!(room2["current_players"], 1);
}
