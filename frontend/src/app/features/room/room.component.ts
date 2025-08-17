import { Component, OnInit, OnDestroy, inject, signal, effect, computed, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardContentComponent } from '@shared/ui';
import { RoomService, type RoomParticipant } from '../lobby/room.service';
import { AuthService } from '../auth/auth.service';
import { KickConfirmationModalComponent } from './kick-confirmation-modal.component';
import { WebSocketService } from '../../core/services/websocket.service';

@Component({
  selector: 'alias-room',
  standalone: true,
  imports: [CommonModule, ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardContentComponent, KickConfirmationModalComponent],
  template: `
    <div class="max-w-6xl mx-auto">
      @if (room()) {
        <div class="mb-8">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-3xl font-bold mb-2">{{ room()!.name }}</h1>
              <p class="text-muted-foreground">Room Code: <span class="font-mono font-bold">{{ room()!.room_code }}</span></p>
            </div>
            <div class="flex gap-3">
              @if (isAdmin()) {
                <alias-button variant="outline">Settings</alias-button>
                <alias-button [disabled]="!canStartGame()">Start Game</alias-button>
              }
              <alias-button variant="destructive" (click)="leaveRoom()">Leave Room</alias-button>
            </div>
          </div>
        </div>
        
        <div class="grid gap-6 lg:grid-cols-3">
          <!-- Players List -->
          <div class="lg:col-span-2">
            <alias-card>
              <alias-card-header>
                <alias-card-title>Players ({{ participantCount() }}/{{ room()!.max_players }})</alias-card-title>
              </alias-card-header>
              <alias-card-content>
                <div class="grid gap-4 md:grid-cols-2">
                  @for (participant of participants(); track participant.user_id) {
                    <div 
                      class="relative flex items-center gap-3 p-3 border rounded-lg transition-all"
                      [class.bg-primary-10]="participant.role === 'admin'"
                      [class.border-primary]="participant.role === 'admin'"
                      [class.shadow-sm]="participant.role === 'admin'"
                    >
                      @if (participant.role === 'admin') {
                        <div class="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full font-medium">
                          <svg class="inline-block w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                          </svg>
                          Admin
                        </div>
                      }
                      
                      @if (participant.profile_image_url) {
                        <img 
                          [src]="participant.profile_image_url" 
                          [alt]="participant.display_name" 
                          class="w-10 h-10 rounded-full"
                          [class.ring-2]="participant.role === 'admin'"
                          [class.ring-primary]="participant.role === 'admin'"
                        />
                      } @else {
                        <div 
                          class="w-10 h-10 rounded-full flex items-center justify-center"
                          [class.bg-primary]="participant.role === 'admin'"
                          [class.text-primary-foreground]="participant.role === 'admin'"
                          [class.bg-muted]="participant.role !== 'admin'"
                        >
                          <span class="text-sm font-medium">{{ participant.display_name[0].toUpperCase() }}</span>
                        </div>
                      }
                      
                      <div class="flex-1">
                        <div class="font-medium">
                          {{ participant.display_name }}
                          @if (participant.user_id === currentUserId()) {
                            <span class="text-xs text-muted-foreground"> (You)</span>
                          }
                        </div>
                        <div class="text-sm text-muted-foreground">
                          @if (participant.role === 'admin') {
                            <span class="text-primary font-medium">
                              <svg class="inline-block w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Admin
                            </span>
                          } @else {
                            <span>Player</span>
                          }
                          @if (!participant.is_connected) {
                            <span class="text-red-500"> • Disconnected</span>
                          }
                        </div>
                      </div>
                      
                      @if (isAdmin() && participant.user_id !== currentUserId() && participant.role !== 'admin') {
                        <alias-button 
                          size="sm" 
                          variant="destructive" 
                          (click)="openKickModal(participant)" 
                          class="ml-2"
                        >
                          Kick
                        </alias-button>
                      }
                    </div>
                  }
                </div>
              </alias-card-content>
            </alias-card>
          </div>
          
          <!-- Room Info -->
          <div>
            <alias-card>
              <alias-card-header>
                <alias-card-title>Room Info</alias-card-title>
              </alias-card-header>
              <alias-card-content>
                <dl class="space-y-3">
                  <div>
                    <dt class="text-sm font-medium text-muted-foreground">Status</dt>
                    <dd class="font-medium capitalize">{{ room()!.state.replace('_', ' ') }}</dd>
                  </div>
                  <div>
                    <dt class="text-sm font-medium text-muted-foreground">Your Role</dt>
                    <dd class="font-medium capitalize">{{ userRole() || 'Player' }}</dd>
                  </div>
                  <div>
                    <dt class="text-sm font-medium text-muted-foreground">Created At</dt>
                    <dd class="font-medium">{{ formatDate(room()!.created_at) }}</dd>
                  </div>
                </dl>
                
                @if (isAdmin()) {
                  <div class="mt-6 p-4 bg-primary-10 rounded-lg">
                    <h4 class="font-medium mb-2">Admin Controls</h4>
                    <p class="text-sm text-muted-foreground mb-3">
                      As the room admin, you can start the game and manage players. Click the "Kick" button next to any player to remove them from the room.
                    </p>
                    <div class="space-y-2">
                      <alias-button size="sm" variant="outline" class="w-full">Transfer Admin</alias-button>
                    </div>
                  </div>
                }
              </alias-card-content>
            </alias-card>
          </div>
        </div>
      } @else {
        <div class="text-center py-12">
          <p class="text-muted-foreground">Loading room...</p>
        </div>
      }
      
      <!-- Kick Confirmation Modal -->
      <alias-kick-confirmation-modal 
        #kickModal 
        [player]="selectedPlayerToKick()" 
        (confirmed)="onKickConfirmed($event)" 
        (cancelled)="onKickCancelled()"
      ></alias-kick-confirmation-modal>
    </div>
  `
})
export class RoomComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly roomService = inject(RoomService);
  private readonly authService = inject(AuthService);
  private readonly wsService = inject(WebSocketService);
  
  private monitorInterval?: ReturnType<typeof setInterval>;
  private monitorTimeout?: ReturnType<typeof setTimeout>;
  
  readonly room = this.roomService.room;
  readonly isAdmin = this.roomService.isAdmin;
  readonly userRole = this.roomService.userRole;
  readonly currentUserId = computed(() => this.authService.user()?.id || '');
  
  readonly participants = signal<RoomParticipant[]>([]);
  readonly participantCount = signal(0);
  readonly selectedPlayerToKick = signal<RoomParticipant | null>(null);
  
  private readonly kickModal = viewChild.required(KickConfirmationModalComponent);
  
  constructor() {
    // Update participants when room changes
    effect(() => {
      const room = this.room();
      if (room) {
        this.updateParticipants();
      }
    }, { allowSignalWrites: true });
  }
  
  ngOnInit(): void {
    const roomCode = this.route.snapshot.paramMap.get('code');
    if (roomCode) {
      // Check if we already have room data (from join operation)
      const currentRoom = this.room();
      if (currentRoom && currentRoom.room_code === roomCode) {
        // Room is already loaded, no need to fetch again
        // But start periodic sync as fallback if WebSocket fails
        this.startPeriodicSyncIfNeeded();
      } else {
        this.loadRoom(roomCode);
      }
    } else {
      this.router.navigate(['/lobby']);
    }
  }
  
  ngOnDestroy(): void {
    // Stop periodic sync when leaving the room
    this.roomService.stopPeriodicRoomSync();
    
    // Clean up intervals and timeouts
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    if (this.monitorTimeout) {
      clearTimeout(this.monitorTimeout);
    }
  }
  
  private startPeriodicSyncIfNeeded(): void {
    // Only start periodic sync if WebSocket is not connected
    if (!this.wsService.isConnected() || !this.wsService.isAuthenticated()) {
      console.log('[RoomComponent] Starting periodic sync as WebSocket fallback');
      this.roomService.startPeriodicRoomSync(15000); // Every 15 seconds
    }
    
    // Monitor WebSocket connection and stop periodic sync when connected
    this.monitorInterval = setInterval(() => {
      if (this.wsService.isConnected() && this.wsService.isAuthenticated()) {
        console.log('[RoomComponent] WebSocket connected, stopping periodic sync');
        this.roomService.stopPeriodicRoomSync();
        if (this.monitorInterval) {
          clearInterval(this.monitorInterval);
          this.monitorInterval = undefined;
        }
      }
    }, 1000) as ReturnType<typeof setInterval>;
    
    // Clean up after 30 seconds
    this.monitorTimeout = setTimeout(() => {
      if (this.monitorInterval) {
        clearInterval(this.monitorInterval);
        this.monitorInterval = undefined;
      }
    }, 30000) as ReturnType<typeof setTimeout>;
  }
  
  private loadRoom(roomCode: string): void {
    this.roomService.getRoom(roomCode).subscribe({
      next: (room) => {
        if (!room) {
          this.router.navigate(['/lobby']);
        }
        // updateParticipants is called automatically via effect
        
        // Start periodic sync as fallback
        this.startPeriodicSyncIfNeeded();
      },
      error: () => {
        this.router.navigate(['/lobby']);
      }
    });
  }
  
  private updateParticipants(): void {
    const room = this.room();
    if (room) {
      const participantList = Object.values(room.participants);
      
      // Sort participants: admin first, then by joined_at
      const sortedParticipants = participantList.sort((a, b) => {
        // Admin always comes first
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (b.role === 'admin' && a.role !== 'admin') return 1;
        
        // Then sort by joined_at (earliest first)
        return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
      });
      
      this.participants.set(sortedParticipants);
      this.participantCount.set(sortedParticipants.length);
    }
  }
  
  canStartGame(): boolean {
    const room = this.room();
    if (!room) return false;
    
    // Need at least 4 players to start
    return this.participantCount() >= 4 && room.state === 'waiting';
  }
  
  leaveRoom(): void {
    const room = this.room();
    if (room) {
      this.roomService.leaveRoom(room.room_code).subscribe();
    }
  }

  openKickModal(player: RoomParticipant): void {
    this.selectedPlayerToKick.set(player);
    this.kickModal().open();
  }

  onKickConfirmed(player: RoomParticipant): void {
    // Use WebSocket for immediate kick
    this.roomService.kickPlayer(player.user_id).subscribe({
      next: (success) => {
        this.kickModal().setKicking(false);
        if (success) {
          console.log('Player kick request sent');
        }
      },
      error: (error) => {
        this.kickModal().setKicking(false);
        console.error('Failed to send kick request:', error);
        alert('Failed to kick player. Please try again.');
      }
    });
  }

  onKickCancelled(): void {
    this.selectedPlayerToKick.set(null);
  }
  
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString();
  }
}