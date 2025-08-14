# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend Development
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Type checking
npm run typecheck
```

### Backend Development
```bash
# Navigate to backend directory
cd backend

# Build the project
cargo build

# Run development server
cargo run --bin api-gateway

# Run tests
cargo test

# Run specific test
cargo test test_name

# Format code
cargo fmt

# Lint code
cargo clippy

# Run database migrations
cargo run --bin migrate

# Seed word database
cargo run --bin seed-words
```

### Docker Commands
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild containers
docker-compose build
```

## Architecture Overview

This is a real-time multiplayer Alias game with the following key components:

### Frontend Architecture
- **Angular 18+ with Zoneless mode**: Uses signals for state management instead of traditional zone.js
- **WebRTC Integration**: Peer-to-peer video/audio connections between all players
- **WebSocket**: Real-time game state synchronization
- **Feature Modules**:
  - `game/`: Core game room, video chat, team display
  - `auth/`: Twitch OAuth integration
  - `lobby/`: Room creation/joining, team selection
  - `admin/`: Observer/Admin control panel

### Backend Architecture
- **Rust with Tokio**: Async runtime for handling concurrent connections
- **Axum Framework**: HTTP and WebSocket handling
- **Microservice Design** (implemented as modular monolith):
  - `api-gateway/`: Main entry point, WebSocket management
  - `game-engine/`: Game logic, team management, scoring
  - `auth-service/`: Twitch OAuth, JWT token management
- **Data Storage**:
  - MongoDB: Persistent data (users, games, words)
  - Redis: Real-time game state and caching

### Game Flow
1. Players authenticate via Twitch OAuth
2. One player creates a room and becomes observer/admin
3. Other players join and select teams (3-4 players per team)
4. Observer starts the game when both teams are ready
5. Teams alternate between explaining and guessing words
6. All players connect via WebRTC for video/audio
7. Observer moderates violations and makes final decisions

### Key Technical Considerations
- **WebRTC Setup**: Requires TURN/STUN servers for NAT traversal
- **Real-time Sync**: Game state managed in Redis, synchronized via WebSocket
- **Multi-language Support**: Architecture supports multiple languages, currently focused on Ukrainian
- **Authentication**: JWT tokens with Twitch OAuth as identity provider