import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'alias-auth-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="max-w-md w-full mx-4">
        @if (isLoading) {
          <div class="text-center">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 class="text-lg font-medium text-gray-900 mb-2">Processing authentication...</h2>
            <p class="text-gray-600">Please wait while we complete your sign-in.</p>
          </div>
        } @else if (error) {
          <div class="text-center">
            <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 class="text-lg font-medium text-gray-900 mb-2">Authentication Error</h2>
            <p class="text-gray-600 mb-4">{{ error }}</p>
            <button 
              (click)="closeWindow()"
              class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Close Window
            </button>
          </div>
        } @else {
          <div class="text-center">
            <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 class="text-lg font-medium text-gray-900 mb-2">Authentication Successful!</h2>
            <p class="text-gray-600 mb-4">You can now close this window and return to the game.</p>
            <button 
              (click)="closeWindow()"
              class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Close Window
            </button>
          </div>
        }
      </div>
    </div>
  `
})
export class AuthCallbackComponent implements OnInit {
  isLoading = true;
  error: string | null = null;

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const code = params['code'];
      const error = params['error'];
      const errorDescription = params['error_description'];

      this.isLoading = false;

      if (error) {
        this.error = errorDescription || error;
      } else if (code) {
        // Success - the parent modal will handle the actual authentication
        // This page just serves as a landing page to be detected by polling
        setTimeout(() => {
          this.closeWindow();
        }, 2000);
      } else {
        this.error = 'No authorization code or error received';
      }
    });
  }

  closeWindow(): void {
    if (window.opener) {
      window.close();
    } else {
      // Fallback for when opened in same tab
      window.location.href = '/';
    }
  }
}