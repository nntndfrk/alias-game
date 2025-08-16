import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardDescriptionComponent, CardContentComponent } from '@shared/ui';

@Component({
  selector: 'alias-home',
  standalone: true,
  imports: [CommonModule, ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardDescriptionComponent, CardContentComponent],
  template: `
    <div class="max-w-4xl mx-auto">
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold mb-4">Welcome to Alias</h1>
        <p class="text-lg text-muted-foreground">Real-time multiplayer word guessing game with video chat</p>
      </div>
      
      <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <alias-card>
          <alias-card-header>
            <alias-card-title>Quick Start</alias-card-title>
            <alias-card-description>
              Jump into a game quickly or create your own room
            </alias-card-description>
          </alias-card-header>
          <alias-card-content>
            <div class="flex flex-col gap-2">
              <alias-button>Join Random Game</alias-button>
              <alias-button variant="outline">Create Room</alias-button>
            </div>
          </alias-card-content>
        </alias-card>

        <alias-card>
          <alias-card-header>
            <alias-card-title>Game Features</alias-card-title>
          </alias-card-header>
          <alias-card-content>
            <div class="flex flex-col gap-2">
              <alias-button variant="secondary" size="sm">WebRTC Video</alias-button>
              <alias-button variant="ghost" size="sm">Real-time Sync</alias-button>
              <alias-button variant="link" size="sm">Team Play</alias-button>
            </div>
          </alias-card-content>
        </alias-card>
        
        <alias-card>
          <alias-card-header>
            <alias-card-title>How to Play</alias-card-title>
            <alias-card-description>
              Learn the rules and get started
            </alias-card-description>
          </alias-card-header>
          <alias-card-content>
            <alias-button variant="outline">View Rules</alias-button>
          </alias-card-content>
        </alias-card>
      </div>
    </div>
  `
})
export class HomeComponent {}