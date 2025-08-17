import { Injectable, signal } from '@angular/core';

export interface KickNotificationData {
  kicked_by_username?: string;
  kicked_by_display_name?: string;
  room_name?: string;
  reason?: string;
}

@Injectable({
  providedIn: 'root'
})
export class KickNotificationService {
  private readonly _kickData = signal<KickNotificationData | null>(null);
  private readonly _showModal = signal(false);

  readonly kickData = this._kickData.asReadonly();
  readonly showModal = this._showModal.asReadonly();

  showKickNotification(data: KickNotificationData): void {
    this._kickData.set(data);
    this._showModal.set(true);
  }

  hideKickNotification(): void {
    this._showModal.set(false);
    // Clear data after a short delay to allow modal closing animation
    setTimeout(() => {
      this._kickData.set(null);
    }, 300);
  }

  clearKickNotification(): void {
    this._kickData.set(null);
    this._showModal.set(false);
  }
}