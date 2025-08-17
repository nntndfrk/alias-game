import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from './button.component';

@Component({
  selector: 'alias-modal',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  template: `
    @if (isOpen()) {
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" (click)="onBackdropClick($event)" tabindex="-1" role="button" (keydown.escape)="close()">
        <div class="bg-white dark:bg-alias-dark rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()" (keydown)="$event.stopPropagation()" role="dialog" aria-modal="true" tabindex="-1">
          <!-- Header -->
          <div class="flex items-center justify-between p-6 border-b dark:border-alias-medium/30">
            <h2 class="text-xl font-semibold dark:text-alias-cream">{{ title() }}</h2>
            <alias-button 
              variant="ghost" 
              size="sm" 
              (click)="close()"
              class="!p-1 hover:bg-gray-100 dark:hover:bg-alias-medium/30 rounded"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </alias-button>
          </div>
          
          <!-- Content -->
          <div class="p-6">
            <ng-content></ng-content>
          </div>
          
          <!-- Footer -->
          @if (showFooter()) {
            <div class="flex justify-end gap-3 p-6 border-t dark:border-alias-medium/30 bg-gray-50 dark:bg-alias-dark/50">
              <ng-content select="[slot=footer]"></ng-content>
            </div>
          }
        </div>
      </div>
    }
  `
})
export class ModalComponent {
  title = input('');
  showFooter = input(true);
  closeOnBackdrop = input(true);
  
  closed = output<void>();
  
  readonly isOpen = signal(false);
  
  open(): void {
    this.isOpen.set(true);
    document.body.style.overflow = 'hidden';
  }
  
  close(): void {
    this.isOpen.set(false);
    document.body.style.overflow = '';
    this.closed.emit();
  }
  
  onBackdropClick(event: Event): void {
    if (this.closeOnBackdrop() && event.target === event.currentTarget) {
      this.close();
    }
  }
}