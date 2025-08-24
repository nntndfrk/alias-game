import { Component, input, output, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalComponent, ButtonComponent } from '@shared/ui';
import { type RoomParticipant } from '../lobby/room.service';

@Component({
  selector: 'alias-kick-confirmation-modal',
  standalone: true,
  imports: [CommonModule, ModalComponent, ButtonComponent],
  template: `
    <alias-modal 
      #modal
      title="Kick Player"
      [showFooter]="true"
      [closeOnBackdrop]="true"
      (closed)="onModalClosed()"
    >
      <div class="space-y-4">
        @if (player()) {
          <div class="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
            @if (player()!.profile_image_url) {
              <img 
                [src]="player()!.profile_image_url" 
                [alt]="player()!.display_name"
                class="w-12 h-12 rounded-full"
              >
            } @else {
              <div class="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                <span class="text-lg font-medium">{{ getFirstLetter() }}</span>
              </div>
            }
            <div>
              <div class="font-medium text-lg">{{ player()!.display_name }}</div>
              <div class="text-sm text-muted-foreground">{{ getUsernameDisplay() }}</div>
            </div>
          </div>
        }
        
        <div class="text-center space-y-2">
          <p class="text-lg font-medium text-red-600 dark:text-red-400">
            Are you sure you want to kick this player?
          </p>
          <p class="text-sm text-muted-foreground">
            This action cannot be undone. The player will be immediately removed from the room and will need to join again if they want to return.
          </p>
        </div>
      </div>
      
      <div slot="footer" class="flex gap-3">
        <alias-button 
          variant="outline" 
          (click)="cancel()"
          [disabled]="isKicking()"
        >
          Cancel
        </alias-button>
        <alias-button 
          variant="destructive" 
          (click)="confirmKick()"
          [disabled]="isKicking()"
        >
          @if (isKicking()) {
            Kicking...
          } @else {
            Kick Player
          }
        </alias-button>
      </div>
    </alias-modal>
  `
})
export class KickConfirmationModalComponent {
  player = input<RoomParticipant | null>(null);
  
  confirmed = output<RoomParticipant>();
  cancelled = output<void>();
  
  readonly isKicking = signal(false);
  
  private readonly modal = viewChild.required(ModalComponent);
  
  open(): void {
    this.modal().open();
  }
  
  close(): void {
    this.modal().close();
  }
  
  confirmKick(): void {
    const currentPlayer = this.player();
    if (currentPlayer && !this.isKicking()) {
      this.isKicking.set(true);
      this.confirmed.emit(currentPlayer);
    }
  }
  
  cancel(): void {
    if (!this.isKicking()) {
      this.cancelled.emit();
      this.close();
    }
  }
  
  onModalClosed(): void {
    this.isKicking.set(false);
    this.cancelled.emit();
  }
  
  setKicking(kicking: boolean): void {
    this.isKicking.set(kicking);
    if (!kicking) {
      this.close();
    }
  }

  getFirstLetter(): string {
    const currentPlayer = this.player();
    return currentPlayer ? currentPlayer.display_name[0].toUpperCase() : '';
  }

  getUsernameDisplay(): string {
    const currentPlayer = this.player();
    return currentPlayer ? `@${currentPlayer.username}` : '';
  }
}