import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardDescriptionComponent, CardContentComponent } from '@shared/ui';

@Component({
  selector: 'alias-root',
  standalone: true,
  imports: [RouterOutlet, ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardDescriptionComponent, CardContentComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = signal('Alias Game');
}
