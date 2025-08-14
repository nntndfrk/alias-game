import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header.component';

@Component({
  selector: 'alias-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderComponent],
  template: `
    <div class="min-h-screen bg-background">
      <alias-header [title]="'Alias Game'">
        <div slot="nav">
          <a href="/lobby" class="text-sm font-medium hover:text-primary">Lobby</a>
          <a href="/game" class="text-sm font-medium hover:text-primary">Game</a>
        </div>
        <div slot="actions">
          <ng-content select="[slot=header-actions]"></ng-content>
        </div>
      </alias-header>
      
      <main class="container mx-auto py-8 px-4">
        <ng-content></ng-content>
        <router-outlet />
      </main>
    </div>
  `
})
export class LayoutComponent {}