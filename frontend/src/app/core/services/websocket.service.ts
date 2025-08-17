import { Injectable, signal, inject, computed } from '@angular/core';
import { Subject } from 'rxjs';
import { filter, map } from 'rxjs';
import { AuthService } from '../../features/auth/auth.service';

export interface UserInfo {
  id: string;
  username: string;
  display_name: string;
  profile_image_url?: string;
}

export interface WebSocketMessage {
  type: string;
  token?: string;
  user?: UserInfo;
  room?: GameRoom;
  rooms?: RoomInfo[];
  room_info?: RoomInfo;
  participant?: RoomParticipant;
  user_id?: string;
  kicked_by?: string;
  role?: 'admin' | 'player';
  message?: string;
  room_code?: string;
}

export interface RoomInfo {
  id: string;
  room_code: string;
  name: string;
  current_players: number;
  max_players: number;
  state: 'waiting' | 'ready' | 'in_progress' | 'paused' | 'finished';
  admin_username: string;
}

export interface RoomParticipant {
  user_id: string;
  username: string;
  display_name: string;
  profile_image_url?: string;
  role: 'admin' | 'player';
  team_id?: string;
  is_connected: boolean;
  joined_at: string;
}

export interface GameRoom {
  id?: string;
  room_code: string;
  name: string;
  admin_id: string;
  participants: Record<string, RoomParticipant>;
  state: 'waiting' | 'ready' | 'in_progress' | 'paused' | 'finished';
  max_players: number;
  created_at: string;
  updated_at: string;
  game_data?: Record<string, unknown>;
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private readonly authService = inject(AuthService);
  
  private socket: WebSocket | null = null;
  private readonly reconnectInterval = 5000;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  
  // Connection state
  private readonly connectionState = signal<'disconnected' | 'connecting' | 'connected' | 'authenticated'>('disconnected');
  private readonly messageSubject = new Subject<WebSocketMessage>();
  
  // Public observables
  readonly isConnected = computed(() => this.connectionState() === 'connected');
  readonly isConnecting = computed(() => this.connectionState() === 'connecting');
  readonly isAuthenticated = computed(() => this.connectionState() === 'authenticated');
  readonly messages$ = this.messageSubject.asObservable();
  
  // Specific message type observables
  readonly roomUpdated$ = this.messages$.pipe(
    filter(msg => msg.type === 'room_updated'),
    map(msg => msg.room as GameRoom)
  );
  
  readonly roomList$ = this.messages$.pipe(
    filter(msg => msg.type === 'room_list'),
    map(msg => msg.rooms as RoomInfo[])
  );
  
  readonly roomCreated$ = this.messages$.pipe(
    filter(msg => msg.type === 'room_created'),
    map(msg => msg.room_info as RoomInfo)
  );
  
  readonly roomDeleted$ = this.messages$.pipe(
    filter(msg => msg.type === 'room_deleted'),
    map(msg => msg.room_code as string)
  );
  
  readonly roomInfoUpdated$ = this.messages$.pipe(
    filter(msg => msg.type === 'room_info_updated'),
    map(msg => msg.room_info as RoomInfo)
  );
  
  readonly userJoined$ = this.messages$.pipe(
    filter(msg => msg.type === 'user_joined'),
    map(msg => msg.participant as RoomParticipant)
  );
  
  readonly userLeft$ = this.messages$.pipe(
    filter(msg => msg.type === 'user_left'),
    map(msg => msg.user_id as string)
  );
  
  readonly userKicked$ = this.messages$.pipe(
    filter(msg => msg.type === 'user_kicked'),
    map(msg => ({ user_id: msg.user_id as string, kicked_by: msg.kicked_by as string }))
  );
  
  readonly roleUpdated$ = this.messages$.pipe(
    filter(msg => msg.type === 'role_updated'),
    map(msg => ({ user_id: msg.user_id as string, role: msg.role as 'admin' | 'player' }))
  );
  
  readonly error$ = this.messages$.pipe(
    filter(msg => msg.type === 'error'),
    map(msg => msg.message as string)
  );

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    // Check if user is authenticated before connecting
    if (!this.authService.isAuthenticated()) {
      console.error('Cannot connect WebSocket: User not authenticated');
      return;
    }

    this.connectionState.set('connecting');
    
    try {
      // Use environment-specific WebSocket URL
      const wsUrl = this.getWebSocketUrl();
      this.socket = new WebSocket(wsUrl);
      
      this.socket.onopen = () => {
        console.log('WebSocket connected');
        this.connectionState.set('connected');
        this.reconnectAttempts = 0;
        
        // Authenticate after a small delay to ensure auth state is loaded
        setTimeout(() => {
          this.authenticateWebSocket();
        }, 100);
      };
      
      this.socket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log(`[WebSocket] Received ${message.type} message:`, message);
          
          // Handle authentication response
          if (message.type === 'authenticated') {
            this.connectionState.set('authenticated');
            console.log('WebSocket authenticated successfully');
          }
          
          // Log specific lobby-related messages
          if (message.type === 'room_created' || message.type === 'room_deleted' || message.type === 'room_info_updated') {
            console.log(`[WebSocket] Lobby update received: ${message.type}`, message);
          }
          
          this.messageSubject.next(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      this.socket.onclose = () => {
        console.log('WebSocket disconnected');
        this.connectionState.set('disconnected');
        this.handleReconnect();
      };
      
      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.connectionState.set('disconnected');
      };
      
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      this.connectionState.set('disconnected');
      this.handleReconnect();
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connectionState.set('disconnected');
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
  }

  send(message: WebSocketMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      // For non-authentication messages, check if we're authenticated
      if (message.type !== 'authenticate' && this.connectionState() !== 'authenticated') {
        console.warn('WebSocket is not authenticated. Message not sent:', message);
        return;
      }
      this.socket.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected. Message not sent:', message);
    }
  }

  private authenticateWebSocket(): void {
    const user = this.authService.user();
    const token = this.authService.token();
    
    console.log('[WebSocket] Attempting authentication...', {
      userPresent: !!user,
      tokenPresent: !!token,
      isAuthenticated: this.authService.isAuthenticated()
    });
    
    if (user && token) {
      console.log('[WebSocket] Sending authentication with token:', token.substring(0, 20) + '...');
      this.send({
        type: 'authenticate',
        token: token
      });
    } else {
      console.error('[WebSocket] No authentication token or user available');
      console.log('[WebSocket] User:', user, 'Token present:', !!token);
      
      // If auth is not ready, try again in a moment
      if (this.authService.isAuthenticated()) {
        setTimeout(() => {
          console.log('[WebSocket] Retrying authentication...');
          this.authenticateWebSocket();
        }, 500);
      }
    }
  }

  // Specific message senders
  joinRoom(roomCode: string): void {
    this.send({
      type: 'join_room',
      room_code: roomCode
    });
  }

  leaveRoom(): void {
    this.send({
      type: 'leave_room'
    });
  }

  kickPlayer(userId: string): void {
    this.send({
      type: 'kick_player',
      user_id: userId
    });
  }

  startGame(): void {
    this.send({
      type: 'start_game'
    });
  }

  pauseGame(): void {
    this.send({
      type: 'pause_game'
    });
  }

  resumeGame(): void {
    this.send({
      type: 'resume_game'
    });
  }

  requestRoomList(): void {
    if (!this.isAuthenticated()) {
      console.warn('[WebSocket] Cannot request room list - not authenticated');
      return;
    }
    console.log('[WebSocket] Requesting room list');
    this.send({
      type: 'request_room_list'
    });
  }

  private getWebSocketUrl(): string {
    // Get the current origin and replace http with ws
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    
    // In development, connect to backend on port 3000
    if (host === 'localhost' || host === '127.0.0.1') {
      return `${protocol}//${host}:3000/ws`;
    }
    
    // In production, use same host
    return `${protocol}//${window.location.host}/ws`;
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect WebSocket (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectInterval);
    } else {
      console.error('Max reconnection attempts reached. WebSocket connection failed.');
    }
  }
}