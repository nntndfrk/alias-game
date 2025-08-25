use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use serde_json;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::select;
use tokio::sync::{broadcast, RwLock};
use tracing::{error, info, warn};

use crate::auth_middleware;
use crate::AppState;
use shared::models::{User, UserInfo, UserRole, WebSocketMessage};

mod game;

// WebSocket connection manager
pub struct WebSocketManager {
    // Room ID -> broadcast sender for that room
    pub room_senders: Arc<RwLock<HashMap<String, broadcast::Sender<WebSocketMessage>>>>,
    // Global broadcast channel for lobby events (room creation, etc.)
    pub lobby_sender: broadcast::Sender<WebSocketMessage>,
}

impl Default for WebSocketManager {
    fn default() -> Self {
        Self::new()
    }
}

impl WebSocketManager {
    pub fn new() -> Self {
        let (lobby_sender, _) = broadcast::channel(100);
        Self {
            room_senders: Arc::new(RwLock::new(HashMap::new())),
            lobby_sender,
        }
    }

    pub async fn get_or_create_room_sender(
        &self,
        room_code: &str,
    ) -> broadcast::Sender<WebSocketMessage> {
        let mut senders = self.room_senders.write().await;
        if let Some(sender) = senders.get(room_code) {
            sender.clone()
        } else {
            let (sender, _) = broadcast::channel(100);
            senders.insert(room_code.to_string(), sender.clone());
            sender
        }
    }

    pub async fn broadcast_to_room(&self, room_code: &str, message: WebSocketMessage) {
        if let Some(sender) = self.room_senders.read().await.get(room_code) {
            let subscriber_count = sender.receiver_count();
            info!(
                "Broadcasting {} message to room {} with {} subscribers",
                message.type_name(),
                room_code,
                subscriber_count
            );

            if let Err(e) = sender.send(message) {
                warn!("Failed to broadcast message to room {}: {}", room_code, e);
            }
        } else {
            warn!("No WebSocket channel found for room {}", room_code);
        }
    }

    pub async fn remove_room(&self, room_code: &str) {
        self.room_senders.write().await.remove(room_code);
    }

    pub fn broadcast_to_lobby(&self, message: WebSocketMessage) {
        let subscriber_count = self.lobby_sender.receiver_count();
        info!(
            "Broadcasting {} message to lobby with {} subscribers",
            message.type_name(),
            subscriber_count
        );

        if subscriber_count == 0 {
            warn!("No subscribers for lobby broadcast!");
        }

        match self.lobby_sender.send(message.clone()) {
            Ok(sent_count) => {
                info!(
                    "Successfully sent lobby broadcast to {} receivers",
                    sent_count
                );
            }
            Err(e) => {
                warn!("Failed to broadcast message to lobby: {}", e);
            }
        }
    }
}

pub async fn websocket_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let mut authenticated_user: Option<User> = None;
    let mut current_room: Option<String> = None;
    let mut room_receiver: Option<broadcast::Receiver<WebSocketMessage>> = None;
    let mut lobby_receiver: Option<broadcast::Receiver<WebSocketMessage>> = None;

    info!("WebSocket connection established");

    // Main event loop using select! to handle multiple event sources
    loop {
        select! {
            // Handle incoming WebSocket messages
            Some(msg) = receiver.next() => {
                match msg {
                    Ok(Message::Text(text)) => {
                        match serde_json::from_str::<WebSocketMessage>(&text) {
                            Ok(ws_msg) => {
                                match handle_websocket_message(
                                    ws_msg,
                                    &mut authenticated_user,
                                    &mut current_room,
                                    &mut room_receiver,
                                    &mut lobby_receiver,
                                    &state,
                                )
                                .await
                                {
                                    Ok(Some(response)) => {
                                        if let Ok(response_text) = serde_json::to_string(&response) {
                                            if sender.send(Message::Text(response_text)).await.is_err() {
                                                break;
                                            }
                                        }
                                    }
                                    Ok(None) => {} // No response needed
                                    Err(error_msg) => {
                                        let error_response = WebSocketMessage::Error {
                                            message: error_msg,
                                        };
                                        if let Ok(error_text) = serde_json::to_string(&error_response) {
                                            if sender.send(Message::Text(error_text)).await.is_err() {
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                warn!("Failed to parse WebSocket message: {}", e);
                                let error_response = WebSocketMessage::Error {
                                    message: "Invalid message format".to_string(),
                                };
                                if let Ok(error_text) = serde_json::to_string(&error_response) {
                                    if sender.send(Message::Text(error_text)).await.is_err() {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    Ok(Message::Close(_)) => {
                        info!("WebSocket connection closed");
                        break;
                    }
                    Err(e) => {
                        error!("WebSocket error: {}", e);
                        break;
                    }
                    _ => {} // Ignore other message types
                }
            }

            // Handle room broadcasts
            Ok(broadcast_msg) = async {
                match &mut room_receiver {
                    Some(receiver) => receiver.recv().await,
                    None => futures_util::future::pending().await,
                }
            } => {
                if let Ok(broadcast_text) = serde_json::to_string(&broadcast_msg) {
                    if sender.send(Message::Text(broadcast_text)).await.is_err() {
                        break;
                    }
                }
            }

            // Handle lobby broadcasts
            Ok(broadcast_msg) = async {
                match &mut lobby_receiver {
                    Some(receiver) => receiver.recv().await,
                    None => futures_util::future::pending().await,
                }
            } => {
                info!("Sending lobby broadcast to client: {:?}", broadcast_msg.type_name());
                if let Ok(broadcast_text) = serde_json::to_string(&broadcast_msg) {
                    if sender.send(Message::Text(broadcast_text)).await.is_err() {
                        break;
                    }
                }
            }
        }
    }

    // Mark user as disconnected on WebSocket disconnect
    if let (Some(user), Some(room_code)) = (authenticated_user, current_room) {
        handle_user_disconnect(&user, &room_code, &state).await;
    }

    info!("WebSocket connection terminated");
}

async fn handle_websocket_message(
    message: WebSocketMessage,
    authenticated_user: &mut Option<User>,
    current_room: &mut Option<String>,
    room_receiver: &mut Option<broadcast::Receiver<WebSocketMessage>>,
    lobby_receiver: &mut Option<broadcast::Receiver<WebSocketMessage>>,
    state: &AppState,
) -> Result<Option<WebSocketMessage>, String> {
    match message {
        WebSocketMessage::Authenticate { token } => {
            match auth_middleware::extract_user_from_token(&token, &state.auth_service).await {
                Ok(user) => {
                    info!("WebSocket user authenticated: {}", user.username);
                    let user_info = UserInfo::from(user.clone());
                    *authenticated_user = Some(user);

                    // Subscribe to lobby events when authenticated
                    *lobby_receiver = Some(state.websocket_manager.lobby_sender.subscribe());

                    Ok(Some(WebSocketMessage::Authenticated { user: user_info }))
                }
                Err(e) => {
                    warn!("WebSocket authentication failed: {}", e);
                    Err("Authentication failed".to_string())
                }
            }
        }

        WebSocketMessage::JoinRoom { room_code } => {
            if let Some(user) = authenticated_user.as_ref() {
                handle_join_room(user, &room_code, current_room, room_receiver, state).await
            } else {
                Err("Must authenticate first".to_string())
            }
        }

        WebSocketMessage::LeaveRoom => {
            if let (Some(user), Some(room_code)) =
                (authenticated_user.as_ref(), current_room.as_ref())
            {
                handle_leave_room(user, room_code, state).await?;
                *current_room = None;
                *room_receiver = None;
                Ok(None)
            } else {
                Err("Not in a room".to_string())
            }
        }

        WebSocketMessage::RequestRoomList => {
            if authenticated_user.is_some() {
                handle_request_room_list(state).await
            } else {
                Err("Must authenticate first".to_string())
            }
        }

        WebSocketMessage::Ping => {
            // Respond to ping with pong to keep connection alive
            Ok(Some(WebSocketMessage::Pong))
        }

        WebSocketMessage::KickPlayer { user_id } => {
            if let (Some(admin), Some(room_code)) =
                (authenticated_user.as_ref(), current_room.as_ref())
            {
                handle_kick_player(admin, &user_id, room_code, state).await?;
                Ok(None)
            } else {
                Err("Not authorized or not in a room".to_string())
            }
        }
        // Game-specific messages
        WebSocketMessage::JoinTeam { team_id } => {
            if let (Some(user), Some(room_code)) =
                (authenticated_user.as_ref(), current_room.as_ref())
            {
                game::handle_join_team(user, &team_id, room_code, state).await
            } else {
                Err("Not authenticated or not in a room".to_string())
            }
        }
        WebSocketMessage::LeaveTeam => {
            if let (Some(user), Some(room_code)) =
                (authenticated_user.as_ref(), current_room.as_ref())
            {
                game::handle_leave_team(user, room_code, state).await
            } else {
                Err("Not authenticated or not in a room".to_string())
            }
        }
        WebSocketMessage::MarkReady => {
            if let (Some(user), Some(room_code)) =
                (authenticated_user.as_ref(), current_room.as_ref())
            {
                game::handle_mark_ready(user, room_code, state).await
            } else {
                Err("Not authenticated or not in a room".to_string())
            }
        }
        WebSocketMessage::StartGame => {
            if let (Some(user), Some(room_code)) =
                (authenticated_user.as_ref(), current_room.as_ref())
            {
                game::handle_start_game(user, room_code, state).await
            } else {
                Err("Not authenticated or not in a room".to_string())
            }
        }
        WebSocketMessage::StartRound => {
            if let (Some(user), Some(room_code)) =
                (authenticated_user.as_ref(), current_room.as_ref())
            {
                game::handle_start_round(user, room_code, state).await
            } else {
                Err("Not authenticated or not in a room".to_string())
            }
        }
        WebSocketMessage::WordAction { result } => {
            if let (Some(user), Some(room_code)) =
                (authenticated_user.as_ref(), current_room.as_ref())
            {
                game::handle_word_action(user, result, room_code, state).await
            } else {
                Err("Not authenticated or not in a room".to_string())
            }
        }
        WebSocketMessage::RequestNewWord => {
            if let (Some(user), Some(room_code)) =
                (authenticated_user.as_ref(), current_room.as_ref())
            {
                game::handle_request_new_word(user, room_code, state).await
            } else {
                Err("Not authenticated or not in a room".to_string())
            }
        }
        WebSocketMessage::EndRound => {
            if let (Some(user), Some(room_code)) =
                (authenticated_user.as_ref(), current_room.as_ref())
            {
                game::handle_end_round(user, room_code, state).await
            } else {
                Err("Not authenticated or not in a room".to_string())
            }
        }
        WebSocketMessage::PauseGame => {
            if let (Some(user), Some(room_code)) =
                (authenticated_user.as_ref(), current_room.as_ref())
            {
                game::handle_pause_game(user, room_code, state).await
            } else {
                Err("Not authenticated or not in a room".to_string())
            }
        }
        WebSocketMessage::ResumeGame => {
            if let (Some(user), Some(room_code)) =
                (authenticated_user.as_ref(), current_room.as_ref())
            {
                game::handle_resume_game(user, room_code, state).await
            } else {
                Err("Not authenticated or not in a room".to_string())
            }
        }

        _ => Err("Message type not supported yet".to_string()),
    }
}

async fn handle_join_room(
    user: &User,
    room_code: &str,
    current_room: &mut Option<String>,
    room_receiver: &mut Option<broadcast::Receiver<WebSocketMessage>>,
    state: &AppState,
) -> Result<Option<WebSocketMessage>, String> {
    let user_id = user.id.unwrap().to_hex();
    let mut rooms = state.rooms.write().await;

    let room = rooms
        .get_mut(room_code)
        .ok_or_else(|| "Room not found".to_string())?;

    // Check if user is in the room
    if !room.participants.contains_key(&user_id) {
        return Err("User is not a participant in this room".to_string());
    }

    // Mark user as connected when they join via WebSocket
    if let Some(participant) = room.participants.get_mut(&user_id) {
        participant.is_connected = true;
        room.updated_at = chrono::Utc::now();
    }

    let room_clone = room.clone();
    drop(rooms); // Release the write lock

    // Set up room subscription
    let sender = state
        .websocket_manager
        .get_or_create_room_sender(room_code)
        .await;
    *room_receiver = Some(sender.subscribe());
    *current_room = Some(room_code.to_string());

    // Broadcast updated room state to show user reconnection
    state
        .websocket_manager
        .broadcast_to_room(
            room_code,
            WebSocketMessage::RoomUpdated {
                room: room_clone.clone(),
            },
        )
        .await;

    info!(
        "User {} connected to WebSocket for room {}",
        user_id, room_code
    );

    Ok(Some(WebSocketMessage::RoomJoined { room: room_clone }))
}

async fn handle_leave_room(user: &User, room_code: &str, state: &AppState) -> Result<(), String> {
    let user_id = user.id.unwrap().to_hex();
    let mut rooms = state.rooms.write().await;

    let room = rooms
        .get_mut(room_code)
        .ok_or_else(|| "Room not found".to_string())?;

    // Remove the participant
    room.participants.remove(&user_id);
    room.updated_at = chrono::Utc::now();

    // Broadcast user left message
    let ws_manager = &state.websocket_manager;
    ws_manager
        .broadcast_to_room(
            room_code,
            WebSocketMessage::UserLeft {
                user_id: user_id.clone(),
            },
        )
        .await;

    // Check if room is now empty (regardless of who left)
    if room.participants.is_empty() {
        // Remove empty room
        rooms.remove(room_code);
        ws_manager.remove_room(room_code).await;

        // Broadcast room deletion to lobby
        ws_manager.broadcast_to_lobby(WebSocketMessage::RoomDeleted {
            room_code: room_code.to_string(),
        });

        info!(
            "Room {} deleted (last user left) and broadcast to lobby",
            room_code
        );
        return Ok(());
    }

    // If admin leaves but room is not empty, transfer admin role
    if room.admin_id == user_id {
        if let Some((new_admin_id, participant)) = room.participants.iter_mut().next() {
            // Transfer admin role to another participant
            participant.role = UserRole::Admin;
            room.admin_id = new_admin_id.clone();

            // Broadcast role update
            ws_manager
                .broadcast_to_room(
                    room_code,
                    WebSocketMessage::RoleUpdated {
                        user_id: new_admin_id.clone(),
                        role: UserRole::Admin,
                    },
                )
                .await;

            info!(
                "Admin role transferred from {} to {} in room {}",
                user_id, new_admin_id, room_code
            );
        }
    }

    // Broadcast updated room state
    ws_manager
        .broadcast_to_room(
            room_code,
            WebSocketMessage::RoomUpdated { room: room.clone() },
        )
        .await;

    // Broadcast updated room info to lobby
    let room_info = shared::models::RoomInfo {
        id: room.id.unwrap().to_hex(),
        room_code: room_code.to_string(),
        name: room.name.clone(),
        current_players: room.participants.len(),
        max_players: room.max_players,
        state: room.state,
        admin_username: room
            .participants
            .get(&room.admin_id)
            .map(|p| p.username.clone())
            .unwrap_or_default(),
    };
    ws_manager.broadcast_to_lobby(WebSocketMessage::RoomInfoUpdated { room_info });

    Ok(())
}

async fn handle_kick_player(
    admin: &User,
    player_id: &str,
    room_code: &str,
    state: &AppState,
) -> Result<(), String> {
    let admin_id = admin.id.unwrap().to_hex();
    let mut rooms = state.rooms.write().await;

    let room = rooms
        .get_mut(room_code)
        .ok_or_else(|| "Room not found".to_string())?;

    // Check if the user is the admin
    if room.admin_id != admin_id {
        return Err("Only admin can kick players".to_string());
    }

    // Check if the player exists in the room
    if !room.participants.contains_key(player_id) {
        return Err("Player not found in room".to_string());
    }

    // Cannot kick the admin themselves
    if player_id == admin_id {
        return Err("Admin cannot kick themselves".to_string());
    }

    // Remove the player
    room.participants.remove(player_id);
    room.updated_at = chrono::Utc::now();

    // Broadcast kick notification
    let ws_manager = &state.websocket_manager;
    ws_manager
        .broadcast_to_room(
            room_code,
            WebSocketMessage::UserKicked {
                user_id: player_id.to_string(),
                kicked_by: admin_id.clone(),
            },
        )
        .await;

    // Broadcast updated room state
    ws_manager
        .broadcast_to_room(
            room_code,
            WebSocketMessage::RoomUpdated { room: room.clone() },
        )
        .await;

    info!(
        "Admin {} kicked player {} from room {}",
        admin_id, player_id, room_code
    );

    Ok(())
}

async fn get_room_list(state: &AppState) -> WebSocketMessage {
    let rooms = state.rooms.read().await;

    let room_list: Vec<shared::models::RoomInfo> = rooms
        .values()
        .filter_map(|room| {
            // Only include rooms with valid IDs
            room.id.map(|id| shared::models::RoomInfo {
                id: id.to_hex(),
                room_code: room.room_code.clone(),
                name: room.name.clone(),
                current_players: room.participants.len(),
                max_players: room.max_players,
                state: room.state,
                admin_username: room
                    .participants
                    .get(&room.admin_id)
                    .map(|p| p.username.clone())
                    .unwrap_or_default(),
            })
        })
        .collect();

    info!("Preparing room list with {} rooms", room_list.len());

    WebSocketMessage::RoomList { rooms: room_list }
}

async fn handle_request_room_list(state: &AppState) -> Result<Option<WebSocketMessage>, String> {
    let room_list = get_room_list(state).await;
    Ok(Some(room_list))
}

async fn handle_user_disconnect(user: &User, room_code: &str, state: &AppState) {
    let user_id = user.id.unwrap().to_hex();
    let mut rooms = state.rooms.write().await;

    if let Some(room) = rooms.get_mut(room_code) {
        if let Some(participant) = room.participants.get_mut(&user_id) {
            // Mark user as disconnected but keep them in the room
            // This allows them to reconnect later
            participant.is_connected = false;
            room.updated_at = chrono::Utc::now();

            // Broadcast updated room state to show disconnection
            state
                .websocket_manager
                .broadcast_to_room(
                    room_code,
                    WebSocketMessage::RoomUpdated { room: room.clone() },
                )
                .await;

            info!(
                "User {} marked as disconnected in room {} (can reconnect)",
                user_id, room_code
            );
        }
    }
}

// Clean up abandoned rooms where all users have been disconnected for too long
pub async fn cleanup_abandoned_rooms(state: &AppState, disconnect_timeout_minutes: i64) {
    let mut rooms = state.rooms.write().await;
    let cutoff_time = chrono::Utc::now() - chrono::Duration::minutes(disconnect_timeout_minutes);
    let mut rooms_to_remove = Vec::new();

    for (room_code, room) in rooms.iter() {
        // Check if all participants are disconnected
        let all_disconnected = room.participants.values().all(|p| !p.is_connected);

        // If all users are disconnected and the room hasn't been updated recently
        if all_disconnected && room.updated_at < cutoff_time {
            rooms_to_remove.push(room_code.clone());
            info!(
                "Room {} scheduled for deletion (abandoned for {} minutes)",
                room_code, disconnect_timeout_minutes
            );
        }
    }

    // Remove abandoned rooms
    for room_code in rooms_to_remove {
        rooms.remove(&room_code);
        state.websocket_manager.remove_room(&room_code).await;

        // Broadcast room deletion to lobby
        state
            .websocket_manager
            .broadcast_to_lobby(WebSocketMessage::RoomDeleted {
                room_code: room_code.clone(),
            });

        info!("Room {} deleted (abandoned)", room_code);
    }
}
