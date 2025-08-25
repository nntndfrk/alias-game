import { Component, OnInit, OnDestroy, signal, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil, interval } from 'rxjs';
import { 
  ButtonComponent, 
  CardComponent, 
  CardHeaderComponent, 
  CardTitleComponent, 
  CardContentComponent,
  CardDescriptionComponent,
  BadgeComponent 
} from '@shared/ui';
import { WebSocketService, WebSocketMessage } from '@core/services/websocket.service';
import { AuthService } from '../../auth/auth.service';

interface GameWord {
  word: string;
  difficulty: string;
  category?: string;
  result?: 'correct' | 'skipped' | 'penalty';
}

interface Round {
  round_number: number;
  team_id: string;
  explainer_id: string;
  words: GameWord[];
  timer_seconds: number;
  time_remaining: number;
  score_gained: number;
}

interface Team {
  id: string;
  name: string;
  color: string;
  players: string[];
  score: number;
  is_ready: boolean;
}

interface GameState {
  teams: Team[];
  current_round?: Round;
  round_history: Round[];
  current_team_index: number;
  current_word_index: number;
  winner_team_id?: string;
}

@Component({
  selector: 'alias-game-play',
  standalone: true,
  imports: [
    CommonModule,
    ButtonComponent,
    CardComponent,
    CardHeaderComponent,
    CardTitleComponent,
    CardContentComponent,
    CardDescriptionComponent,
    BadgeComponent
  ],
  template: `
    <div class="max-w-7xl mx-auto p-4">
      <!-- Game Header -->
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold">Round {{ currentRound()?.round_number || 0 }}</h1>
          <p class="text-muted-foreground">{{ roomCode }} • {{ gameStatus() }}</p>
        </div>
        
        @if (isAdmin()) {
          <div class="flex gap-2">
            @if (gameState()?.current_round) {
              <alias-button (click)="pauseGame()" variant="outline" size="sm">
                Pause
              </alias-button>
            }
            <alias-button (click)="endGame()" variant="destructive" size="sm">
              End Game
            </alias-button>
          </div>
        }
      </div>

      <div class="grid gap-6 lg:grid-cols-3">
        <!-- Team Scores -->
        <div class="lg:col-span-1 space-y-4">
          @for (team of gameState()?.teams || []; track team.id) {
            <alias-card [class.ring-2]="isCurrentTeam(team.id)" class="ring-primary">
              <alias-card-header>
                <alias-card-title>
                  <span [style.color]="team.color">{{ team.name }}</span>
                </alias-card-title>
              </alias-card-header>
              <alias-card-content>
                <div class="text-3xl font-bold mb-2">{{ team.score }} points</div>
                <div class="space-y-1">
                  @for (playerId of team.players; track playerId) {
                    <div class="text-sm" [class.font-bold]="isExplainer(playerId)">
                      {{ getPlayerName(playerId) }}
                      @if (isExplainer(playerId)) {
                        <alias-badge class="ml-2">Explaining</alias-badge>
                      }
                    </div>
                  }
                </div>
              </alias-card-content>
            </alias-card>
          }
        </div>

        <!-- Game Area -->
        <div class="lg:col-span-2">
          @if (currentRound()) {
            <!-- Active Round -->
            <alias-card class="mb-6">
              <alias-card-header>
                <alias-card-title>
                  <div class="flex items-center justify-between">
                    <span>Current Word</span>
                    <div class="text-2xl font-mono">
                      {{ formatTime(timeRemaining()) }}
                    </div>
                  </div>
                </alias-card-title>
              </alias-card-header>
              <alias-card-content>
                @if (isCurrentExplainer()) {
                  <!-- Explainer View -->
                  <div class="text-center">
                    <div class="text-5xl font-bold mb-2 p-8 bg-primary/10 rounded-lg">
                      {{ currentWord()?.word || 'Loading...' }}
                    </div>
                    @if (currentWord()?.category) {
                      <p class="text-sm text-muted-foreground mb-4">
                        Category: {{ currentWord()?.category }}
                      </p>
                    }
                    <div class="flex gap-3 justify-center">
                      <alias-button 
                        (click)="skipWord()" 
                        variant="outline"
                        size="lg"
                      >
                        Skip ({{ skipsUsed() }}/3)
                      </alias-button>
                      <alias-button 
                        (click)="markCorrect()"
                        size="lg"
                      >
                        Correct!
                      </alias-button>
                      <alias-button 
                        (click)="markPenalty()"
                        variant="destructive"
                        size="lg"
                      >
                        Violation
                      </alias-button>
                    </div>
                  </div>
                } @else if (isCurrentGuesser()) {
                  <!-- Guesser View -->
                  <div class="text-center">
                    <div class="text-3xl font-bold mb-4">Your team is guessing!</div>
                    <div class="text-6xl mb-4">🤔</div>
                    <p class="text-lg text-muted-foreground">
                      {{ getPlayerName(currentRound()!.explainer_id) }} is explaining
                    </p>
                  </div>
                } @else {
                  <!-- Observer View -->
                  <div class="text-center">
                    <div class="text-2xl font-bold mb-4">
                      {{ getCurrentTeamName() }} is playing
                    </div>
                    <p class="text-lg text-muted-foreground">
                      {{ getPlayerName(currentRound()!.explainer_id) }} is explaining
                    </p>
                  </div>
                }
              </alias-card-content>
            </alias-card>

            <!-- Round Progress -->
            <alias-card>
              <alias-card-header>
                <alias-card-title>Round Progress</alias-card-title>
              </alias-card-header>
              <alias-card-content>
                <div class="space-y-2">
                  <div class="flex justify-between text-sm">
                    <span>Words Completed</span>
                    <span>{{ wordsCompleted() }}/{{ totalWords() }}</span>
                  </div>
                  <div class="w-full bg-muted rounded-full h-2">
                    <div 
                      class="bg-primary h-2 rounded-full transition-all"
                      [style.width.%]="progressPercentage()"
                    ></div>
                  </div>
                  
                  <!-- Word Results -->
                  <div class="flex flex-wrap gap-2 mt-4">
                    @for (word of currentRound()?.words || []; track $index; let i = $index) {
                      @if (word.result) {
                        <alias-badge 
                          [variant]="getWordBadgeVariant(word.result)"
                          class="text-xs"
                        >
                          Word {{ i + 1 }}: {{ word.result }}
                        </alias-badge>
                      }
                    }
                  </div>
                </div>
              </alias-card-content>
            </alias-card>
          } @else {
            <!-- Waiting for Round -->
            <alias-card>
              <alias-card-content class="text-center py-12">
                @if (gameState()?.winner_team_id) {
                  <!-- Game Over -->
                  <div class="text-4xl mb-4">🎉</div>
                  <h2 class="text-3xl font-bold mb-4">Game Over!</h2>
                  <p class="text-xl mb-6">
                    Winner: {{ getWinnerName() }}
                  </p>
                  <div class="space-y-2 mb-6">
                    @for (team of gameState()?.teams || []; track team.id) {
                      <div class="text-lg">
                        {{ team.name }}: {{ team.score }} points
                      </div>
                    }
                  </div>
                  <alias-button (click)="returnToLobby()" size="lg">
                    Return to Lobby
                  </alias-button>
                } @else {
                  <!-- Waiting for Next Round -->
                  <div class="text-2xl mb-4">Waiting for next round...</div>
                  @if (isNextExplainer()) {
                    <p class="text-lg mb-4">You will be explaining next!</p>
                    <alias-button (click)="startRound()" size="lg">
                      Start Round
                    </alias-button>
                  } @else {
                    <p class="text-muted-foreground">
                      Next team: {{ getNextTeamName() }}
                    </p>
                  }
                }
              </alias-card-content>
            </alias-card>
          }
        </div>
      </div>

      <!-- Round History -->
      @if (gameState()?.round_history?.length) {
        <alias-card class="mt-6">
          <alias-card-header>
            <alias-card-title>Round History</alias-card-title>
          </alias-card-header>
          <alias-card-content>
            <div class="space-y-2">
              @for (round of gameState()?.round_history || []; track round.round_number) {
                <div class="flex items-center justify-between p-2 rounded bg-muted/50">
                  <span>Round {{ round.round_number }}</span>
                  <span>{{ getTeamName(round.team_id) }}</span>
                  <span class="font-bold">+{{ round.score_gained }} points</span>
                </div>
              }
            </div>
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
export class GamePlayComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private timerSubscription: { unsubscribe: () => void } | null = null;
  
  roomCode = '';
  gameState = signal<GameState | null>(null);
  currentWord = signal<GameWord | null>(null);
  timeRemaining = signal(0);
  currentUserId = signal<string>('');
  participants = signal<Map<string, { display_name?: string; username?: string }>>(new Map());
  
  currentRound = computed(() => this.gameState()?.current_round);
  
  isAdmin = computed(() => {
    // Check if current user is admin (would come from room data)
    return false; // TODO: Implement based on room data
  });
  
  isCurrentExplainer = computed(() => {
    const round = this.currentRound();
    const userId = this.currentUserId();
    return round && userId && round.explainer_id === userId;
  });
  
  isCurrentGuesser = computed(() => {
    const round = this.currentRound();
    const userId = this.currentUserId();
    const state = this.gameState();
    if (!round || !userId || !state) return false;
    
    const currentTeam = state.teams.find(t => t.id === round.team_id);
    return currentTeam?.players.includes(userId) && !this.isCurrentExplainer();
  });
  
  isNextExplainer = computed(() => {
    // TODO: Calculate if current user is next explainer
    return false;
  });
  
  wordsCompleted = computed(() => {
    const round = this.currentRound();
    if (!round) return 0;
    return round.words.filter(w => w.result).length;
  });
  
  totalWords = computed(() => {
    return this.currentRound()?.words.length || 0;
  });
  
  progressPercentage = computed(() => {
    const total = this.totalWords();
    if (total === 0) return 0;
    return (this.wordsCompleted() / total) * 100;
  });
  
  skipsUsed = computed(() => {
    const round = this.currentRound();
    if (!round) return 0;
    return round.words.filter(w => w.result === 'skipped').length;
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
    // Get room code from route
    // this.roomCode = this.route.snapshot.params['roomCode'];
    
    // Subscribe to WebSocket messages
    this.websocketService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        this.handleWebSocketMessage(message as WebSocketMessage);
      });
    
    // Start timer if there's an active round
    effect(() => {
      const round = this.currentRound();
      if (round) {
        this.startTimer(round.time_remaining);
      } else {
        this.stopTimer();
      }
    });
  }

  ngOnDestroy() {
    this.stopTimer();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private handleWebSocketMessage(message: WebSocketMessage) {
    switch (message.type) {
      case 'game_state_updated':
        this.gameState.set(message.game_state as GameState || null);
        break;
        
      case 'round_started':
        if (message.round) {
          this.updateRound(message.round as Round);
        }
        break;
        
      case 'word_received':
        this.currentWord.set(message.word as GameWord || null);
        break;
        
      case 'word_result_recorded':
        // Update current word result
        break;
        
      case 'timer_update':
        if (message.time_remaining !== undefined) {
          this.timeRemaining.set(message.time_remaining);
        }
        break;
        
      case 'round_ended':
        if (message.round) {
          this.handleRoundEnd({ round: message.round as Round, next_team_id: message.next_team_id });
        }
        break;
        
      case 'game_ended':
        if (message.winner_team && message.final_scores) {
          this.handleGameEnd({ winner_team: message.winner_team as Team, final_scores: message.final_scores as Team[] });
        }
        break;
    }
  }

  startRound() {
    this.websocketService.send({ type: 'start_round' });
  }

  skipWord() {
    this.websocketService.send({ 
      type: 'word_action',
      result: 'skipped'
    });
  }

  markCorrect() {
    this.websocketService.send({ 
      type: 'word_action',
      result: 'correct'
    });
  }

  markPenalty() {
    this.websocketService.send({ 
      type: 'word_action',
      result: 'penalty'
    });
  }

  pauseGame() {
    this.websocketService.send({ type: 'pause_game' });
  }

  endGame() {
    if (confirm('Are you sure you want to end the game?')) {
      this.websocketService.send({ type: 'end_game' });
    }
  }

  returnToLobby() {
    this.router.navigate(['/lobby']);
  }

  gameStatus(): string {
    const state = this.gameState();
    if (!state) return 'Loading...';
    
    if (state.winner_team_id) return 'Game Over';
    if (state.current_round) return 'In Progress';
    return 'Waiting';
  }

  isCurrentTeam(teamId: string): boolean {
    const round = this.currentRound();
    return round ? round.team_id === teamId : false;
  }

  isExplainer(playerId: string): boolean {
    const round = this.currentRound();
    return round ? round.explainer_id === playerId : false;
  }

  getPlayerName(playerId: string): string {
    const participant = this.participants().get(playerId);
    return participant?.display_name || participant?.username || 'Unknown';
  }

  getTeamName(teamId: string): string {
    const team = this.gameState()?.teams.find(t => t.id === teamId);
    return team?.name || 'Unknown Team';
  }

  getCurrentTeamName(): string {
    const round = this.currentRound();
    return round ? this.getTeamName(round.team_id) : '';
  }

  getNextTeamName(): string {
    const state = this.gameState();
    if (!state) return '';
    
    const nextIndex = (state.current_team_index + 1) % state.teams.length;
    return state.teams[nextIndex]?.name || '';
  }

  getWinnerName(): string {
    const state = this.gameState();
    if (!state?.winner_team_id) return '';
    
    return this.getTeamName(state.winner_team_id);
  }

  getWordBadgeVariant(result: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    switch (result) {
      case 'correct': return 'default';
      case 'skipped': return 'secondary';
      case 'penalty': return 'destructive';
      default: return 'outline';
    }
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private startTimer(initialTime: number) {
    this.stopTimer();
    this.timeRemaining.set(initialTime);
    
    this.timerSubscription = interval(1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.timeRemaining.update(t => Math.max(0, t - 1));
        
        if (this.timeRemaining() === 0) {
          this.handleTimerExpired();
        }
      });
  }

  private stopTimer() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = null;
    }
  }

  private updateRound(round: Round) {
    this.gameState.update(state => state ? {
      ...state,
      current_round: round
    } : null);
  }

  private handleRoundEnd(message: { round: Round; next_team_id?: string }) {
    this.gameState.update(state => {
      if (!state) return null;
      
      return {
        ...state,
        current_round: undefined,
        round_history: [...state.round_history, message.round]
      };
    });
    
    this.currentWord.set(null);
    this.stopTimer();
  }

  private handleGameEnd(message: { winner_team: Team; final_scores: Team[] }) {
    this.gameState.update(state => {
      if (!state) return null;
      
      return {
        ...state,
        winner_team_id: message.winner_team.id,
        teams: message.final_scores
      };
    });
  }

  private handleTimerExpired() {
    if (this.isCurrentExplainer()) {
      this.websocketService.send({ type: 'end_round' });
    }
  }
}