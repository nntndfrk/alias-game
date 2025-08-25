import { Component, OnInit, OnDestroy, signal, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { 
  ButtonComponent, 
  CardComponent, 
  CardHeaderComponent, 
  CardTitleComponent, 
  CardContentComponent,
  CardDescriptionComponent 
} from '@shared/ui';
import { WebSocketService, WebSocketMessage } from '@core/services/websocket.service';
import { AuthService } from '../../auth/auth.service';

interface Team {
  id: string;
  name: string;
  color: string;
  players: string[];
  score: number;
  is_ready: boolean;
}

interface RoomParticipant {
  user_id: string;
  username: string;
  display_name: string;
  profile_image_url?: string;
  role: 'admin' | 'player';
  team_id?: string;
  is_connected: boolean;
}

interface GameRoom {
  room_code: string;
  name: string;
  admin_id: string;
  participants: Record<string, RoomParticipant>;
  state: 'waiting' | 'ready' | 'in_progress' | 'paused' | 'finished';
  max_players: number;
}

@Component({
  selector: 'alias-team-selection',
  standalone: true,
  imports: [
    CommonModule,
    ButtonComponent,
    CardComponent,
    CardHeaderComponent,
    CardTitleComponent,
    CardContentComponent,
    CardDescriptionComponent
  ],
  template: `
    <div class="max-w-6xl mx-auto p-4">
      <!-- Room Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold mb-2">{{ room()?.name || 'Game Room' }}</h1>
        <div class="flex items-center gap-4 text-muted-foreground">
          <span>Room Code: <strong class="text-foreground">{{ room()?.room_code }}</strong></span>
          <span>•</span>
          <span>Players: {{ playerCount() }}/{{ room()?.max_players || 8 }}</span>
          <span>•</span>
          <span class="capitalize">Status: {{ room()?.state || 'waiting' }}</span>
        </div>
      </div>

      <!-- Teams Section -->
      <div class="grid gap-6 lg:grid-cols-2 mb-8">
        <!-- Team A -->
        <alias-card [class.ring-2]="currentUserTeam() === 'team_a'" class="ring-primary">
          <alias-card-header>
            <alias-card-title>
              <div class="flex items-center justify-between">
                <span [style.color]="teams()[0]?.color">{{ teams()[0]?.name || 'Team A' }}</span>
                @if (teams()[0]?.is_ready) {
                  <span class="text-sm text-green-600 font-normal">✓ Ready</span>
                }
              </div>
            </alias-card-title>
            <alias-card-description>
              {{ teams()[0].players.length }} players
            </alias-card-description>
          </alias-card-header>
          <alias-card-content>
            <div class="space-y-3 mb-4">
              @for (playerId of teams()[0]?.players || []; track playerId) {
                <div class="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  @if (getParticipant(playerId)?.profile_image_url) {
                    <img 
                      [src]="getParticipant(playerId)?.profile_image_url" 
                      [alt]="getParticipant(playerId)?.display_name"
                      class="w-8 h-8 rounded-full"
                    >
                  } @else {
                    <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      {{ getParticipant(playerId)?.display_name?.charAt(0) || '?' }}
                    </div>
                  }
                  <div class="flex-1">
                    <div class="font-medium">{{ getParticipant(playerId)?.display_name }}</div>
                    @if (getParticipant(playerId)?.role === 'admin') {
                      <span class="text-xs text-muted-foreground">Admin</span>
                    }
                  </div>
                  @if (!getParticipant(playerId)?.is_connected) {
                    <span class="text-xs text-red-500">Offline</span>
                  }
                </div>
              } @empty {
                <div class="text-center py-4 text-muted-foreground">
                  No players yet
                </div>
              }
            </div>
            
            @if (currentUserTeam() === null) {
              <alias-button 
                (click)="joinTeam('team_a')" 
                class="w-full"
                [disabled]="!canJoinTeam('team_a')"
              >
                Join Team
              </alias-button>
            } @else if (currentUserTeam() === 'team_a') {
              <div class="flex gap-2">
                <alias-button 
                  (click)="leaveTeam()" 
                  variant="outline"
                  class="flex-1"
                >
                  Leave Team
                </alias-button>
                @if (!teams()[0]?.is_ready) {
                  <alias-button 
                    (click)="markReady()"
                    class="flex-1"
                    [disabled]="!canMarkReady()"
                  >
                    Mark Ready
                  </alias-button>
                }
              </div>
            }
          </alias-card-content>
        </alias-card>

        <!-- Team B -->
        <alias-card [class.ring-2]="currentUserTeam() === 'team_b'" class="ring-primary">
          <alias-card-header>
            <alias-card-title>
              <div class="flex items-center justify-between">
                <span [style.color]="teams()[1]?.color">{{ teams()[1]?.name || 'Team B' }}</span>
                @if (teams()[1]?.is_ready) {
                  <span class="text-sm text-green-600 font-normal">✓ Ready</span>
                }
              </div>
            </alias-card-title>
            <alias-card-description>
              {{ teams()[1].players.length }} players
            </alias-card-description>
          </alias-card-header>
          <alias-card-content>
            <div class="space-y-3 mb-4">
              @for (playerId of teams()[1]?.players || []; track playerId) {
                <div class="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  @if (getParticipant(playerId)?.profile_image_url) {
                    <img 
                      [src]="getParticipant(playerId)?.profile_image_url" 
                      [alt]="getParticipant(playerId)?.display_name"
                      class="w-8 h-8 rounded-full"
                    >
                  } @else {
                    <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      {{ getParticipant(playerId)?.display_name?.charAt(0) || '?' }}
                    </div>
                  }
                  <div class="flex-1">
                    <div class="font-medium">{{ getParticipant(playerId)?.display_name }}</div>
                    @if (getParticipant(playerId)?.role === 'admin') {
                      <span class="text-xs text-muted-foreground">Admin</span>
                    }
                  </div>
                  @if (!getParticipant(playerId)?.is_connected) {
                    <span class="text-xs text-red-500">Offline</span>
                  }
                </div>
              } @empty {
                <div class="text-center py-4 text-muted-foreground">
                  No players yet
                </div>
              }
            </div>
            
            @if (currentUserTeam() === null) {
              <alias-button 
                (click)="joinTeam('team_b')" 
                class="w-full"
                [disabled]="!canJoinTeam('team_b')"
              >
                Join Team
              </alias-button>
            } @else if (currentUserTeam() === 'team_b') {
              <div class="flex gap-2">
                <alias-button 
                  (click)="leaveTeam()" 
                  variant="outline"
                  class="flex-1"
                >
                  Leave Team
                </alias-button>
                @if (!teams()[1]?.is_ready) {
                  <alias-button 
                    (click)="markReady()"
                    class="flex-1"
                    [disabled]="!canMarkReady()"
                  >
                    Mark Ready
                  </alias-button>
                }
              </div>
            }
          </alias-card-content>
        </alias-card>
      </div>

      <!-- Observers Section -->
      <alias-card class="mb-8">
        <alias-card-header>
          <alias-card-title>Observers</alias-card-title>
          <alias-card-description>
            Players not in any team
          </alias-card-description>
        </alias-card-header>
        <alias-card-content>
          <div class="flex flex-wrap gap-3">
            @for (participant of observers(); track participant.user_id) {
              <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
                @if (participant.profile_image_url) {
                  <img 
                    [src]="participant.profile_image_url" 
                    [alt]="participant.display_name"
                    class="w-6 h-6 rounded-full"
                  >
                } @else {
                  <div class="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs">
                    {{ participant.display_name?.charAt(0) || '?' }}
                  </div>
                }
                <span class="text-sm font-medium">{{ participant.display_name }}</span>
                @if (participant.role === 'admin') {
                  <span class="text-xs text-muted-foreground">(Admin)</span>
                }
              </div>
            } @empty {
              <span class="text-muted-foreground">No observers</span>
            }
          </div>
        </alias-card-content>
      </alias-card>

      <!-- Game Controls (Admin Only) -->
      @if (isAdmin()) {
        <alias-card>
          <alias-card-header>
            <alias-card-title>Game Controls</alias-card-title>
            <alias-card-description>
              Admin controls for managing the game
            </alias-card-description>
          </alias-card-header>
          <alias-card-content>
            <div class="flex gap-4">
              @if (room()?.state === 'waiting' || room()?.state === 'ready') {
                <alias-button 
                  (click)="startGame()"
                  [disabled]="!canStartGame()"
                  class="flex-1"
                >
                  Start Game
                </alias-button>
              }
              
              @if (room()?.state === 'in_progress') {
                <alias-button 
                  (click)="pauseGame()"
                  variant="outline"
                  class="flex-1"
                >
                  Pause Game
                </alias-button>
              }
              
              @if (room()?.state === 'paused') {
                <alias-button 
                  (click)="resumeGame()"
                  class="flex-1"
                >
                  Resume Game
                </alias-button>
              }
              
              <alias-button 
                (click)="autoBalance()"
                variant="outline"
                [disabled]="room()?.state !== 'waiting'"
              >
                Auto-Balance Teams
              </alias-button>
            </div>
            
            @if (!canStartGame() && room()?.state === 'waiting') {
              <div class="mt-4 text-sm text-muted-foreground">
                <p>Cannot start game:</p>
                <ul class="list-disc list-inside mt-2">
                  @if (!hasMinimumPlayers()) {
                    <li>Need at least 2 players per team</li>
                  }
                  @if (!teamsAreBalanced()) {
                    <li>Teams are unbalanced (max 2 player difference)</li>
                  }
                  @if (!allTeamsReady()) {
                    <li>All teams must be marked as ready</li>
                  }
                </ul>
              </div>
            }
          </alias-card-content>
        </alias-card>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class TeamSelectionComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  room = signal<GameRoom | null>(null);
  teams = signal<Team[]>([
    { id: 'team_a', name: 'Команда А', color: '#FF6B6B', players: [], score: 0, is_ready: false },
    { id: 'team_b', name: 'Команда Б', color: '#4ECDC4', players: [], score: 0, is_ready: false }
  ]);
  
  currentUserId = signal<string>('');
  
  playerCount = computed(() => {
    const r = this.room();
    return r ? Object.keys(r.participants).length : 0;
  });
  
  currentUserTeam = computed(() => {
    const userId = this.currentUserId();
    const r = this.room();
    if (!userId || !r) return null;
    
    const participant = r.participants[userId];
    return participant?.team_id || null;
  });
  
  observers = computed(() => {
    const r = this.room();
    if (!r) return [];
    
    return Object.values(r.participants).filter(p => !p.team_id);
  });
  
  isAdmin = computed(() => {
    const userId = this.currentUserId();
    const r = this.room();
    return userId && r && r.admin_id === userId;
  });

  private websocketService = inject(WebSocketService);
  private authService = inject(AuthService);
  private router = inject(Router);

  constructor() {
    // Set current user ID
    effect(() => {
      const user = (this.authService as AuthService & { currentUser: () => { id: string } }).currentUser();
      if (user) {
        this.currentUserId.set(user.id);
      }
    });
  }

  ngOnInit() {
    // Subscribe to WebSocket messages
    this.websocketService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        this.handleWebSocketMessage(message as WebSocketMessage & { 
          teams?: Team[];
          team?: Team & { players: string[] };
        });
      });
    
    // Subscribe to connection state
    // Subscribe to connection status changes if needed
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private handleWebSocketMessage(message: {
    type: string;
    room?: GameRoom;
    teams?: Team[];
    team?: Team & { players: string[] };
    user_id?: string;
    team_id?: string;
  }) {
    switch (message.type) {
      case 'room_joined':
      case 'room_updated':
        this.room.set(message.room || null);
        break;
        
      case 'teams_updated':
        if (message.teams) {
          this.teams.set(message.teams as Team[]);
        }
        break;
        
      case 'team_joined':
        if (message.team) {
          const team = message.team as Team & { players: string[] };
          this.updateTeamPlayers(team.id, team.players);
        }
        break;
        
      case 'team_left':
        if (message.user_id) {
          this.removePlayerFromTeam(message.user_id);
        }
        break;
        
      case 'team_ready':
        if (message.team_id) {
          this.markTeamReady(message.team_id);
        }
        break;
        
      case 'game_started':
        // Navigate to game view
        this.router.navigate(['/game', this.room()?.room_code, 'play']);
        break;
    }
  }

  getParticipant(userId: string): RoomParticipant | undefined {
    return this.room()?.participants[userId];
  }

  joinTeam(teamId: string) {
    this.websocketService.send({
      type: 'join_team',
      team_id: teamId
    });
  }

  leaveTeam() {
    this.websocketService.send({
      type: 'leave_team'
    });
  }

  markReady() {
    this.websocketService.send({
      type: 'mark_ready'
    });
  }

  startGame() {
    this.websocketService.send({
      type: 'start_game'
    });
  }

  pauseGame() {
    this.websocketService.send({
      type: 'pause_game'
    });
  }

  resumeGame() {
    this.websocketService.send({
      type: 'resume_game'
    });
  }

  autoBalance() {
    // This would send a message to the server to auto-balance teams
    this.websocketService.send({
      type: 'auto_balance_teams'
    });
  }

  canJoinTeam(teamId: string): boolean {
    const team = this.teams().find(t => t.id === teamId);
    if (!team) return false;
    
    // Check if team is full (max 5 players)
    if (team.players.length >= 5) return false;
    
    // Check if user is already in a team
    if (this.currentUserTeam() !== null) return false;
    
    // Check if game has started
    const roomState = this.room()?.state;
    if (roomState !== 'waiting' && roomState !== 'ready') return false;
    
    return true;
  }

  canMarkReady(): boolean {
    const teamId = this.currentUserTeam();
    if (!teamId) return false;
    
    const team = this.teams().find(t => t.id === teamId);
    if (!team) return false;
    
    // Need at least 2 players to mark ready
    return team.players.length >= 2;
  }

  canStartGame(): boolean {
    if (!this.isAdmin()) return false;
    if (this.room()?.state !== 'waiting' && this.room()?.state !== 'ready') return false;
    
    return this.hasMinimumPlayers() && this.teamsAreBalanced() && this.allTeamsReady();
  }

  hasMinimumPlayers(): boolean {
    return this.teams().every(team => team.players.length >= 2);
  }

  teamsAreBalanced(): boolean {
    const teamSizes = this.teams().map(t => t.players.length);
    const maxSize = Math.max(...teamSizes);
    const minSize = Math.min(...teamSizes);
    return maxSize - minSize <= 2;
  }

  allTeamsReady(): boolean {
    return this.teams().every(team => team.is_ready || team.players.length === 0);
  }

  private updateTeamPlayers(teamId: string, players: string[]) {
    this.teams.update(teams => 
      teams.map(team => 
        team.id === teamId ? { ...team, players } : team
      )
    );
  }

  private removePlayerFromTeam(userId: string) {
    this.teams.update(teams => 
      teams.map(team => ({
        ...team,
        players: team.players.filter(id => id !== userId)
      }))
    );
  }

  private markTeamReady(teamId: string) {
    this.teams.update(teams => 
      teams.map(team => 
        team.id === teamId ? { ...team, is_ready: true } : team
      )
    );
  }
}