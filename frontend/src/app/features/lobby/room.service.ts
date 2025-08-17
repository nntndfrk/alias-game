import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of, map } from 'rxjs';
import { AuthService } from '../auth/auth.service';

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
  
  private readonly currentRoom = signal<GameRoom | null>(null);
  private readonly availableRooms = signal<RoomInfo[]>([]);
  
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
          this.router.navigate(['/lobby']);
        }),
        catchError(error => {
          console.error('Failed to leave room:', error);
          return of(false);
        }),
        map(() => true)
      );
  }
  
  // WebSocket message handlers (to be implemented)
  updateRoom(room: GameRoom): void {
    this.currentRoom.set(room);
  }
  
  clearRoom(): void {
    this.currentRoom.set(null);
  }
}