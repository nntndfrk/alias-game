use game_engine::game::GameEngine;
use shared::models::{User, WebSocketMessage, WordResult};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

use crate::game::GAME_ENGINES;
use crate::AppState;

/// Handle team join message
pub async fn handle_join_team(
    user: &User,
    team_id: &str,
    room_code: &str,
    state: &AppState,
) -> Result<Option<WebSocketMessage>, String> {
    let user_id = user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default();

    // Update room participant
    let mut rooms = state.rooms.write().await;
    let room = rooms.get_mut(room_code).ok_or("Room not found")?;

    let participant = room
        .participants
        .get_mut(&user_id)
        .ok_or("User not in room")?;

    participant.team_id = Some(team_id.to_string());
    drop(rooms);

    // Update game engine if exists
    let engines = GAME_ENGINES.read().await;
    if let Some(engine) = engines.get(room_code) {
        let mut engine = engine.write().await;
        engine
            .team_manager
            .add_player_to_team(user_id.clone(), team_id)
            .map_err(|e| e.to_string())?;

        let teams = engine.team_manager.get_teams().to_vec();

        // Broadcast team update to room
        state
            .websocket_manager
            .broadcast_to_room(
                room_code,
                WebSocketMessage::TeamsUpdated {
                    teams: teams.clone(),
                },
            )
            .await;

        Ok(Some(WebSocketMessage::TeamJoined {
            team: teams.into_iter().find(|t| t.id == team_id).unwrap(),
            user_id,
        }))
    } else {
        Ok(None)
    }
}

/// Handle leave team message
pub async fn handle_leave_team(
    user: &User,
    room_code: &str,
    state: &AppState,
) -> Result<Option<WebSocketMessage>, String> {
    let user_id = user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default();

    // Update room participant
    let mut rooms = state.rooms.write().await;
    let room = rooms.get_mut(room_code).ok_or("Room not found")?;

    let participant = room
        .participants
        .get_mut(&user_id)
        .ok_or("User not in room")?;

    let team_id = participant.team_id.clone();
    participant.team_id = None;
    drop(rooms);

    // Update game engine if exists
    let engines = GAME_ENGINES.read().await;
    if let Some(engine) = engines.get(room_code) {
        let mut engine = engine.write().await;
        engine.team_manager.remove_player(&user_id);

        let teams = engine.team_manager.get_teams().to_vec();

        // Broadcast team update to room
        state
            .websocket_manager
            .broadcast_to_room(room_code, WebSocketMessage::TeamsUpdated { teams })
            .await;

        if let Some(tid) = team_id {
            Ok(Some(WebSocketMessage::TeamLeft {
                team_id: tid,
                user_id,
            }))
        } else {
            Ok(None)
        }
    } else {
        Ok(None)
    }
}

/// Handle mark ready message
pub async fn handle_mark_ready(
    user: &User,
    room_code: &str,
    state: &AppState,
) -> Result<Option<WebSocketMessage>, String> {
    let user_id = user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default();

    let engines = GAME_ENGINES.read().await;
    let engine = engines.get(room_code).ok_or("Game not initialized")?;

    let mut engine = engine.write().await;

    // Find user's team
    let team = engine
        .team_manager
        .get_teams()
        .iter()
        .find(|t| t.players.contains(&user_id))
        .ok_or("User not in any team")?
        .clone();

    // Mark team as ready
    if let Some(team_mut) = engine.team_manager.get_team_mut(&team.id) {
        team_mut.is_ready = true;
    }

    // Broadcast team ready
    state
        .websocket_manager
        .broadcast_to_room(
            room_code,
            WebSocketMessage::TeamReady {
                team_id: team.id.clone(),
            },
        )
        .await;

    Ok(None)
}

/// Handle start game message (admin only)
pub async fn handle_start_game(
    user: &User,
    room_code: &str,
    state: &AppState,
) -> Result<Option<WebSocketMessage>, String> {
    let user_id = user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default();

    // Check if user is admin
    let rooms = state.rooms.read().await;
    let room = rooms.get(room_code).ok_or("Room not found")?;

    if room.admin_id != user_id {
        return Err("Only admin can start the game".to_string());
    }
    drop(rooms);

    // Create game engine if not exists
    let mut engines = GAME_ENGINES.write().await;
    if !engines.contains_key(room_code) {
        let mut game_engine = GameEngine::new(&state.mongo_client, None).await;

        // Initialize teams from room participants
        let rooms = state.rooms.read().await;
        let room = rooms.get(room_code).unwrap();

        for participant in room.participants.values() {
            if let Some(team_id) = &participant.team_id {
                game_engine
                    .team_manager
                    .add_player_to_team(participant.user_id.clone(), team_id)
                    .map_err(|e| e.to_string())?;
            }
        }
        drop(rooms);

        // Validate and start game
        game_engine
            .team_manager
            .validate_for_game_start()
            .map_err(|e| e.to_string())?;

        game_engine.start_game().await.map_err(|e| e.to_string())?;

        engines.insert(room_code.to_string(), Arc::new(RwLock::new(game_engine)));
    }

    let engine = engines.get(room_code).unwrap();
    let engine = engine.read().await;

    // Broadcast game started
    state
        .websocket_manager
        .broadcast_to_room(room_code, WebSocketMessage::GameStarted)
        .await;

    // Send game state
    state
        .websocket_manager
        .broadcast_to_room(
            room_code,
            WebSocketMessage::GameStateUpdated {
                game_state: engine.game_state.clone(),
            },
        )
        .await;

    info!("Game started in room {}", room_code);

    Ok(None)
}

/// Handle start round message
pub async fn handle_start_round(
    _user: &User,
    room_code: &str,
    state: &AppState,
) -> Result<Option<WebSocketMessage>, String> {
    let engines = GAME_ENGINES.read().await;
    let engine = engines.get(room_code).ok_or("Game not found")?;

    let mut engine = engine.write().await;

    let round = engine.start_round().await.map_err(|e| e.to_string())?;

    // Broadcast round started
    state
        .websocket_manager
        .broadcast_to_room(
            room_code,
            WebSocketMessage::RoundStarted {
                round: round.clone(),
            },
        )
        .await;

    info!("Round {} started in room {}", round.round_number, room_code);

    Ok(None)
}

/// Handle word action message
pub async fn handle_word_action(
    user: &User,
    result: WordResult,
    room_code: &str,
    state: &AppState,
) -> Result<Option<WebSocketMessage>, String> {
    let user_id = user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default();

    let engines = GAME_ENGINES.read().await;
    let engine = engines.get(room_code).ok_or("Game not found")?;

    let mut engine = engine.write().await;

    // Check if user is current explainer
    let round = engine
        .game_state
        .current_round
        .as_ref()
        .ok_or("No active round")?;

    if round.explainer_id != user_id {
        return Err("Only explainer can submit word results".to_string());
    }

    let score_change = engine
        .process_word_result(result)
        .map_err(|e| e.to_string())?;

    // Broadcast word result
    state
        .websocket_manager
        .broadcast_to_room(
            room_code,
            WebSocketMessage::WordResultRecorded {
                result,
                score_change,
            },
        )
        .await;

    // Get next word if available
    if let Some(word) = engine.get_current_word() {
        // Send word only to explainer
        Ok(Some(WebSocketMessage::WordReceived { word: word.clone() }))
    } else {
        // No more words, end round
        let round = engine.end_round().map_err(|e| e.to_string())?;

        let next_team_id = engine
            .game_state
            .teams
            .get(engine.game_state.current_team_index)
            .map(|t| t.id.clone());

        // Broadcast round ended
        state
            .websocket_manager
            .broadcast_to_room(
                room_code,
                WebSocketMessage::RoundEnded {
                    round,
                    next_team_id,
                },
            )
            .await;

        // Check for winner
        if let Some(winner_id) = &engine.game_state.winner_team_id {
            let winner = engine
                .game_state
                .teams
                .iter()
                .find(|t| &t.id == winner_id)
                .cloned()
                .unwrap();

            state
                .websocket_manager
                .broadcast_to_room(
                    room_code,
                    WebSocketMessage::GameEnded {
                        winner_team: winner,
                        final_scores: engine.game_state.teams.clone(),
                    },
                )
                .await;
        }

        Ok(None)
    }
}

/// Handle request new word (skip)
pub async fn handle_request_new_word(
    user: &User,
    room_code: &str,
    state: &AppState,
) -> Result<Option<WebSocketMessage>, String> {
    handle_word_action(user, WordResult::Skipped, room_code, state).await
}

/// Handle end round message
pub async fn handle_end_round(
    user: &User,
    room_code: &str,
    state: &AppState,
) -> Result<Option<WebSocketMessage>, String> {
    let user_id = user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default();

    let engines = GAME_ENGINES.read().await;
    let engine = engines.get(room_code).ok_or("Game not found")?;

    let mut engine = engine.write().await;

    // Check if user is explainer or admin
    let round = engine
        .game_state
        .current_round
        .as_ref()
        .ok_or("No active round")?;

    if round.explainer_id != user_id {
        // Check if admin
        let rooms = state.rooms.read().await;
        let room = rooms.get(room_code).ok_or("Room not found")?;
        if room.admin_id != user_id {
            return Err("Only explainer or admin can end round".to_string());
        }
    }

    let round = engine.end_round().map_err(|e| e.to_string())?;

    let next_team_id = engine
        .game_state
        .teams
        .get(engine.game_state.current_team_index)
        .map(|t| t.id.clone());

    // Broadcast round ended
    state
        .websocket_manager
        .broadcast_to_room(
            room_code,
            WebSocketMessage::RoundEnded {
                round,
                next_team_id,
            },
        )
        .await;

    // Check for winner
    if let Some(winner_id) = &engine.game_state.winner_team_id {
        let winner = engine
            .game_state
            .teams
            .iter()
            .find(|t| &t.id == winner_id)
            .cloned()
            .unwrap();

        state
            .websocket_manager
            .broadcast_to_room(
                room_code,
                WebSocketMessage::GameEnded {
                    winner_team: winner,
                    final_scores: engine.game_state.teams.clone(),
                },
            )
            .await;
    }

    Ok(None)
}

/// Handle pause game message (admin only)
pub async fn handle_pause_game(
    user: &User,
    room_code: &str,
    state: &AppState,
) -> Result<Option<WebSocketMessage>, String> {
    let user_id = user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default();

    // Check if user is admin
    let rooms = state.rooms.read().await;
    let room = rooms.get(room_code).ok_or("Room not found")?;

    if room.admin_id != user_id {
        return Err("Only admin can pause the game".to_string());
    }
    drop(rooms);

    let engines = GAME_ENGINES.read().await;
    let engine = engines.get(room_code).ok_or("Game not found")?;

    let mut engine = engine.write().await;
    engine.pause_game().map_err(|e| e.to_string())?;

    // Broadcast game paused
    state
        .websocket_manager
        .broadcast_to_room(room_code, WebSocketMessage::GamePaused)
        .await;

    Ok(None)
}

/// Handle resume game message (admin only)
pub async fn handle_resume_game(
    user: &User,
    room_code: &str,
    state: &AppState,
) -> Result<Option<WebSocketMessage>, String> {
    let user_id = user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default();

    // Check if user is admin
    let rooms = state.rooms.read().await;
    let room = rooms.get(room_code).ok_or("Room not found")?;

    if room.admin_id != user_id {
        return Err("Only admin can resume the game".to_string());
    }
    drop(rooms);

    let engines = GAME_ENGINES.read().await;
    let engine = engines.get(room_code).ok_or("Game not found")?;

    let mut engine = engine.write().await;
    engine.resume_game().map_err(|e| e.to_string())?;

    // Broadcast game resumed
    state
        .websocket_manager
        .broadcast_to_room(room_code, WebSocketMessage::GameResumed)
        .await;

    Ok(None)
}
