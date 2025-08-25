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
    Admin,  // Room creator, observer
    Player, // Regular player
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
    pub admin_id: String, // User ID of the room creator/admin
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

// Team models for Alias game
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub id: String,
    pub name: String,
    pub color: String,
    pub players: Vec<String>, // User IDs
    pub score: i32,
    pub is_ready: bool,
}

// Player role within a team during game
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GameRole {
    Explainer, // Currently explaining words
    Guesser,   // Currently guessing words
}

// Word result tracking
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WordResult {
    Correct,
    Skipped,
    Penalty, // For violations or wrong actions
}

// Single word in a round
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameWord {
    pub word: String,
    pub difficulty: String,
    pub category: Option<String>,
    pub result: Option<WordResult>,
    pub time_spent: Option<u32>, // Seconds spent on this word
}

// Game round
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Round {
    pub round_number: u32,
    pub team_id: String,
    pub explainer_id: String,
    pub words: Vec<GameWord>,
    pub timer_seconds: u32,
    pub time_remaining: u32,
    pub score_gained: i32,
    pub started_at: Option<DateTime<Utc>>,
    pub ended_at: Option<DateTime<Utc>>,
}

// Game settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSettings {
    pub round_duration_seconds: u32,
    pub words_per_round: u32,
    pub skip_penalty_after: u32, // Penalty after N skips
    pub win_score: i32,
    pub difficulty: String, // easy, medium, hard, mixed
}

impl Default for GameSettings {
    fn default() -> Self {
        Self {
            round_duration_seconds: 60,
            words_per_round: 20,
            skip_penalty_after: 3,
            win_score: 50,
            difficulty: "mixed".to_string(),
        }
    }
}

// Complete game state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameState {
    pub teams: Vec<Team>,
    pub current_round: Option<Round>,
    pub round_history: Vec<Round>,
    pub current_team_index: usize,
    pub current_word_index: usize,
    pub used_words: Vec<String>,
    pub settings: GameSettings,
    pub winner_team_id: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub ended_at: Option<DateTime<Utc>>,
}

// Team assignment request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinTeamRequest {
    pub team_id: String,
}

// Game start request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartGameRequest {
    pub settings: Option<GameSettings>,
}

// Word action request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordActionRequest {
    pub word_result: WordResult,
}

// WebSocket messages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WebSocketMessage {
    // Client to server
    Authenticate {
        token: String,
    },
    RequestRoomList,
    JoinRoom {
        room_code: String,
    },
    LeaveRoom,
    KickPlayer {
        user_id: String,
    },
    UpdateRole {
        user_id: String,
        role: UserRole,
    },
    StartGame,
    PauseGame,
    ResumeGame,
    Ping,

    // Game-specific messages
    JoinTeam {
        team_id: String,
    },
    LeaveTeam,
    MarkReady,
    StartRound,
    WordAction {
        result: WordResult,
    },
    RequestNewWord,
    EndRound,

    // Server to client
    Authenticated {
        user: UserInfo,
    },
    Pong,
    RoomList {
        rooms: Vec<RoomInfo>,
    },
    RoomJoined {
        room: GameRoom,
    },
    RoomUpdated {
        room: GameRoom,
    },
    RoomCreated {
        room_info: RoomInfo,
    },
    RoomDeleted {
        room_code: String,
    },
    RoomInfoUpdated {
        room_info: RoomInfo,
    },
    UserJoined {
        participant: RoomParticipant,
    },
    UserLeft {
        user_id: String,
    },
    UserKicked {
        user_id: String,
        kicked_by: String,
    },
    RoleUpdated {
        user_id: String,
        role: UserRole,
    },
    GameStarted,
    GamePaused,
    GameResumed,
    Error {
        message: String,
    },

    // Game-specific server messages
    TeamJoined {
        team: Team,
        user_id: String,
    },
    TeamLeft {
        team_id: String,
        user_id: String,
    },
    TeamReady {
        team_id: String,
    },
    TeamsUpdated {
        teams: Vec<Team>,
    },
    RoundStarted {
        round: Round,
    },
    WordReceived {
        word: GameWord,
    },
    WordResultRecorded {
        result: WordResult,
        score_change: i32,
    },
    TimerUpdate {
        time_remaining: u32,
    },
    RoundEnded {
        round: Round,
        next_team_id: Option<String>,
    },
    GameEnded {
        winner_team: Team,
        final_scores: Vec<Team>,
    },
    GameStateUpdated {
        game_state: GameState,
    },
}

impl WebSocketMessage {
    pub fn type_name(&self) -> &'static str {
        match self {
            // Client messages
            WebSocketMessage::Authenticate { .. } => "authenticate",
            WebSocketMessage::RequestRoomList => "request_room_list",
            WebSocketMessage::JoinRoom { .. } => "join_room",
            WebSocketMessage::LeaveRoom => "leave_room",
            WebSocketMessage::KickPlayer { .. } => "kick_player",
            WebSocketMessage::UpdateRole { .. } => "update_role",
            WebSocketMessage::StartGame => "start_game",
            WebSocketMessage::PauseGame => "pause_game",
            WebSocketMessage::ResumeGame => "resume_game",
            WebSocketMessage::Ping => "ping",
            WebSocketMessage::JoinTeam { .. } => "join_team",
            WebSocketMessage::LeaveTeam => "leave_team",
            WebSocketMessage::MarkReady => "mark_ready",
            WebSocketMessage::StartRound => "start_round",
            WebSocketMessage::WordAction { .. } => "word_action",
            WebSocketMessage::RequestNewWord => "request_new_word",
            WebSocketMessage::EndRound => "end_round",

            // Server messages
            WebSocketMessage::Authenticated { .. } => "authenticated",
            WebSocketMessage::Pong => "pong",
            WebSocketMessage::RoomList { .. } => "room_list",
            WebSocketMessage::RoomJoined { .. } => "room_joined",
            WebSocketMessage::RoomUpdated { .. } => "room_updated",
            WebSocketMessage::RoomCreated { .. } => "room_created",
            WebSocketMessage::RoomDeleted { .. } => "room_deleted",
            WebSocketMessage::RoomInfoUpdated { .. } => "room_info_updated",
            WebSocketMessage::UserJoined { .. } => "user_joined",
            WebSocketMessage::UserLeft { .. } => "user_left",
            WebSocketMessage::UserKicked { .. } => "user_kicked",
            WebSocketMessage::RoleUpdated { .. } => "role_updated",
            WebSocketMessage::GameStarted => "game_started",
            WebSocketMessage::GamePaused => "game_paused",
            WebSocketMessage::GameResumed => "game_resumed",
            WebSocketMessage::Error { .. } => "error",
            WebSocketMessage::TeamJoined { .. } => "team_joined",
            WebSocketMessage::TeamLeft { .. } => "team_left",
            WebSocketMessage::TeamReady { .. } => "team_ready",
            WebSocketMessage::TeamsUpdated { .. } => "teams_updated",
            WebSocketMessage::RoundStarted { .. } => "round_started",
            WebSocketMessage::WordReceived { .. } => "word_received",
            WebSocketMessage::WordResultRecorded { .. } => "word_result_recorded",
            WebSocketMessage::TimerUpdate { .. } => "timer_update",
            WebSocketMessage::RoundEnded { .. } => "round_ended",
            WebSocketMessage::GameEnded { .. } => "game_ended",
            WebSocketMessage::GameStateUpdated { .. } => "game_state_updated",
        }
    }
}
