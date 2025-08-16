import { Injectable, signal, effect, untracked } from '@angular/core';

export type Theme = 'light' | 'dark' | 'system';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly STORAGE_KEY = 'alias-theme';
  private readonly theme = signal<Theme>('system');
  private readonly effectiveTheme = signal<'light' | 'dark'>('light');
  
  currentTheme = this.theme.asReadonly();
  currentEffectiveTheme = this.effectiveTheme.asReadonly();
  
  constructor() {
    // Load saved theme preference and apply initial theme
    const savedTheme = localStorage.getItem(this.STORAGE_KEY) as Theme;
    const initialTheme = savedTheme && ['light', 'dark', 'system'].includes(savedTheme) ? savedTheme : 'system';
    this.theme.set(initialTheme);
    
    // Apply theme immediately
    this.applyTheme(initialTheme);
    
    // Watch for theme changes
    effect(() => {
      const theme = this.theme();
      untracked(() => {
        this.applyTheme(theme);
        localStorage.setItem(this.STORAGE_KEY, theme);
      });
    });
    
    // Listen for system theme changes
    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      darkModeQuery.addEventListener('change', () => {
        if (this.theme() === 'system') {
          this.updateEffectiveTheme();
        }
      });
    }
  }
  
  setTheme(theme: Theme) {
    this.theme.set(theme);
  }
  
  private applyTheme(theme: Theme) {
    let effectiveTheme: 'light' | 'dark';
    
    if (theme === 'system') {
      effectiveTheme = this.getSystemTheme();
    } else {
      effectiveTheme = theme;
    }
    
    this.effectiveTheme.set(effectiveTheme);
    this.updateDocumentTheme(effectiveTheme);
  }
  
  private getSystemTheme(): 'light' | 'dark' {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }
  
  private updateEffectiveTheme() {
    if (this.theme() === 'system') {
      const systemTheme = this.getSystemTheme();
      this.effectiveTheme.set(systemTheme);
      this.updateDocumentTheme(systemTheme);
    }
  }
  
  private updateDocumentTheme(theme: 'light' | 'dark') {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    document.documentElement.setAttribute('data-theme', theme);
  }
}