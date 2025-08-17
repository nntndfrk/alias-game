use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    response::Json,
};
use chrono::Utc;
use mongodb::bson::oid::ObjectId;
use rand::Rng;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use shared::models::{
    CreateRoomRequest, CreateRoomResponse, GameRoom, RoomInfo, RoomParticipant, RoomState, User,
    UserRole,
};

use crate::error::AppError;
use crate::AppState;

// Removed unused type alias

/// Generate a unique room code
fn generate_room_code() -> String {
    let mut rng = rand::thread_rng();
    (0..6)
        .map(|_| {
            let n = rng.gen_range(0..36);
            if n < 10 {
                (b'0' + n) as char
            } else {
                (b'A' + n - 10) as char
            }
        })
        .collect()
}

/// Create a new game room
pub async fn create_room(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(req): Json<CreateRoomRequest>,
) -> Result<Json<CreateRoomResponse>, AppError> {
    // Validate max players
    if req.max_players < 4 || req.max_players > 10 {
        return Err(AppError::bad_request(
            "Max players must be between 4 and 10".into(),
        ));
    }

    let room_code = generate_room_code();
    let room_id = ObjectId::new();
    let user_id = user.id.unwrap().to_hex();

    // Create room participant for the creator (admin)
    let admin_participant = RoomParticipant {
        user_id: user_id.clone(),
        username: user.username.clone(),
        display_name: user.display_name.clone(),
        profile_image_url: user.profile_image_url.clone(),
        role: UserRole::Admin,
        team_id: None,
        is_connected: true,
        joined_at: Utc::now(),
    };

    // Create the game room
    let room = GameRoom {
        id: Some(room_id),
        room_code: room_code.clone(),
        name: req.name.clone(),
        admin_id: user_id.clone(),
        participants: {
            let mut participants = HashMap::new();
            participants.insert(user_id.clone(), admin_participant);
            participants
        },
        state: RoomState::Waiting,
        max_players: req.max_players,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        game_data: None,
    };

    // Store room in memory (later we'll use Redis)
    let mut rooms = state.rooms.write().await;
    rooms.insert(room_code.clone(), room.clone());

    Ok(Json(CreateRoomResponse {
        room_id: room_id.to_hex(),
        room_code,
        name: req.name,
        admin_id: user_id,
    }))
}

/// Join an existing room
pub async fn join_room(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(room_code): Path<String>,
) -> Result<Json<GameRoom>, AppError> {
    let user_id = user.id.unwrap().to_hex();
    let mut rooms = state.rooms.write().await;

    let room = rooms
        .get_mut(&room_code)
        .ok_or_else(|| AppError::not_found("Room not found".into()))?;

    // Check if room is full
    if room.participants.len() >= room.max_players as usize {
        return Err(AppError::bad_request("Room is full".into()));
    }

    // Check if user is already in the room
    if room.participants.contains_key(&user_id) {
        return Ok(Json(room.clone()));
    }

    // Add user as a player
    let participant = RoomParticipant {
        user_id: user_id.clone(),
        username: user.username.clone(),
        display_name: user.display_name.clone(),
        profile_image_url: user.profile_image_url.clone(),
        role: UserRole::Player,
        team_id: None,
        is_connected: true,
        joined_at: Utc::now(),
    };

    room.participants.insert(user_id.clone(), participant);
    room.updated_at = Utc::now();

    tracing::info!(
        "User {} joined room {}. Total participants: {}",
        user_id,
        room_code,
        room.participants.len()
    );

    Ok(Json(room.clone()))
}

/// Get room info
pub async fn get_room(
    State(state): State<AppState>,
    Path(room_code): Path<String>,
) -> Result<Json<GameRoom>, AppError> {
    let rooms = state.rooms.read().await;

    let room = rooms
        .get(&room_code)
        .ok_or_else(|| AppError::not_found("Room not found".into()))?;

    tracing::info!(
        "Getting room {} info. Participants: {}",
        room_code,
        room.participants.len()
    );

    Ok(Json(room.clone()))
}

/// List available rooms
pub async fn list_rooms(State(state): State<AppState>) -> Result<Json<Vec<RoomInfo>>, AppError> {
    let rooms = state.rooms.read().await;

    let room_list: Vec<RoomInfo> = rooms
        .values()
        .map(|room| {
            let admin = room
                .participants
                .get(&room.admin_id)
                .map(|p| p.username.clone())
                .unwrap_or_default();

            RoomInfo {
                id: room.id.map(|id| id.to_hex()).unwrap_or_default(),
                room_code: room.room_code.clone(),
                name: room.name.clone(),
                current_players: room.participants.len(),
                max_players: room.max_players,
                state: room.state,
                admin_username: admin,
            }
        })
        .collect();

    Ok(Json(room_list))
}

/// Leave a room
pub async fn leave_room(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(room_code): Path<String>,
) -> Result<StatusCode, AppError> {
    let user_id = user.id.unwrap().to_hex();
    let mut rooms = state.rooms.write().await;

    let room = rooms
        .get_mut(&room_code)
        .ok_or_else(|| AppError::not_found("Room not found".into()))?;

    // Remove the participant
    room.participants.remove(&user_id);
    room.updated_at = Utc::now();

    // If admin leaves, transfer admin role or delete room if empty
    if room.admin_id == user_id {
        if let Some((new_admin_id, participant)) = room.participants.iter_mut().next() {
            // Transfer admin role to another participant
            participant.role = UserRole::Admin;
            room.admin_id = new_admin_id.clone();
        } else {
            // Remove empty room
            rooms.remove(&room_code);
        }
    }

    Ok(StatusCode::OK)
}
