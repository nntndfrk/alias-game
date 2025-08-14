# Online Alias Game - Team-Based Word Guessing Game

A real-time multiplayer word-guessing game (similar to Alias/Taboo) with video chat, built for Ukrainian language with multi-language support architecture.

## 🎮 Game Overview

**Alias** is a team-based word guessing game where:
- Two teams of 3-4 players compete against each other
- Players take turns explaining words without using forbidden terms
- Teams alternate between explaining and guessing
- An observer/admin moderates the game and makes final decisions
- All players connect via webcam and audio for real-time interaction

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Rust 1.70+
- Docker and Docker Compose
- MongoDB 6+
- Redis 7+
- Twitch Developer Account (for OAuth)

📊 Database Schema
Collections
users

Twitch authentication data
Player statistics
Role assignments

games

Game sessions
Team compositions
Score history

words

Multi-language words
Forbidden terms
Difficulty levels
Categories

### Installation

1. **Clone the repository**
  ```bash
  git clone https://github.com/yourusername/alias-game.git
  cd alias-game
```
2. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration:
# - Twitch OAuth credentials
# - JWT secret
# - Database URLs
```
3. **Start with Docker Compose**
```bash
docker-compose up -d
```
4. **Run database migrations**
```bash
cd backend
cargo run --bin migrate
```
5. **Seed word database**
```bash
cargo run --bin seed-words 

```
6. **Access the application**
   Frontend: http://localhost:4200
   Backend API: http://localhost:3000
   MongoDB: localhost:27017
   Redis: localhost:6379


