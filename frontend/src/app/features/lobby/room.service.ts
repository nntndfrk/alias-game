import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of, map, Subscription } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { KickNotificationService } from '../../core/services/kick-notification.service';

export type UserRole = 'admin' | 'player';

export interface RoomParticipant {
  user_id: string;
  username: string;
  display_name: string;
  profile_image_url?: string;
  role: UserRole;
  team_id?: string;
  is_connected: boolean;
  joined_at: string;
}

export type RoomState = 'waiting' | 'ready' | 'in_progress' | 'paused' | 'finished';

export interface GameRoom {
  id?: string;
  room_code: string;
  name: string;
  admin_id: string;
  participants: Record<string, RoomParticipant>;
  state: RoomState;
  max_players: number;
  created_at: string;
  updated_at: string;
  game_data?: Record<string, unknown>;
}

export interface CreateRoomRequest {
  name: string;
  max_players: number;
}

export interface CreateRoomResponse {
  room_id: string;
  room_code: string;
  name: string;
  admin_id: string;
}

export interface JoinRoomRequest {
  room_code: string;
}

export interface RoomInfo {
  id: string;
  room_code: string;
  name: string;
  current_players: number;
  max_players: number;
  state: RoomState;
  admin_username: string;
}

@Injectable({
  providedIn: 'root'
})
export class RoomService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly wsService = inject(WebSocketService);
  private readonly kickNotificationService = inject(KickNotificationService);
  
  private readonly currentRoom = signal<GameRoom | null>(null);
  private readonly availableRooms = signal<RoomInfo[]>([]);
  
  private periodicSyncInterval?: ReturnType<typeof setInterval>;
  private subscriptions = new Subscription();

  constructor() {
    console.log('[RoomService] Constructor called');
    
    // Set up WebSocket message handlers
    this.setupWebSocketHandlers();
    
    // Don't set up periodic sync by default - let components opt-in if needed
    
    // Log WebSocket connection state
    console.log('[RoomService] WebSocket connection state:', {
      isConnected: this.wsService.isConnected(),
      isAuthenticated: this.wsService.isAuthenticated()
    });
  }
  
  readonly room = computed(() => this.currentRoom());
  readonly rooms = computed(() => this.availableRooms());
  readonly isAdmin = computed(() => {
    const room = this.currentRoom();
    const user = this.authService.user();
    return room && user && room.admin_id === user.id;
  });
  
  readonly userRole = computed(() => {
    const room = this.currentRoom();
    const user = this.authService.user();
    if (!room || !user) return null;
    
    const participant = room.participants[user.id];
    return participant?.role || null;
  });
  
  private readonly apiUrl = 'http://localhost:3000/api/v1/rooms';
  
  createRoom(request: CreateRoomRequest): Observable<CreateRoomResponse | null> {
    return this.http.post<CreateRoomResponse>(this.apiUrl, request)
      .pipe(
        tap(response => {
          // Navigate to the room after creation
          this.router.navigate(['/room', response.room_code]);
        }),
        catchError(error => {
          console.error('Failed to create room:', error);
          if (error.status === 401) {
            // Redirect to login if unauthorized
            this.router.navigate(['/']);
          }
          return of(null);
        })
      );
  }
  
  joinRoom(roomCode: string): Observable<GameRoom | null> {
    return this.http.post<GameRoom>(`${this.apiUrl}/${roomCode}/join`, null)
      .pipe(
        tap(room => {
          if (room) {
            this.currentRoom.set(room);
            // Connect to WebSocket after joining
            this.wsService.connect();
            // Wait for authentication, then join room via WebSocket
            this.waitForAuthenticationAndJoinRoom(roomCode);
            this.router.navigate(['/room', roomCode]);
          }
        }),
        catchError(error => {
          console.error('Failed to join room:', error);
          if (error.status === 401) {
            this.router.navigate(['/']);
          }
          return of(null);
        })
      );
  }
  
  getRoom(roomCode: string): Observable<GameRoom | null> {
    return this.http.get<GameRoom>(`${this.apiUrl}/${roomCode}`)
      .pipe(
        tap(room => {
          if (room) {
            this.currentRoom.set(room);
            // Connect to WebSocket if getting room info
            this.wsService.connect();
            // Wait for authentication, then join room via WebSocket
            this.waitForAuthenticationAndJoinRoom(roomCode);
          }
        }),
        catchError(error => {
          console.error('Failed to get room:', error);
          return of(null);
        })
      );
  }
  
  listRooms(): Observable<RoomInfo[]> {
    return this.http.get<RoomInfo[]>(this.apiUrl)
      .pipe(
        tap(rooms => this.availableRooms.set(rooms)),
        catchError(error => {
          console.error('Failed to list rooms:', error);
          return of([]);
        })
      );
  }
  
  leaveRoom(roomCode: string): Observable<boolean> {
    return this.http.post<void>(`${this.apiUrl}/${roomCode}/leave`, null)
      .pipe(
        tap(() => {
          this.currentRoom.set(null);
          // Disconnect WebSocket when leaving
          this.wsService.disconnect();
          this.router.navigate(['/lobby']);
        }),
        catchError(error => {
          console.error('Failed to leave room:', error);
          return of(false);
        }),
        map(() => true)
      );
  }

  kickPlayer(playerId: string): Observable<boolean> {
    // Use WebSocket for immediate kick
    this.wsService.kickPlayer(playerId);
    return of(true);
  }

  // Legacy REST API method (kept for compatibility)
  kickPlayerRest(roomCode: string, playerId: string): Observable<boolean> {
    return this.http.post<void>(`${this.apiUrl}/${roomCode}/kick/${playerId}`, null)
      .pipe(
        catchError(error => {
          console.error('Failed to kick player:', error);
          return of(false);
        }),
        map(() => true)
      );
  }
  
  private setupWebSocketHandlers(): void {
    // Handle room updates - this gives us the complete current state
    this.subscriptions.add(
      this.wsService.roomUpdated$.subscribe(room => {
        console.log('Received room_updated message with participants:', Object.keys(room.participants));
        this.currentRoom.set(room);
      })
    );

    // Handle initial room list response
    this.subscriptions.add(
      this.wsService.roomList$.subscribe(rooms => {
        console.log('[RoomService] Received room_list with', rooms.length, 'rooms');
        this.availableRooms.set(rooms);
      })
    );

    // Handle new room creation - update available rooms list
    this.subscriptions.add(
      this.wsService.roomCreated$.subscribe(roomInfo => {
      console.log('[RoomService] Received room_created message:', roomInfo);
      const currentRooms = this.availableRooms();
      console.log('[RoomService] Current rooms before update:', currentRooms);
      // Check if room already exists
      const existingIndex = currentRooms.findIndex(r => r.room_code === roomInfo.room_code);
      if (existingIndex === -1) {
        // Add new room to the list
        const updatedRooms = [...currentRooms, roomInfo];
        this.availableRooms.set(updatedRooms);
        console.log('[RoomService] Added new room, updated list:', updatedRooms);
      } else {
        // Update existing room
        const updatedRooms = [...currentRooms];
        updatedRooms[existingIndex] = roomInfo;
        this.availableRooms.set(updatedRooms);
        console.log('[RoomService] Updated existing room, updated list:', updatedRooms);
      }
      })
    );

    // Handle room deletion - remove from available rooms list
    this.subscriptions.add(
      this.wsService.roomDeleted$.subscribe(roomCode => {
      console.log('Received room_deleted message:', roomCode);
      const currentRooms = this.availableRooms();
      const filteredRooms = currentRooms.filter(r => r.room_code !== roomCode);
      this.availableRooms.set(filteredRooms);
      })
    );

    // Handle room info updates - update player counts, etc.
    this.subscriptions.add(
      this.wsService.roomInfoUpdated$.subscribe(roomInfo => {
      console.log('Received room_info_updated message:', roomInfo);
      const currentRooms = this.availableRooms();
      const existingIndex = currentRooms.findIndex(r => r.room_code === roomInfo.room_code);
      if (existingIndex !== -1) {
        const updatedRooms = [...currentRooms];
        updatedRooms[existingIndex] = roomInfo;
        this.availableRooms.set(updatedRooms);
      }
      })
    );

    // Handle user joined
    this.subscriptions.add(
      this.wsService.userJoined$.subscribe(participant => {
        console.log('Received user_joined message:', participant);
        const currentRoom = this.currentRoom();
        if (currentRoom) {
          console.log('Current room before update:', currentRoom);
          const updatedParticipants = { 
            ...currentRoom.participants, 
            [participant.user_id]: participant 
          };
          const updatedRoom = {
            ...currentRoom,
            participants: updatedParticipants,
            updated_at: new Date().toISOString()
          };
          console.log('Updated room after user joined:', updatedRoom);
          this.currentRoom.set(updatedRoom);
        } else {
          console.warn('Received user_joined but no current room');
        }
      })
    );

    // Handle user left
    this.subscriptions.add(
      this.wsService.userLeft$.subscribe(userId => {
        const currentRoom = this.currentRoom();
        if (currentRoom) {
          const updatedParticipants = { ...currentRoom.participants };
          delete updatedParticipants[userId];
          this.currentRoom.set({
            ...currentRoom,
            participants: updatedParticipants,
            updated_at: new Date().toISOString()
          });
        }
      })
    );

    // Handle user kicked
    this.subscriptions.add(
      this.wsService.userKicked$.subscribe(({ user_id, kicked_by }) => {
        const currentRoom = this.currentRoom();
        const currentUser = this.authService.user();
        
        if (currentRoom) {
          // const kickedParticipant = currentRoom.participants[user_id];
          const kickedByParticipant = currentRoom.participants[kicked_by];
          
          const updatedParticipants = { ...currentRoom.participants };
          delete updatedParticipants[user_id];
          this.currentRoom.set({
            ...currentRoom,
            participants: updatedParticipants,
            updated_at: new Date().toISOString()
          });

          // If current user was kicked, show custom modal
          if (currentUser && user_id === currentUser.id) {
            this.wsService.disconnect();
            this.currentRoom.set(null);
            
            // Show kick notification modal with details
            this.kickNotificationService.showKickNotification({
              kicked_by_username: kickedByParticipant?.username,
              kicked_by_display_name: kickedByParticipant?.display_name,
              room_name: currentRoom.name,
              reason: undefined // Could be extended in the future
            });
            
            this.router.navigate(['/lobby']);
          }
        }
      })
    );

    // Handle role updates
    this.subscriptions.add(
      this.wsService.roleUpdated$.subscribe(({ user_id, role }) => {
        const currentRoom = this.currentRoom();
        if (currentRoom && currentRoom.participants[user_id]) {
          const updatedParticipants = { ...currentRoom.participants };
          updatedParticipants[user_id] = { 
            ...updatedParticipants[user_id], 
            role 
          };
          
          // Update admin if role changed to admin
          const updatedRoom = { ...currentRoom, participants: updatedParticipants };
          if (role === 'admin') {
            updatedRoom.admin_id = user_id;
          }
          
          this.currentRoom.set(updatedRoom);
        }
      })
    );

    // Handle WebSocket errors
    this.subscriptions.add(
      this.wsService.error$.subscribe(error => {
        console.error('WebSocket error:', error);
      })
    );
  }

  // WebSocket message handlers (legacy - kept for compatibility)
  updateRoom(room: GameRoom): void {
    this.currentRoom.set(room);
  }
  
  clearRoom(): void {
    this.currentRoom.set(null);
    this.wsService.disconnect();
  }

  private waitForAuthenticationAndJoinRoom(roomCode: string): void {
    // Wait for WebSocket authentication, then join room
    const authCheckInterval = setInterval(() => {
      if (this.wsService.isAuthenticated()) {
        clearInterval(authCheckInterval);
        this.wsService.joinRoom(roomCode);
      }
    }, 100) as ReturnType<typeof setInterval>; // Check every 100ms

    // Timeout after 5 seconds
    setTimeout(() => {
      clearInterval(authCheckInterval);
    }, 5000);
  }

  // Start periodic room sync (only if needed as fallback)
  startPeriodicRoomSync(intervalMs = 30000): void {
    // Clear any existing interval
    this.stopPeriodicRoomSync();
    
    console.log('[RoomService] Starting periodic room sync with interval:', intervalMs);
    
    this.periodicSyncInterval = setInterval(() => {
      const currentRoom = this.currentRoom();
      if (currentRoom && this.authService.isAuthenticated()) {
        // Only sync if we're not getting WebSocket updates
        if (!this.wsService.isConnected() || !this.wsService.isAuthenticated()) {
          console.log('[RoomService] WebSocket not available, performing HTTP sync for room:', currentRoom.room_code);
          this.getRoom(currentRoom.room_code).subscribe({
            next: (room) => {
              if (room) {
                console.log('[RoomService] Periodic sync completed. Participants:', Object.keys(room.participants));
              }
            },
            error: (error) => {
              console.error('[RoomService] Periodic room sync failed:', error);
            }
          });
        }
      }
    }, intervalMs);
  }
  
  // Stop periodic room sync
  stopPeriodicRoomSync(): void {
    if (this.periodicSyncInterval) {
      console.log('[RoomService] Stopping periodic room sync');
      clearInterval(this.periodicSyncInterval);
      this.periodicSyncInterval = undefined;
    }
  }
  
  // Clean up method for service destruction
  destroy(): void {
    this.stopPeriodicRoomSync();
    this.subscriptions.unsubscribe();
  }
}