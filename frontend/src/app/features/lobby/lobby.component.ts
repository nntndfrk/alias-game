import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardContentComponent } from '@shared/ui';
import { RoomService } from './room.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { Subscription } from 'rxjs';
import { filter, take } from 'rxjs/operators';

@Component({
  selector: 'alias-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardContentComponent],
  template: `
    <div class="max-w-6xl mx-auto">
      <div class="mb-8">
        <h1 class="text-3xl font-bold mb-2">Game Lobby</h1>
        <p class="text-muted-foreground">Create or join a room to start playing</p>
        
        @if (errorMessage()) {
          <div data-cy="error-message" class="mt-4 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg">
            <p class="text-red-700 dark:text-red-400 text-sm">{{ errorMessage() }}</p>
          </div>
        }
      </div>
      
      <div class="grid gap-6 lg:grid-cols-2">
        <alias-card data-cy="create-room-card">
          <alias-card-header>
            <alias-card-title>Create Room</alias-card-title>
          </alias-card-header>
          <alias-card-content>
            <div class="space-y-4">
              <div>
                <label for="room-name" class="block text-sm font-medium mb-2">Room Name</label>
                <input 
                  id="room-name"
                  data-cy="room-name-input"
                  type="text" 
                  [(ngModel)]="roomName"
                  placeholder="Enter room name..." 
                  class="w-full px-3 py-2 border rounded-md bg-background text-foreground border-input placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              </div>
              <div>
                <label for="max-players" class="block text-sm font-medium mb-2">Max Players</label>
                <div class="relative">
                  <select id="max-players" data-cy="max-players-select" [(ngModel)]="maxPlayers" class="w-full px-3 py-2 pr-10 border rounded-md bg-background text-foreground border-input focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 appearance-none">
                    <option [value]="6">6 Players</option>
                    <option [value]="8">8 Players</option>
                    <option [value]="10">10 Players</option>
                  </select>
                  <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <svg class="h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>
              <div class="pt-2">
                <alias-button data-cy="create-room-button" class="w-full" (click)="createRoom()" [disabled]="isCreating()">{{ isCreating() ? 'Creating...' : 'Create Room' }}</alias-button>
              </div>
            </div>
          </alias-card-content>
        </alias-card>
        
        <alias-card>
          <alias-card-header>
            <alias-card-title>Join Room</alias-card-title>
          </alias-card-header>
          <alias-card-content>
            <div class="space-y-4">
              <div>
                <label for="room-code" class="block text-sm font-medium mb-2">Room Code</label>
                <input 
                  id="room-code"
                  data-cy="room-code-input"
                  type="text" 
                  [(ngModel)]="roomCode"
                  placeholder="Enter room code..." 
                  class="w-full px-3 py-2 border rounded-md bg-background text-foreground border-input placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              </div>
              <div class="pt-2">
                <alias-button data-cy="join-room-button" variant="outline" class="w-full" (click)="joinRoom()" [disabled]="isJoining()">{{ isJoining() ? 'Joining...' : 'Join Room' }}</alias-button>
              </div>
            </div>
            
            <div class="mt-6">
              <h3 class="font-medium mb-3">Available Rooms</h3>
              @if (rooms().length > 0) {
                <div data-cy="available-rooms" class="space-y-2">
                  @for (room of rooms(); track room.id) {
                    <div data-cy="room-item" class="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div data-cy="room-name" class="font-medium">{{ room.name }}</div>
                        <div data-cy="room-players" class="text-sm text-muted-foreground">{{ room.current_players }}/{{ room.max_players }} players</div>
                        <div data-cy="room-host" class="text-xs text-muted-foreground">Host: {{ room.admin_username }}</div>
                      </div>
                      <alias-button data-cy="join-room-button" size="sm" (click)="joinRoomByCode(room.room_code)">Join</alias-button>
                    </div>
                  }
                </div>
              } @else {
                <p class="text-sm text-muted-foreground">No rooms available</p>
              }
            </div>
          </alias-card-content>
        </alias-card>
      </div>
    </div>
  `
})
export class LobbyComponent implements OnInit, OnDestroy {
  private readonly roomService = inject(RoomService);
  private readonly wsService = inject(WebSocketService);
  private authSubscription?: Subscription;
  private authCheckTimeout?: ReturnType<typeof setTimeout>;
  
  // Form inputs
  roomName = '';
  maxPlayers = 6;
  roomCode = '';
  
  // Loading states
  readonly isCreating = signal(false);
  readonly isJoining = signal(false);
  readonly errorMessage = signal<string | null>(null);
  
  // Available rooms
  readonly rooms = this.roomService.rooms;
  
  ngOnInit(): void {
    console.log('[LobbyComponent] Initializing...');
    
    // Load rooms immediately via HTTP to show something quickly
    this.roomService.listRooms().subscribe({
      next: (rooms) => {
        console.log('[LobbyComponent] Initial HTTP room list loaded:', rooms.length, 'rooms');
      }
    });
    
    // Connect to WebSocket for real-time updates
    this.wsService.connect();
    
    // Listen for authentication success
    this.setupAuthenticationListener();
    
    // Also try immediate request in case already authenticated
    if (this.wsService.isAuthenticated()) {
      console.log('[LobbyComponent] Already authenticated, requesting room list via WebSocket');
      this.wsService.requestRoomList();
    } else {
      // Fallback with timeout
      this.waitForAuthAndRequestRooms();
    }
  }
  
  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
    if (this.authCheckTimeout) {
      clearTimeout(this.authCheckTimeout);
    }
  }
  
  private setupAuthenticationListener(): void {
    // Listen for authentication messages
    this.authSubscription = this.wsService.messages$
      .pipe(
        filter(msg => msg.type === 'authenticated'),
        take(1) // Only need the first authentication
      )
      .subscribe(() => {
        console.log('[LobbyComponent] Received authentication message, requesting room list');
        // Small delay to ensure everything is set up
        setTimeout(() => {
          this.wsService.requestRoomList();
        }, 100);
      });
  }
  
  private waitForAuthAndRequestRooms(): void {
    let checkCount = 0;
    const maxChecks = 100; // 10 seconds max (100 * 100ms)
    
    const checkAuth = () => {
      checkCount++;
      
      // First check if WebSocket is connected
      if (!this.wsService.isConnected()) {
        console.log('[LobbyComponent] Waiting for WebSocket connection...', checkCount);
        if (checkCount < maxChecks) {
          this.authCheckTimeout = setTimeout(checkAuth, 100);
        } else {
          console.error('[LobbyComponent] WebSocket connection timeout');
          // Fallback to HTTP request
          console.log('[LobbyComponent] Falling back to HTTP request for room list');
          this.roomService.listRooms().subscribe();
        }
        return;
      }
      
      // Then check if authenticated
      if (this.wsService.isAuthenticated()) {
        console.log('[LobbyComponent] Authenticated after', checkCount, 'checks, requesting room list');
        this.wsService.requestRoomList();
      } else if (checkCount < maxChecks) {
        console.log('[LobbyComponent] Waiting for authentication...', checkCount);
        this.authCheckTimeout = setTimeout(checkAuth, 100);
      } else {
        console.error('[LobbyComponent] Authentication timeout after', checkCount, 'checks');
        // Fallback to HTTP request
        console.log('[LobbyComponent] Falling back to HTTP request for room list');
        this.roomService.listRooms().subscribe();
      }
    };
    
    // Start checking
    checkAuth();
  }
  
  createRoom(): void {
    if (!this.roomName.trim()) {
      this.errorMessage.set('Please enter a room name');
      return;
    }
    
    this.isCreating.set(true);
    this.errorMessage.set(null);
    
    this.roomService.createRoom({
      name: this.roomName,
      max_players: this.maxPlayers
    }).subscribe({
      next: (response) => {
        this.isCreating.set(false);
        if (response) {
          this.roomName = '';
          // Success - navigation handled by service
        } else {
          this.errorMessage.set('Failed to create room. Please try again.');
        }
      },
      error: () => {
        this.isCreating.set(false);
        this.errorMessage.set('Failed to create room. Please check your connection.');
      }
    });
  }
  
  joinRoom(): void {
    if (!this.roomCode.trim()) {
      this.errorMessage.set('Please enter a room code');
      return;
    }
    
    this.joinRoomByCode(this.roomCode);
  }
  
  joinRoomByCode(code: string): void {
    this.isJoining.set(true);
    this.errorMessage.set(null);
    
    this.roomService.joinRoom(code).subscribe({
      next: (room) => {
        this.isJoining.set(false);
        if (room) {
          this.roomCode = '';
          // Success - navigation handled by service
        } else {
          this.errorMessage.set('Failed to join room. Room may not exist or be full.');
        }
      },
      error: () => {
        this.isJoining.set(false);
        this.errorMessage.set('Failed to join room. Please check your connection.');
      }
    });
  }
}