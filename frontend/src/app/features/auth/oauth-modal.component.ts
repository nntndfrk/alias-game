import { Component, ViewChild, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalComponent, ButtonComponent } from '@shared/ui';
import { AuthService } from './auth.service';

@Component({
  selector: 'alias-oauth-modal',
  standalone: true,
  imports: [CommonModule, ModalComponent, ButtonComponent],
  template: `
    <alias-modal 
      #modal
      title="Sign in to Alias"
      [showFooter]="false"
      (closed)="onModalClosed()"
    >
      <div class="text-center">
        @if (isLoading()) {
          <!-- Loading State -->
          <div class="py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p class="text-gray-600 dark:text-alias-light mb-2">Connecting to Twitch...</p>
            <p class="text-sm text-gray-500 dark:text-alias-light/70">Please complete authentication in the popup window</p>
          </div>
        } @else if (error()) {
          <!-- Error State -->
          <div class="py-8">
            <div class="w-12 h-12 bg-red-100 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-6 h-6 text-red-600 dark:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 dark:text-alias-cream mb-2">Authentication Failed</h3>
            <p class="text-gray-600 dark:text-alias-light mb-6">{{ error() }}</p>
            <div class="flex gap-3 justify-center">
              <alias-button variant="outline" (click)="close()">Cancel</alias-button>
              <alias-button (click)="retryAuth()">Try Again</alias-button>
            </div>
          </div>
        } @else {
          <!-- Initial State -->
          <div class="py-8">
            <div class="w-16 h-16 bg-purple-100 dark:bg-alias-medium/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-purple-600 dark:text-alias-light" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 dark:text-alias-cream mb-2">Connect your Twitch Account</h3>
            <p class="text-gray-600 dark:text-alias-light mb-6">Sign in with Twitch to join games and chat with other players</p>
            
            <div class="flex gap-3 justify-center">
              <alias-button (click)="startAuth()" class="flex items-center">
                <svg class="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
                </svg>
                Continue with Twitch
              </alias-button>
              
              <alias-button variant="ghost" (click)="close()">
                Cancel
              </alias-button>
            </div>
            
            <p class="text-xs text-gray-500 dark:text-alias-light/60 mt-4">
              By continuing, you agree to Twitch's terms of service and privacy policy
            </p>
          </div>
        }
      </div>
    </alias-modal>
  `
})
export class OAuthModalComponent {
  @ViewChild('modal') modal!: ModalComponent;
  
  private readonly authService = inject(AuthService);
  
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  
  private popup: Window | null = null;
  private pollTimer?: number;
  
  open(): void {
    this.reset();
    this.modal.open();
  }
  
  close(): void {
    this.cleanup();
    this.modal.close();
  }
  
  private reset(): void {
    this.isLoading.set(false);
    this.error.set(null);
    this.cleanup();
  }
  
  private cleanup(): void {
    if (this.popup && !this.popup.closed) {
      this.popup.close();
    }
    this.popup = null;
    
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }
  
  startAuth(): void {
    this.isLoading.set(true);
    this.error.set(null);
    
    this.authService.getAuthUrl().subscribe({
      next: (response) => {
        this.openAuthPopup(response.auth_url);
      },
      error: (error) => {
        this.isLoading.set(false);
        this.error.set('Failed to connect to authentication service. Please try again.');
        console.error('Failed to get auth URL:', error);
      }
    });
  }
  
  private openAuthPopup(authUrl: string): void {
    const width = 500;
    const height = 600;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);
    
    this.popup = window.open(
      authUrl,
      'twitchAuth',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );
    
    if (!this.popup) {
      this.isLoading.set(false);
      this.error.set('Popup blocked. Please allow popups for this site and try again.');
      return;
    }
    
    this.startPolling();
  }
  
  private startPolling(): void {
    this.pollTimer = window.setInterval(() => {
      if (!this.popup || this.popup.closed) {
        this.cleanup();
        this.isLoading.set(false);
        this.error.set('Authentication was cancelled. Please try again.');
        return;
      }
      
      try {
        // Check if popup has navigated to our callback URL
        const url = this.popup.location.href;
        if (url.includes('/auth/callback')) {
          const urlParams = new URLSearchParams(this.popup.location.search);
          const code = urlParams.get('code');
          const error = urlParams.get('error');
          
          this.cleanup();
          
          if (error) {
            this.isLoading.set(false);
            this.error.set(`Authentication failed: ${error}`);
          } else if (code) {
            this.handleAuthSuccess(code);
          } else {
            this.isLoading.set(false);
            this.error.set('Authentication failed: No authorization code received.');
          }
        }
      } catch {
        // Cross-origin error - popup is still on Twitch domain, continue polling
      }
    }, 1000);
  }
  
  private handleAuthSuccess(code: string): void {
    const redirectUri = `${window.location.origin}/auth/callback`;
    
    this.authService.handleCallback(code, redirectUri).subscribe({
      next: (response) => {
        if (response) {
          this.close();
          // AuthService will handle navigation
        } else {
          this.isLoading.set(false);
          this.error.set('Authentication failed. Please try again.');
        }
      },
      error: (error) => {
        this.isLoading.set(false);
        this.error.set('Authentication failed. Please try again.');
        console.error('Auth callback failed:', error);
      }
    });
  }
  
  retryAuth(): void {
    this.startAuth();
  }
  
  onModalClosed(): void {
    this.cleanup();
  }
}