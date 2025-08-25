use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Extension, Json,
};
use game_engine::{game::GameEngine, team::TeamManager};
use serde::Serialize;
use shared::models::{
    GameState, JoinTeamRequest, StartGameRequest, Team, User, WordActionRequest, WordResult,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

use crate::{error::AppError, AppState};

#[derive(Serialize)]
struct GameResponse {
    message: String,
    game_state: Option<GameState>,
}

#[derive(Serialize)]
struct TeamResponse {
    message: String,
    teams: Vec<Team>,
}

#[derive(Serialize)]
struct RoundResponse {
    message: String,
    round_number: u32,
    team_id: String,
    explainer_id: String,
    timer_seconds: u32,
}

#[derive(Serialize)]
struct WordResponse {
    word: String,
    difficulty: String,
    category: Option<String>,
}

#[derive(Serialize)]
struct ScoreResponse {
    score_change: i32,
    team_score: i32,
    message: String,
}

// Game state storage (temporary - will be moved to Redis)
type GameEngineStorage = Arc<RwLock<std::collections::HashMap<String, Arc<RwLock<GameEngine>>>>>;

lazy_static::lazy_static! {
    pub static ref GAME_ENGINES: GameEngineStorage = Arc::new(RwLock::new(std::collections::HashMap::new()));
}

/// Initialize game for a room
pub async fn initialize_game(
    State(state): State<AppState>,
    Path(room_code): Path<String>,
    Extension(user): Extension<User>,
    Json(request): Json<StartGameRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Check if user is admin of the room
    let rooms = state.rooms.read().await;
    let room = rooms
        .get(&room_code)
        .ok_or_else(|| AppError::not_found("Room not found".to_string()))?;

    if room.admin_id != user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default() {
        return Err(AppError::forbidden(
            "Only room admin can start the game".to_string(),
        ));
    }

    // Create game engine
    let mut game_engine = GameEngine::new(&state.mongo_client, request.settings).await;

    // Initialize teams from room participants
    let mut team_manager = TeamManager::new();
    for participant in room.participants.values() {
        if participant.team_id.is_some() {
            let team_id = participant.team_id.as_ref().unwrap();
            team_manager
                .add_player_to_team(participant.user_id.clone(), team_id)
                .map_err(AppError::bad_request)?;
        }
    }

    // Validate teams are ready
    team_manager
        .validate_for_game_start()
        .map_err(AppError::bad_request)?;

    // Set teams in game engine
    game_engine.team_manager = team_manager;
    game_engine
        .start_game()
        .await
        .map_err(AppError::bad_request)?;

    // Store game engine
    let mut engines = GAME_ENGINES.write().await;
    engines.insert(room_code.clone(), Arc::new(RwLock::new(game_engine)));

    drop(rooms);

    // Get updated game state
    let engines = GAME_ENGINES.read().await;
    let engine = engines.get(&room_code).unwrap();
    let engine = engine.read().await;

    info!("Game initialized for room {}", room_code);

    Ok(Json(GameResponse {
        message: "Game started successfully".to_string(),
        game_state: Some(engine.game_state.clone()),
    }))
}

/// Get game state
pub async fn get_game_state(
    Path(room_code): Path<String>,
    Extension(_user): Extension<User>,
) -> Result<impl IntoResponse, AppError> {
    let engines = GAME_ENGINES.read().await;
    let engine = engines
        .get(&room_code)
        .ok_or_else(|| AppError::not_found("Game not found for this room".to_string()))?;

    let engine = engine.read().await;

    Ok(Json(GameResponse {
        message: "Game state retrieved".to_string(),
        game_state: Some(engine.game_state.clone()),
    }))
}

/// Join a team
pub async fn join_team(
    State(state): State<AppState>,
    Path(room_code): Path<String>,
    Extension(user): Extension<User>,
    Json(request): Json<JoinTeamRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Update room participant team
    let mut rooms = state.rooms.write().await;
    let room = rooms
        .get_mut(&room_code)
        .ok_or_else(|| AppError::not_found("Room not found".to_string()))?;

    let participant = room
        .participants
        .get_mut(&user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default())
        .ok_or_else(|| AppError::bad_request("User not in room".to_string()))?;

    participant.team_id = Some(request.team_id.clone());

    drop(rooms);

    // Update game engine if game exists
    let engines = GAME_ENGINES.read().await;
    if let Some(engine) = engines.get(&room_code) {
        let mut engine = engine.write().await;
        engine
            .team_manager
            .add_player_to_team(
                user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default(),
                &request.team_id,
            )
            .map_err(AppError::bad_request)?;

        let teams = engine.team_manager.get_teams().to_vec();

        Ok(Json(TeamResponse {
            message: format!("Joined team {}", request.team_id),
            teams,
        }))
    } else {
        Ok(Json(TeamResponse {
            message: format!("Joined team {}", request.team_id),
            teams: vec![],
        }))
    }
}

/// Leave current team
pub async fn leave_team(
    State(state): State<AppState>,
    Path(room_code): Path<String>,
    Extension(user): Extension<User>,
) -> Result<impl IntoResponse, AppError> {
    // Update room participant
    let mut rooms = state.rooms.write().await;
    let room = rooms
        .get_mut(&room_code)
        .ok_or_else(|| AppError::not_found("Room not found".to_string()))?;

    let participant = room
        .participants
        .get_mut(&user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default())
        .ok_or_else(|| AppError::bad_request("User not in room".to_string()))?;

    participant.team_id = None;

    drop(rooms);

    // Update game engine if game exists
    let engines = GAME_ENGINES.read().await;
    if let Some(engine) = engines.get(&room_code) {
        let mut engine = engine.write().await;
        engine
            .team_manager
            .remove_player(&user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default());

        let teams = engine.team_manager.get_teams().to_vec();

        Ok(Json(TeamResponse {
            message: "Left team".to_string(),
            teams,
        }))
    } else {
        Ok(Json(TeamResponse {
            message: "Left team".to_string(),
            teams: vec![],
        }))
    }
}

/// Get teams
pub async fn get_teams(
    Path(room_code): Path<String>,
    Extension(_user): Extension<User>,
) -> Result<impl IntoResponse, AppError> {
    let engines = GAME_ENGINES.read().await;
    let engine = engines
        .get(&room_code)
        .ok_or_else(|| AppError::not_found("Game not found for this room".to_string()))?;

    let engine = engine.read().await;
    let teams = engine.team_manager.get_teams().to_vec();

    Ok(Json(TeamResponse {
        message: "Teams retrieved".to_string(),
        teams,
    }))
}

/// Start a new round
pub async fn start_round(
    Path(room_code): Path<String>,
    Extension(_user): Extension<User>,
) -> Result<impl IntoResponse, AppError> {
    let engines = GAME_ENGINES.read().await;
    let engine = engines
        .get(&room_code)
        .ok_or_else(|| AppError::not_found("Game not found for this room".to_string()))?;

    let mut engine = engine.write().await;

    // Check if user is the current explainer
    let _current_team = engine
        .game_state
        .teams
        .get(engine.game_state.current_team_index)
        .ok_or_else(|| AppError::bad_request("Invalid team index".to_string()))?;

    let round = engine
        .start_round()
        .await
        .map_err(AppError::bad_request)?;

    info!(
        "Round {} started for room {} by team {}",
        round.round_number, room_code, round.team_id
    );

    Ok(Json(RoundResponse {
        message: "Round started".to_string(),
        round_number: round.round_number,
        team_id: round.team_id,
        explainer_id: round.explainer_id,
        timer_seconds: round.timer_seconds,
    }))
}

/// Get current word (only for explainer)
pub async fn get_current_word(
    Path(room_code): Path<String>,
    Extension(user): Extension<User>,
) -> Result<impl IntoResponse, AppError> {
    let engines = GAME_ENGINES.read().await;
    let engine = engines
        .get(&room_code)
        .ok_or_else(|| AppError::not_found("Game not found for this room".to_string()))?;

    let engine = engine.read().await;

    // Check if user is the current explainer
    let round = engine
        .game_state
        .current_round
        .as_ref()
        .ok_or_else(|| AppError::bad_request("No active round".to_string()))?;

    if round.explainer_id != user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default() {
        return Err(AppError::forbidden(
            "Only the explainer can see the current word".to_string(),
        ));
    }

    let word = engine
        .get_current_word()
        .ok_or_else(|| AppError::bad_request("No more words in this round".to_string()))?;

    Ok(Json(WordResponse {
        word: word.word.clone(),
        difficulty: word.difficulty.clone(),
        category: word.category.clone(),
    }))
}

/// Submit word result (correct/skip/penalty)
pub async fn submit_word_result(
    Path(room_code): Path<String>,
    Extension(user): Extension<User>,
    Json(request): Json<WordActionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let engines = GAME_ENGINES.read().await;
    let engine = engines
        .get(&room_code)
        .ok_or_else(|| AppError::not_found("Game not found for this room".to_string()))?;

    let mut engine = engine.write().await;

    // Check if user is the current explainer
    // Store the team_id before processing
    let team_id = {
        let round = engine
            .game_state
            .current_round
            .as_ref()
            .ok_or_else(|| AppError::bad_request("No active round".to_string()))?;

        if round.explainer_id != user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default() {
            return Err(AppError::forbidden(
                "Only the explainer can submit word results".to_string(),
            ));
        }
        round.team_id.clone()
    };

    let score_change = engine
        .process_word_result(request.word_result)
        .map_err(AppError::bad_request)?;

    let team = engine
        .game_state
        .teams
        .iter()
        .find(|t| t.id == team_id)
        .ok_or_else(|| AppError::bad_request("Team not found".to_string()))?;

    Ok(Json(ScoreResponse {
        score_change,
        team_score: team.score,
        message: match request.word_result {
            WordResult::Correct => "Word guessed correctly!".to_string(),
            WordResult::Skipped => "Word skipped".to_string(),
            WordResult::Penalty => "Penalty applied".to_string(),
        },
    }))
}

/// End current round
pub async fn end_round(
    Path(room_code): Path<String>,
    Extension(user): Extension<User>,
) -> Result<impl IntoResponse, AppError> {
    let engines = GAME_ENGINES.read().await;
    let engine = engines
        .get(&room_code)
        .ok_or_else(|| AppError::not_found("Game not found for this room".to_string()))?;

    let mut engine = engine.write().await;

    // Check if user is the current explainer or admin
    let round = engine
        .game_state
        .current_round
        .as_ref()
        .ok_or_else(|| AppError::bad_request("No active round".to_string()))?;

    if round.explainer_id != user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default() {
        // Check if admin
        // TODO: Add admin check from room state
    }

    let round = engine.end_round().map_err(AppError::bad_request)?;

    info!(
        "Round {} ended for room {}. Team {} scored {} points",
        round.round_number, room_code, round.team_id, round.score_gained
    );

    Ok(Json(GameResponse {
        message: format!("Round ended. Team scored {} points", round.score_gained),
        game_state: Some(engine.game_state.clone()),
    }))
}

/// Pause the game
pub async fn pause_game(
    State(state): State<AppState>,
    Path(room_code): Path<String>,
    Extension(user): Extension<User>,
) -> Result<impl IntoResponse, AppError> {
    // Check if user is admin
    let rooms = state.rooms.read().await;
    let room = rooms
        .get(&room_code)
        .ok_or_else(|| AppError::not_found("Room not found".to_string()))?;

    if room.admin_id != user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default() {
        return Err(AppError::forbidden(
            "Only room admin can pause the game".to_string(),
        ));
    }

    drop(rooms);

    let engines = GAME_ENGINES.read().await;
    let engine = engines
        .get(&room_code)
        .ok_or_else(|| AppError::not_found("Game not found for this room".to_string()))?;

    let mut engine = engine.write().await;
    engine.pause_game().map_err(AppError::bad_request)?;

    Ok(Json(GameResponse {
        message: "Game paused".to_string(),
        game_state: Some(engine.game_state.clone()),
    }))
}

/// Resume the game
pub async fn resume_game(
    State(state): State<AppState>,
    Path(room_code): Path<String>,
    Extension(user): Extension<User>,
) -> Result<impl IntoResponse, AppError> {
    // Check if user is admin
    let rooms = state.rooms.read().await;
    let room = rooms
        .get(&room_code)
        .ok_or_else(|| AppError::not_found("Room not found".to_string()))?;

    if room.admin_id != user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default() {
        return Err(AppError::forbidden(
            "Only room admin can resume the game".to_string(),
        ));
    }

    drop(rooms);

    let engines = GAME_ENGINES.read().await;
    let engine = engines
        .get(&room_code)
        .ok_or_else(|| AppError::not_found("Game not found for this room".to_string()))?;

    let mut engine = engine.write().await;
    engine.resume_game().map_err(AppError::bad_request)?;

    Ok(Json(GameResponse {
        message: "Game resumed".to_string(),
        game_state: Some(engine.game_state.clone()),
    }))
}

/// Reset the game
pub async fn reset_game(
    State(state): State<AppState>,
    Path(room_code): Path<String>,
    Extension(user): Extension<User>,
) -> Result<impl IntoResponse, AppError> {
    // Check if user is admin
    let rooms = state.rooms.read().await;
    let room = rooms
        .get(&room_code)
        .ok_or_else(|| AppError::not_found("Room not found".to_string()))?;

    if room.admin_id != user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default() {
        return Err(AppError::forbidden(
            "Only room admin can reset the game".to_string(),
        ));
    }

    drop(rooms);

    let engines = GAME_ENGINES.read().await;
    let engine = engines
        .get(&room_code)
        .ok_or_else(|| AppError::not_found("Game not found for this room".to_string()))?;

    let mut engine = engine.write().await;
    engine.reset_game();

    Ok(Json(GameResponse {
        message: "Game reset successfully".to_string(),
        game_state: Some(engine.game_state.clone()),
    }))
}
