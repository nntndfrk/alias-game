import { Component, input, output, viewChild, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalComponent, ButtonComponent } from '@shared/ui';

export interface KickNotificationData {
  kicked_by_username?: string;
  kicked_by_display_name?: string;
  room_name?: string;
  reason?: string;
}

@Component({
  selector: 'alias-kicked-player-modal',
  standalone: true,
  imports: [CommonModule, ModalComponent, ButtonComponent],
  template: `
    <alias-modal 
      #modal
      title="You Have Been Kicked"
      [showFooter]="true"
      [closeOnBackdrop]="false"
    >
      <div class="text-center space-y-6">
        <!-- Warning Icon -->
        <div class="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
          <svg class="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>

        <!-- Main Message -->
        <div class="space-y-3">
          <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
            You have been removed from the room
          </h3>
          
          @if (roomName()) {
            <p class="text-gray-600 dark:text-gray-300">
              You were kicked from <span class="font-medium">{{ roomName() }}</span>
            </p>
          }

          @if (kickedByName()) {
            <p class="text-gray-600 dark:text-gray-300">
              by <span class="font-medium">{{ kickedByName() }}</span>
            </p>
          }

          @if (kickReason()) {
            <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reason:</p>
              <p class="text-gray-600 dark:text-gray-400">{{ kickReason() }}</p>
            </div>
          }
        </div>

        <!-- Information -->
        <div class="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div class="flex items-start space-x-3">
            <svg class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div class="text-left">
              <p class="text-sm font-medium text-blue-800 dark:text-blue-200">What happens next?</p>
              <p class="text-sm text-blue-700 dark:text-blue-300">
                You will be redirected to the lobby. You can join other rooms or create a new one.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div slot="footer" class="flex justify-center">
        <alias-button 
          variant="default" 
          (click)="acknowledgeKick()"
          class="px-8"
        >
          Go to Lobby
        </alias-button>
      </div>
    </alias-modal>
  `
})
export class KickedPlayerModalComponent {
  kickData = input<KickNotificationData | null>(null);
  
  acknowledged = output<void>();
  
  private readonly modal = viewChild.required(ModalComponent);
  
  readonly roomName = computed(() => this.kickData()?.room_name || null);
  readonly kickedByName = computed(() => {
    const data = this.kickData();
    return data?.kicked_by_display_name || data?.kicked_by_username || null;
  });
  readonly kickReason = computed(() => this.kickData()?.reason || null);
  
  constructor() {
    // Auto-open modal when component is created with kick data
    effect(() => {
      const data = this.kickData();
      if (data) {
        // Use setTimeout to defer the signal write outside of the effect
        setTimeout(() => this.open(), 0);
      }
    });
  }
  
  open(): void {
    this.modal().open();
  }
  
  close(): void {
    this.modal().close();
  }
  
  acknowledgeKick(): void {
    this.acknowledged.emit();
    this.close();
  }
}