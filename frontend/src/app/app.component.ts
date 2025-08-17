import { Component, signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardDescriptionComponent, CardContentComponent } from '@shared/ui';
import { LayoutComponent } from '@core/components';
import { ThemeService } from './core/services/theme.service';
import { KickNotificationService } from './core/services/kick-notification.service';
import { KickedPlayerModalComponent } from './features/room/kicked-player-modal.component';

@Component({
  selector: 'alias-root',
  standalone: true,
  imports: [RouterOutlet, ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardDescriptionComponent, CardContentComponent, LayoutComponent, KickedPlayerModalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = signal('Alias Game');
  
  private readonly kickNotificationService = inject(KickNotificationService);
  
  readonly showKickModal = this.kickNotificationService.showModal;
  readonly kickData = this.kickNotificationService.kickData;
  
  constructor() {
    // Initialize theme service to apply theme on app start
    inject(ThemeService);
  }
  
  onKickAcknowledged(): void {
    this.kickNotificationService.hideKickNotification();
  }
}
