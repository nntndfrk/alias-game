import { Component, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardDescriptionComponent, CardContentComponent } from '@shared/ui';
import { AuthService } from '../auth/auth.service';
import { OAuthModalComponent } from '../auth/oauth-modal.component';

@Component({
  selector: 'alias-home',
  standalone: true,
  imports: [CommonModule, ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardDescriptionComponent, CardContentComponent, OAuthModalComponent],
  template: `
    <div class="max-w-4xl mx-auto">
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold mb-4">Welcome to Alias</h1>
        <p class="text-lg text-muted-foreground">Real-time multiplayer word guessing game with video chat</p>
      </div>
      
      <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <alias-card>
          <alias-card-header>
            <alias-card-title>Get Started</alias-card-title>
            <alias-card-description>
              Sign in with Twitch to play
            </alias-card-description>
          </alias-card-header>
          <alias-card-content>
            <div class="flex flex-col gap-2">
              @if (authService.isAuthenticated()) {
                <p class="text-sm mb-2">Welcome, {{ authService.user()?.display_name }}!</p>
                <alias-button (click)="goToLobby()">Go to Lobby</alias-button>
                <alias-button variant="outline" (click)="logout()">Logout</alias-button>
              } @else {
                <alias-button (click)="openLoginModal()">
                  <svg class="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
                  </svg>
                  Sign in with Twitch
                </alias-button>
              }
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
    
    <!-- OAuth Modal -->
    <alias-oauth-modal #oauthModal></alias-oauth-modal>
  `
})
export class HomeComponent {
  @ViewChild('oauthModal') oauthModal!: OAuthModalComponent;
  
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  login(): void {
    this.authService.login();
  }
  
  openLoginModal(): void {
    this.oauthModal.open();
  }

  logout(): void {
    this.authService.logout();
  }

  goToLobby(): void {
    this.router.navigate(['/lobby']);
  }
}