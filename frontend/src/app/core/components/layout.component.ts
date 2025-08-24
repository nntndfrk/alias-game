import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { HeaderComponent } from './header.component';
import { ConnectionStatusComponent } from './connection-status.component';

@Component({
  selector: 'alias-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, HeaderComponent, ConnectionStatusComponent],
  template: `
    <div class="min-h-screen bg-background">
      <alias-header [title]="'Alias Game'">
        <div slot="nav" class="flex space-x-6">
          <a 
            routerLink="/" 
            routerLinkActive="text-primary" 
            [routerLinkActiveOptions]="{exact: true}"
            class="text-sm font-medium hover:text-primary transition-colors">
            Home
          </a>
          <a 
            routerLink="/lobby" 
            routerLinkActive="text-primary" 
            class="text-sm font-medium hover:text-primary transition-colors">
            Lobby
          </a>
          <a 
            routerLink="/settings" 
            routerLinkActive="text-primary" 
            class="text-sm font-medium hover:text-primary transition-colors">
            Settings
          </a>
        </div>
        <div slot="actions">
          <ng-content select="[slot=header-actions]"></ng-content>
        </div>
      </alias-header>
      
      <main class="container mx-auto py-8 px-4">
        <ng-content></ng-content>
        <router-outlet />
      </main>
      
      <!-- Connection status indicator -->
      <alias-connection-status />
    </div>
  `
})
export class LayoutComponent {}