import { Component, input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '@shared/ui';
import { AuthService } from '../../features/auth/auth.service';

@Component({
  selector: 'alias-header',
  standalone: true,
  imports: [CommonModule, ButtonComponent, RouterLink],
  template: `
    <header class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="container flex h-16 items-center justify-between px-4">
        <div class="flex items-center space-x-4">
          <a routerLink="/" class="text-xl font-bold hover:text-primary transition-colors">
            {{ title() }}
          </a>
          <nav class="hidden md:flex space-x-6">
            <ng-content select="[slot=nav]"></ng-content>
          </nav>
        </div>
        
        <div class="flex items-center gap-4">
          <ng-content select="[slot=actions]"></ng-content>
          @if (authService.isAuthenticated()) {
            <div class="flex items-center gap-2">
              @if (authService.user()?.profile_image_url) {
                <img 
                  [src]="authService.user()?.profile_image_url" 
                  [alt]="authService.user()?.display_name"
                  class="w-8 h-8 rounded-full"
                />
              }
              <span class="text-sm font-medium">{{ authService.user()?.display_name }}</span>
            </div>
          }
        </div>
      </div>
    </header>
  `
})
export class HeaderComponent {
  title = input('Alias Game');
  
  protected readonly authService = inject(AuthService);
}