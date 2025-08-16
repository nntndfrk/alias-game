import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardContentComponent } from '@shared/ui';

@Component({
  selector: 'alias-lobby',
  standalone: true,
  imports: [CommonModule, ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardContentComponent],
  template: `
    <div class="max-w-6xl mx-auto">
      <div class="mb-8">
        <h1 class="text-3xl font-bold mb-2">Game Lobby</h1>
        <p class="text-muted-foreground">Create or join a room to start playing</p>
      </div>
      
      <div class="grid gap-6 lg:grid-cols-2">
        <alias-card>
          <alias-card-header>
            <alias-card-title>Create Room</alias-card-title>
          </alias-card-header>
          <alias-card-content>
            <div class="space-y-4">
              <div>
                <label for="room-name" class="block text-sm font-medium mb-2">Room Name</label>
                <input 
                  id="room-name"
                  type="text" 
                  placeholder="Enter room name..." 
                  class="w-full px-3 py-2 border rounded-md">
              </div>
              <div>
                <label for="max-players" class="block text-sm font-medium mb-2">Max Players</label>
                <select id="max-players" class="w-full px-3 py-2 border rounded-md">
                  <option value="6">6 Players</option>
                  <option value="8">8 Players</option>
                  <option value="10">10 Players</option>
                </select>
              </div>
              <alias-button class="w-full">Create Room</alias-button>
            </div>
          </alias-card-content>
        </alias-card>
        
        <alias-card>
          <alias-card-header>
            <alias-card-title>Join Room</alias-card-title>
          </alias-card-header>
          <alias-card-content>
            <div class="space-y-4">
              <div>
                <label for="room-code" class="block text-sm font-medium mb-2">Room Code</label>
                <input 
                  id="room-code"
                  type="text" 
                  placeholder="Enter room code..." 
                  class="w-full px-3 py-2 border rounded-md">
              </div>
              <alias-button variant="outline" class="w-full">Join Room</alias-button>
            </div>
            
            <div class="mt-6">
              <h3 class="font-medium mb-3">Available Rooms</h3>
              <div class="space-y-2">
                <div class="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div class="font-medium">Game Room 1</div>
                    <div class="text-sm text-muted-foreground">4/8 players</div>
                  </div>
                  <alias-button size="sm">Join</alias-button>
                </div>
              </div>
            </div>
          </alias-card-content>
        </alias-card>
      </div>
    </div>
  `
})
export class LobbyComponent {}