Technology Stack
Frontend:

Angular 18+ with Zoneless mode (using signals for state management)
WebRTC for peer-to-peer video/audio
TypeScript with strict mode
Tailwind CSS for styling
WebSocket connection for real-time game state

Backend:

Rust with Tokio async runtime
Axum web framework for HTTP/WebSocket handling
Microservice architecture (but start as modular monolith)
MongoDB for data persistence
Redis for real-time game state and caching
JWT for authentication with Twitch OAuth

Infrastructure:

Docker containers for each service
WebRTC TURN/STUN servers


Project Structure:

alias-game/
├── frontend/                 # Angular application
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/       # Services, guards, interceptors
│   │   │   ├── features/    
│   │   │   │   ├── game/   # Game room, video chat, team display
│   │   │   │   ├── auth/   # Twitch OAuth
│   │   │   │   ├── lobby/  # Room creation/joining, team selection
│   │   │   │   └── admin/  # Observer/Admin panel
│   │   │   ├── shared/     # Common components
│   │   │   └── signals/    # State management
│   │   └── environments/
│   
├── backend/                  # Rust backend
│   ├── crates/
│   │   ├── api-gateway/    # Main entry point, WebSocket
│   │   ├── game-engine/    # Game logic, team management, scoring
│   │   ├── auth-service/   # Twitch OAuth, JWT
│   │   └── shared/         # Common types, utils
│   ├── migrations/          # MongoDB migrations
│   └── Cargo.toml
│   
├── docker-compose.yml
└── README.md