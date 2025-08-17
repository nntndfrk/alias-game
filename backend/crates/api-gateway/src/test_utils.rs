use axum::{
    extract::{Path, State},
    response::Json,
};
use chrono::Utc;
use mongodb::bson::oid::ObjectId;
use shared::models::{User, GameRoom, RoomParticipant, UserRole};

use crate::{AppState, error::AppError};

/// Test endpoint to simulate joining a room
/// WARNING: This should only be used in development!
#[cfg(debug_assertions)]
pub async fn test_join_room(
    State(state): State<AppState>,
    Path(room_code): Path<String>,
) -> Result<Json<GameRoom>, AppError> {
    // Create a test user
    let test_user = User {
        id: Some(ObjectId::new()),
        twitch_id: "test_user_2".to_string(),
        username: "test_player".to_string(),
        display_name: "Test Player".to_string(),
        profile_image_url: Some("https://via.placeholder.com/150".to_string()),
        email: Some("test@example.com".to_string()),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    
    let user_id = test_user.id.unwrap().to_hex();
    let mut rooms = state.rooms.write().await;
    
    let room = rooms
        .get_mut(&room_code)
        .ok_or_else(|| AppError::not_found("Room not found".into()))?;

    // Check if room is full
    if room.participants.len() >= room.max_players as usize {
        return Err(AppError::bad_request("Room is full".into()));
    }

    // Add test user as a player
    let participant = RoomParticipant {
        user_id: user_id.clone(),
        username: test_user.username.clone(),
        display_name: test_user.display_name.clone(),
        profile_image_url: test_user.profile_image_url.clone(),
        role: UserRole::Player,
        team_id: None,
        is_connected: true,
        joined_at: Utc::now(),
    };

    room.participants.insert(user_id, participant);
    room.updated_at = Utc::now();

    Ok(Json(room.clone()))
}