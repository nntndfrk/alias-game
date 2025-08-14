import { Component, Input, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

@Component({
  selector: 'alias-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button 
      [class]="buttonClasses()"
      [disabled]="isDisabled()"
      [type]="type">
      <ng-content></ng-content>
    </button>
  `
})
export class ButtonComponent {
  @Input() set variant(value: ButtonVariant) {
    this._variant.set(value);
  }
  
  @Input() set size(value: ButtonSize) {
    this._size.set(value);
  }
  
  @Input() set disabled(value: boolean | string) {
    this._disabled.set(value === '' || value === true);
  }
  
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  
  private _variant = signal<ButtonVariant>('default');
  private _size = signal<ButtonSize>('default');
  private _disabled = signal(false);
  
  currentVariant = this._variant.asReadonly();
  currentSize = this._size.asReadonly();
  isDisabled = this._disabled.asReadonly();
  
  buttonClasses = computed(() => {
    const baseClasses = 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
    
    const variantClasses: Record<ButtonVariant, string> = {
      default: 'bg-primary text-primary-foreground hover:bg-primary/90',
      destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      ghost: 'hover:bg-accent hover:text-accent-foreground',
      link: 'text-primary underline-offset-4 hover:underline'
    };
    
    const sizeClasses: Record<ButtonSize, string> = {
      default: 'h-10 px-4 py-2',
      sm: 'h-9 rounded-md px-3',
      lg: 'h-11 rounded-md px-8',
      icon: 'h-10 w-10'
    };
    
    return `${baseClasses} ${variantClasses[this.currentVariant()]} ${sizeClasses[this.currentSize()]}`;
  });
}