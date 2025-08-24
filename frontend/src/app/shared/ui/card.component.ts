import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'alias-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rounded-lg border bg-card text-card-foreground shadow-sm h-full">
      <ng-content></ng-content>
    </div>
  `
})
export class CardComponent {}

@Component({
  selector: 'alias-card-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col space-y-1.5 p-6">
      <ng-content></ng-content>
    </div>
  `
})
export class CardHeaderComponent {}

@Component({
  selector: 'alias-card-title',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h3 class="text-2xl font-semibold leading-none tracking-tight">
      <ng-content></ng-content>
    </h3>
  `
})
export class CardTitleComponent {}

@Component({
  selector: 'alias-card-description',
  standalone: true,
  imports: [CommonModule],
  template: `
    <p class="text-sm text-muted-foreground">
      <ng-content></ng-content>
    </p>
  `
})
export class CardDescriptionComponent {}

@Component({
  selector: 'alias-card-content',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-6 pt-0">
      <ng-content></ng-content>
    </div>
  `
})
export class CardContentComponent {}

@Component({
  selector: 'alias-card-footer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center p-6 pt-0">
      <ng-content></ng-content>
    </div>
  `
})
export class CardFooterComponent {}