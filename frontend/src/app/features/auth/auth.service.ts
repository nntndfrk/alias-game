import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of } from 'rxjs';

export interface User {
  id: string;
  username: string;
  display_name: string;
  profile_image_url?: string;
  role?: 'admin' | 'player'; // Current role in active room
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  
  private readonly authState = signal<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false
  });

  readonly user = computed(() => this.authState().user);
  readonly token = computed(() => this.authState().token);
  readonly isAuthenticated = computed(() => this.authState().isAuthenticated);

  private readonly apiUrl = 'http://localhost:3000/api/v1/auth';
  private readonly tokenKey = 'alias_auth_token';
  private readonly userKey = 'alias_user';

  constructor() {
    this.loadAuthState();
  }

  private loadAuthState(): void {
    const token = localStorage.getItem(this.tokenKey);
    const userJson = localStorage.getItem(this.userKey);
    
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson);
        this.authState.set({
          user,
          token,
          isAuthenticated: true
        });
      } catch {
        this.clearAuthState();
      }
    }
  }

  login(): void {
    this.http.get<{ auth_url: string }>(`${this.apiUrl}/login`)
      .subscribe({
        next: (response) => {
          window.location.href = response.auth_url;
        },
        error: (error) => {
          console.error('Failed to get auth URL:', error);
        }
      });
  }

  getAuthUrl(): Observable<{ auth_url: string }> {
    return this.http.get<{ auth_url: string }>(`${this.apiUrl}/login`);
  }

  handleCallback(code: string, redirectUri: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/callback`, { code, redirect_uri: redirectUri })
      .pipe(
        tap(response => {
          this.authState.set({
            user: response.user,
            token: response.access_token,
            isAuthenticated: true
          });
          
          localStorage.setItem(this.tokenKey, response.access_token);
          localStorage.setItem(this.userKey, JSON.stringify(response.user));
        }),
        catchError(error => {
          console.error('Auth callback failed:', error);
          this.clearAuthState();
          return of(null as unknown as LoginResponse);
        })
      );
  }

  logout(): void {
    this.clearAuthState();
    this.router.navigate(['/']);
  }

  private clearAuthState(): void {
    this.authState.set({
      user: null,
      token: null,
      isAuthenticated: false
    });
    
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  getCurrentUser(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/me`);
  }
}