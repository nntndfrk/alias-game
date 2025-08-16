import { Component, signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardDescriptionComponent, CardContentComponent } from '@shared/ui';
import { LayoutComponent } from '@core/components';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'alias-root',
  standalone: true,
  imports: [RouterOutlet, ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardDescriptionComponent, CardContentComponent, LayoutComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = signal('Alias Game');
  
  constructor() {
    // Initialize theme service to apply theme on app start
    inject(ThemeService);
  }
}
