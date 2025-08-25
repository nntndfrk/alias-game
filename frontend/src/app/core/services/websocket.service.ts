import { Injectable, signal, inject, computed, OnDestroy } from '@angular/core';
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
  // Game-specific fields
  team_id?: string;
  teams?: unknown[];
  team?: unknown;
  game_state?: unknown;
  round?: unknown;
  word?: unknown;
  result?: 'correct' | 'skipped' | 'penalty';
  score_change?: number;
  time_remaining?: number;
  winner_team?: unknown;
  final_scores?: unknown[];
  next_team_id?: string;
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
export class WebSocketService implements OnDestroy {
  private readonly authService = inject(AuthService);
  
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private authRetryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private roomRejoinTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private authDelayTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private lastRoomCode: string | null = null;
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly pingInterval = 30000; // 30 seconds
  private readonly baseReconnectDelay = 1000; // Start with 1 second
  private readonly maxReconnectDelay = 30000; // Max 30 seconds
  private authRetryCount = 0;
  private readonly maxAuthRetries = 3;
  
  // Connection state
  private readonly connectionState = signal<'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'reconnecting'>('disconnected');
  private readonly messageSubject = new Subject<WebSocketMessage>();
  private readonly destroy$ = new Subject<void>();
  private readonly reconnectAttemptsSignal = signal(0);
  
  // Public observables
  readonly isConnected = computed(() => this.connectionState() === 'connected' || this.connectionState() === 'authenticated');
  readonly isConnecting = computed(() => this.connectionState() === 'connecting');
  readonly isAuthenticated = computed(() => this.connectionState() === 'authenticated');
  readonly isReconnecting = computed(() => this.connectionState() === 'reconnecting');
  readonly connectionStatus = computed(() => this.connectionState());
  readonly reconnectAttemptsCount = computed(() => this.reconnectAttemptsSignal());
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

    // Clear any existing reconnect timeout
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    this.shouldReconnect = true;
    this.connectionState.set('connecting');
    
    try {
      // Use environment-specific WebSocket URL
      const wsUrl = this.getWebSocketUrl();
      this.socket = new WebSocket(wsUrl);
      
      this.socket.onopen = () => {
        console.log('WebSocket connected');
        this.connectionState.set('connected');
        this.reconnectAttempts = 0;
        this.reconnectAttemptsSignal.set(0);
        
        // Start ping interval to keep connection alive
        this.startPingInterval();
        
        // Authenticate after a small delay to ensure auth state is loaded
        this.authDelayTimeoutId = setTimeout(() => {
          this.authenticateWebSocket();
          
          // If we were in a room before reconnecting, rejoin it
          if (this.lastRoomCode) {
            this.roomRejoinTimeoutId = setTimeout(() => {
              console.log(`Rejoining room ${this.lastRoomCode} after reconnection`);
              if (this.lastRoomCode) {
                this.joinRoom(this.lastRoomCode);
              }
            }, 500);
          }
        }, 100);
      };
      
      this.socket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log(`[WebSocket] Received ${message.type} message:`, message);
          
          // Handle authentication response
          if (message.type === 'authenticated') {
            this.connectionState.set('authenticated');
            this.authRetryCount = 0; // Reset auth retry count on success
            console.log('WebSocket authenticated successfully');
          }
          
          // Handle pong response (for keep-alive)
          if (message.type === 'pong') {
            // Pong received, connection is alive
            return;
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
      
      this.socket.onclose = (event) => {
        console.log('WebSocket disconnected', { code: event.code, reason: event.reason });
        this.cleanupTimers();
        
        // Don't reconnect if it was a clean close initiated by the client
        if (event.code === 1000 && !this.shouldReconnect) {
          this.connectionState.set('disconnected');
        } else if (this.shouldReconnect) {
          this.handleReconnect();
        }
      };
      
      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Don't set to disconnected here, let onclose handle it
      };
      
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      this.connectionState.set('disconnected');
      this.handleReconnect();
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.cleanupTimers();
    this.cleanupWebSocket();
    
    this.connectionState.set('disconnected');
    this.lastRoomCode = null;
    this.authRetryCount = 0;
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
      
      // If auth is not ready, try again in a moment (with limit)
      if (this.authService.isAuthenticated() && this.authRetryCount < this.maxAuthRetries) {
        this.authRetryCount++;
        this.authRetryTimeoutId = setTimeout(() => {
          console.log(`[WebSocket] Retrying authentication... (attempt ${this.authRetryCount}/${this.maxAuthRetries})`);
          this.authenticateWebSocket();
        }, 500);
      } else if (this.authRetryCount >= this.maxAuthRetries) {
        console.error('[WebSocket] Max authentication retry attempts reached');
        this.authRetryCount = 0;
      }
    }
  }

  // Specific message senders
  joinRoom(roomCode: string): void {
    this.lastRoomCode = roomCode;
    this.send({
      type: 'join_room',
      room_code: roomCode
    });
  }

  leaveRoom(): void {
    this.lastRoomCode = null;
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
    if (!this.shouldReconnect) {
      return;
    }
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.reconnectAttemptsSignal.set(this.reconnectAttempts);
      this.connectionState.set('reconnecting');
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
        this.maxReconnectDelay
      );
      
      console.log(`Attempting to reconnect WebSocket (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);
      
      this.reconnectTimeoutId = setTimeout(() => {
        if (this.shouldReconnect) {
          this.connect();
        }
      }, delay);
    } else {
      console.error('Max reconnection attempts reached. WebSocket connection failed.');
      this.connectionState.set('disconnected');
      
      // Show user notification that connection failed
      this.messageSubject.next({
        type: 'error',
        message: 'Connection to server lost. Please refresh the page to reconnect.'
      });
    }
  }
  
  private startPingInterval(): void {
    this.stopPingInterval();
    
    // Send ping message periodically to keep connection alive
    this.pingIntervalId = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, this.pingInterval);
  }
  
  private stopPingInterval(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }
  
  // Manual reconnect method for user-triggered reconnection
  reconnect(): void {
    this.reconnectAttempts = 0;
    this.reconnectAttemptsSignal.set(0);
    this.shouldReconnect = true;
    this.disconnect();
    setTimeout(() => {
      this.connect();
    }, 100);
  }
  
  private cleanupTimers(): void {
    // Clear all timers
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
    
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    
    if (this.authRetryTimeoutId) {
      clearTimeout(this.authRetryTimeoutId);
      this.authRetryTimeoutId = null;
    }
    
    if (this.roomRejoinTimeoutId) {
      clearTimeout(this.roomRejoinTimeoutId);
      this.roomRejoinTimeoutId = null;
    }
    
    if (this.authDelayTimeoutId) {
      clearTimeout(this.authDelayTimeoutId);
      this.authDelayTimeoutId = null;
    }
  }
  
  private cleanupWebSocket(): void {
    if (this.socket) {
      // Remove event handlers to prevent memory leaks
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      
      if (this.socket.readyState === WebSocket.OPEN || 
          this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close(1000, 'Client disconnect');
      }
      
      this.socket = null;
    }
  }
  
  ngOnDestroy(): void {
    // Clean up everything when service is destroyed
    this.shouldReconnect = false;
    this.cleanupTimers();
    this.cleanupWebSocket();
    
    // Complete subjects to prevent memory leaks
    this.destroy$.next();
    this.destroy$.complete();
    this.messageSubject.complete();
  }
}