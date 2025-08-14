import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from '@shared/ui';

@Component({
  selector: 'alias-header',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  template: `
    <header class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="container flex h-16 items-center justify-between px-4">
        <div class="flex items-center space-x-4">
          <h1 class="text-xl font-bold">{{ currentTitle() }}</h1>
          <nav class="hidden md:flex space-x-6">
            <ng-content select="[slot=nav]"></ng-content>
          </nav>
        </div>
        
        <div class="flex items-center space-x-2">
          <ng-content select="[slot=actions]"></ng-content>
        </div>
      </div>
    </header>
  `
})
export class HeaderComponent {
  @Input() set title(value: string) {
    this._title.set(value);
  }
  
  private _title = signal('Alias Game');
  currentTitle = this._title.asReadonly();
}