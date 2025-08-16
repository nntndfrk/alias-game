import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'alias-auth-callback',
  standalone: true,
  template: `
    <div class="min-h-screen flex items-center justify-center">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p class="mt-4 text-lg">Authenticating...</p>
      </div>
    </div>
  `
})
export class AuthCallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const code = params['code'];
      
      if (code) {
        const redirectUri = window.location.origin + '/auth/callback';
        
        this.authService.handleCallback(code, redirectUri).subscribe({
          next: (response) => {
            if (response) {
              this.router.navigate(['/lobby']);
            } else {
              this.router.navigate(['/'], { 
                queryParams: { error: 'Authentication failed' } 
              });
            }
          },
          error: (error) => {
            console.error('Auth callback error:', error);
            this.router.navigate(['/'], { 
              queryParams: { error: 'Authentication failed' } 
            });
          }
        });
      } else {
        this.router.navigate(['/']);
      }
    });
  }
}