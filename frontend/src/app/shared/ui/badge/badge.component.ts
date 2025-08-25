import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'alias-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span [class]="badgeClasses">
      <ng-content></ng-content>
    </span>
  `,
  styles: [`
    :host {
      display: inline-block;
    }
  `]
})
export class BadgeComponent {
  @Input() variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'default';
  @Input() size: 'sm' | 'md' | 'lg' = 'sm';
  @Input() class = '';

  get badgeClasses(): string {
    const baseClasses = 'inline-flex items-center rounded-full font-semibold transition-colors';
    
    const variantClasses = {
      default: 'bg-primary text-primary-foreground',
      secondary: 'bg-secondary text-secondary-foreground',
      destructive: 'bg-destructive text-destructive-foreground',
      outline: 'border border-input bg-background'
    };
    
    const sizeClasses = {
      sm: 'px-2.5 py-0.5 text-xs',
      md: 'px-3 py-1 text-sm',
      lg: 'px-4 py-1.5 text-base'
    };
    
    return `${baseClasses} ${variantClasses[this.variant]} ${sizeClasses[this.size]} ${this.class}`;
  }
}