# Alias Game Backend

Rust-based backend for the Alias multiplayer game.

## Architecture

- **API Gateway**: Main entry point handling HTTP/WebSocket connections
- **Game Engine**: Core game logic and state management
- **Auth Service**: Twitch OAuth integration and JWT handling

## Development

```bash
# Install dependencies
cargo build

# Run API gateway
cargo run --bin api-gateway

# Run migrations
cargo run --bin migrate

# Seed word database
cargo run --bin seed-words

# Run tests
cargo test

# Format code
cargo fmt

# Lint
cargo clippy
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `MONGODB_URL`: MongoDB connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: Secret for JWT signing
- `TWITCH_CLIENT_ID`: Twitch OAuth client ID
- `TWITCH_CLIENT_SECRET`: Twitch OAuth client secret

## Docker

```bash
# Build image
docker build -t alias-backend .

# Run with docker-compose
docker-compose up api-gateway
```