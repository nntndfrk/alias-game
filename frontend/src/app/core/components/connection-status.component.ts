import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebSocketService } from '../services/websocket.service';

@Component({
  selector: 'alias-connection-status',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-4 right-4 z-50">
      @if (showStatus()) {
        <div 
          class="flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg transition-all duration-300"
          [ngClass]="statusClass()"
        >
          <div class="relative">
            <div 
              class="w-3 h-3 rounded-full"
              [ngClass]="dotClass()"
            ></div>
            @if (isReconnecting()) {
              <div 
                class="absolute inset-0 w-3 h-3 rounded-full animate-ping"
                [ngClass]="dotClass()"
              ></div>
            }
          </div>
          <span class="text-sm font-medium">{{ statusText() }}</span>
          @if (isReconnecting() && reconnectAttempts() > 0) {
            <span class="text-xs opacity-75">
              (Attempt {{ reconnectAttempts() }}/10)
            </span>
          }
          @if (canManualReconnect()) {
            <button
              (click)="reconnect()"
              class="ml-2 px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded transition-colors"
            >
              Retry
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }
  `]
})
export class ConnectionStatusComponent {
  private readonly wsService = inject(WebSocketService);
  
  readonly connectionStatus = this.wsService.connectionStatus;
  readonly isReconnecting = this.wsService.isReconnecting;
  readonly reconnectAttempts = this.wsService.reconnectAttemptsCount;
  
  readonly showStatus = computed(() => {
    const status = this.connectionStatus();
    // Show status when not authenticated or having connection issues
    return status !== 'authenticated';
  });
  
  readonly statusClass = computed(() => {
    const status = this.connectionStatus();
    switch (status) {
      case 'connected':
        return 'bg-blue-500 text-white';
      case 'connecting':
        return 'bg-yellow-500 text-white';
      case 'reconnecting':
        return 'bg-orange-500 text-white';
      case 'disconnected':
        return 'bg-red-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  });
  
  readonly dotClass = computed(() => {
    const status = this.connectionStatus();
    switch (status) {
      case 'connected':
        return 'bg-white';
      case 'connecting':
      case 'reconnecting':
        return 'bg-white animate-pulse';
      case 'disconnected':
        return 'bg-white opacity-50';
      default:
        return 'bg-white';
    }
  });
  
  readonly statusText = computed(() => {
    const status = this.connectionStatus();
    switch (status) {
      case 'connected':
        return 'Authenticating...';
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'disconnected':
        return 'Disconnected';
      case 'authenticated':
        return 'Connected';
      default:
        return 'Unknown';
    }
  });
  
  readonly canManualReconnect = computed(() => {
    return this.connectionStatus() === 'disconnected' && this.reconnectAttempts() >= 10;
  });
  
  reconnect(): void {
    this.wsService.reconnect();
  }
}