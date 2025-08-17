use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub twitch_id: String,
    pub username: String,
    pub display_name: String,
    pub profile_image_url: Option<String>,
    pub email: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: String, // User ID
    pub twitch_id: String,
    pub username: String,
    pub exp: i64,
    pub iat: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginRequest {
    pub code: String,
    pub redirect_uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResponse {
    pub access_token: String,
    pub user: UserInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub profile_image_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TwitchTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: i64,
    pub scope: Vec<String>,
    pub token_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TwitchUserResponse {
    pub data: Vec<TwitchUser>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TwitchUser {
    pub id: String,
    pub login: String,
    pub display_name: String,
    pub profile_image_url: String,
    pub email: Option<String>,
}

impl From<User> for UserInfo {
    fn from(user: User) -> Self {
        UserInfo {
            id: user.id.map(|id| id.to_hex()).unwrap_or_default(),
            username: user.username,
            display_name: user.display_name,
            profile_image_url: user.profile_image_url,
        }
    }
}

// User roles in a game room
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UserRole {
    Admin,    // Room creator, observer
    Player,   // Regular player
}

// Game room participant
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomParticipant {
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub profile_image_url: Option<String>,
    pub role: UserRole,
    pub team_id: Option<String>,
    pub is_connected: bool,
    pub joined_at: DateTime<Utc>,
}

// Game room states
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoomState {
    Waiting,    // Waiting for players
    Ready,      // All teams ready
    InProgress, // Game in progress
    Paused,     // Game paused
    Finished,   // Game finished
}

// Game room
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameRoom {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub room_code: String,
    pub name: String,
    pub admin_id: String,  // User ID of the room creator/admin
    pub participants: HashMap<String, RoomParticipant>,
    pub state: RoomState,
    pub max_players: u8,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub game_data: Option<serde_json::Value>, // Game-specific data
}

// Room creation request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRoomRequest {
    pub name: String,
    pub max_players: u8,
}

// Room creation response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRoomResponse {
    pub room_id: String,
    pub room_code: String,
    pub name: String,
    pub admin_id: String,
}

// Join room request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinRoomRequest {
    pub room_code: String,
}

// Room info for listing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomInfo {
    pub id: String,
    pub room_code: String,
    pub name: String,
    pub current_players: usize,
    pub max_players: u8,
    pub state: RoomState,
    pub admin_username: String,
}

// WebSocket messages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WebSocketMessage {
    // Client to server
    JoinRoom { room_code: String },
    LeaveRoom,
    UpdateRole { user_id: String, role: UserRole },
    StartGame,
    PauseGame,
    ResumeGame,
    
    // Server to client
    RoomJoined { room: GameRoom },
    RoomUpdated { room: GameRoom },
    UserJoined { participant: RoomParticipant },
    UserLeft { user_id: String },
    RoleUpdated { user_id: String, role: UserRole },
    GameStarted,
    GamePaused,
    GameResumed,
    Error { message: String },
}
