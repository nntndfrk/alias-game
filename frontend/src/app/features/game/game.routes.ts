import { Routes } from '@angular/router';
import { authGuard } from '@core/guards/auth.guard';

export const gameRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: ':roomCode/teams',
        loadComponent: () => 
          import('./team-selection/team-selection.component').then(m => m.TeamSelectionComponent),
        title: 'Team Selection'
      },
      {
        path: ':roomCode/play',
        loadComponent: () => 
          import('./game-play/game-play.component').then(m => m.GamePlayComponent),
        title: 'Game Play'
      },
      {
        path: '',
        loadComponent: () => 
          import('./game.component').then(m => m.GameComponent),
        title: 'Game'
      }
    ]
  }
];