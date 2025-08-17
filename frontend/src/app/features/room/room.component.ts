import { Component, OnInit, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardContentComponent } from '@shared/ui';
import { RoomService } from '../lobby/room.service';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'alias-room',
  standalone: true,
  imports: [CommonModule, ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardContentComponent],
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
                    <div class="flex items-center gap-3 p-3 border rounded-lg">
                      @if (participant.profile_image_url) {
                        <img 
                          [src]="participant.profile_image_url" 
                          [alt]="participant.display_name"
                          class="w-10 h-10 rounded-full"
                        >
                      } @else {
                        <div class="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
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
                            <span class="text-primary font-medium">Admin</span>
                          } @else {
                            Player
                          }
                          @if (!participant.is_connected) {
                            <span class="text-red-500"> • Disconnected</span>
                          }
                        </div>
                      </div>
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
                  <div class="mt-6 p-4 bg-primary/10 rounded-lg">
                    <h4 class="font-medium mb-2">Admin Controls</h4>
                    <p class="text-sm text-muted-foreground mb-3">
                      As the room admin, you can start the game and manage players.
                    </p>
                    <div class="space-y-2">
                      <alias-button size="sm" variant="outline" class="w-full">Kick Player</alias-button>
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
    </div>
  `
})
export class RoomComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly roomService = inject(RoomService);
  private readonly authService = inject(AuthService);
  
  readonly room = this.roomService.room;
  readonly isAdmin = this.roomService.isAdmin;
  readonly userRole = this.roomService.userRole;
  readonly currentUserId = computed(() => this.authService.user()?.id || '');
  
  readonly participants = signal<any[]>([]);
  readonly participantCount = signal(0);
  
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
      } else {
        this.loadRoom(roomCode);
      }
    } else {
      this.router.navigate(['/lobby']);
    }
  }
  
  private loadRoom(roomCode: string): void {
    this.roomService.getRoom(roomCode).subscribe({
      next: (room) => {
        if (!room) {
          this.router.navigate(['/lobby']);
        }
        // updateParticipants is called automatically via effect
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
      this.participants.set(participantList);
      this.participantCount.set(participantList.length);
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
  
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString();
  }
}