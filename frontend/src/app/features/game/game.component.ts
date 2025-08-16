import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardContentComponent } from '@shared/ui';

@Component({
  selector: 'alias-game',
  standalone: true,
  imports: [CommonModule, ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardContentComponent],
  template: `
    <div class="max-w-8xl mx-auto">
      <div class="mb-6">
        <h1 class="text-3xl font-bold mb-2">Game Room</h1>
        <p class="text-muted-foreground">Room: GAME123 | Round 1/5</p>
      </div>
      
      <div class="grid gap-6 lg:grid-cols-3">
        <!-- Team 1 -->
        <alias-card>
          <alias-card-header>
            <alias-card-title>Team Red</alias-card-title>
          </alias-card-header>
          <alias-card-content>
            <div class="space-y-2">
              <div class="p-2 bg-red-50 rounded border">Player 1</div>
              <div class="p-2 bg-red-50 rounded border">Player 2</div>
              <div class="p-2 bg-red-50 rounded border">Player 3</div>
            </div>
            <div class="mt-4 text-center">
              <div class="text-2xl font-bold">15</div>
              <div class="text-sm text-muted-foreground">Points</div>
            </div>
          </alias-card-content>
        </alias-card>
        
        <!-- Game Area -->
        <alias-card>
          <alias-card-header>
            <alias-card-title>Current Word</alias-card-title>
          </alias-card-header>
          <alias-card-content class="text-center">
            <div class="text-4xl font-bold mb-4 p-8 bg-primary/10 rounded-lg">
              COMPUTER
            </div>
            <div class="mb-4">
              <div class="text-lg font-medium">Team Red is explaining</div>
              <div class="text-sm text-muted-foreground">Time left: 1:23</div>
            </div>
            <div class="flex gap-2 justify-center">
              <alias-button variant="destructive">Skip</alias-button>
              <alias-button>Correct</alias-button>
            </div>
          </alias-card-content>
        </alias-card>
        
        <!-- Team 2 -->
        <alias-card>
          <alias-card-header>
            <alias-card-title>Team Blue</alias-card-title>
          </alias-card-header>
          <alias-card-content>
            <div class="space-y-2">
              <div class="p-2 bg-blue-50 rounded border">Player 4</div>
              <div class="p-2 bg-blue-50 rounded border">Player 5</div>
              <div class="p-2 bg-blue-50 rounded border">Player 6</div>
            </div>
            <div class="mt-4 text-center">
              <div class="text-2xl font-bold">12</div>
              <div class="text-sm text-muted-foreground">Points</div>
            </div>
          </alias-card-content>
        </alias-card>
      </div>
      
      <!-- Video Chat Area -->
      <div class="mt-8">
        <alias-card>
          <alias-card-header>
            <alias-card-title>Video Chat</alias-card-title>
          </alias-card-header>
          <alias-card-content>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div class="aspect-video bg-gray-200 rounded-lg flex items-center justify-center">
                <span class="text-sm text-gray-500">Player 1</span>
              </div>
              <div class="aspect-video bg-gray-200 rounded-lg flex items-center justify-center">
                <span class="text-sm text-gray-500">Player 2</span>
              </div>
              <div class="aspect-video bg-gray-200 rounded-lg flex items-center justify-center">
                <span class="text-sm text-gray-500">Player 3</span>
              </div>
            </div>
          </alias-card-content>
        </alias-card>
      </div>
    </div>
  `
})
export class GameComponent {}