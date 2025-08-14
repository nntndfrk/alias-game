## 📋 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/twitch` | Initiate Twitch OAuth |
| GET | `/auth/callback` | Twitch OAuth callback |
| POST | `/auth/refresh` | Refresh JWT token |
| POST | `/auth/logout` | Logout user |

### Game Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/rooms/create` | Create new game room |
| GET | `/rooms/:id` | Get room details |
| POST | `/rooms/:id/join` | Join a room |
| POST | `/teams/:id/join` | Join a team |
| GET | `/words/random` | Get random word |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `game:start` | Server→Client | Game started |
| `turn:start` | Server→Client | New turn began |
| `word:guessed` | Client→Server | Word guess attempt |
| `violation:reported` | Client→Server | Report violation |
| `admin:decision` | Client→Server | Admin action |


