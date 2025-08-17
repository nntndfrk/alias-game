# E2E Tests for Alias Game

## Overview
The E2E tests verify the complete flow of the Alias game including:
- Multiple user authentication via Twitch OAuth (mocked)
- Room creation and management
- Room capacity limits (max 9 players)
- Admin controls (kick functionality)
- Concurrent join handling

## Test Scenario
The main test (`room-capacity.spec.ts`) performs the following:

1. **Admin creates room**: First user logs in and creates a game room
2. **8 users join**: Additional users authenticate and join the room
3. **9th user rejected**: When room reaches capacity, new joins are blocked
4. **Admin kicks user**: Admin removes a player from the room
5. **Previously rejected user joins**: After space opens, rejected user can join

## Running the Tests

### Prerequisites
```bash
# Install dependencies
cd frontend
npm install

# Install Playwright browsers (first time only)
npx playwright install
```

### Start Backend Services
```bash
# Terminal 1: Start MongoDB
docker-compose up -d mongodb

# Terminal 2: Start Redis
docker-compose up -d redis

# Terminal 3: Start backend (with test environment variables)
cd backend
TWITCH_CLIENT_ID=test_client_id \
TWITCH_CLIENT_SECRET=test_secret \
JWT_SECRET=test_jwt_secret \
MONGODB_URL=mongodb://localhost:27017/alias_test \
REDIS_URL=redis://localhost:6379 \
cargo run --bin api-gateway
```

### Run Tests
```bash
cd frontend

# Run all E2E tests
npm run e2e

# Run with UI mode (interactive)
npm run e2e:ui

# Run in headed mode (see browser)
npm run e2e:headed

# Debug mode
npm run e2e:debug
```

## Test Structure

### Fixtures
- `test-users.ts`: Generates 10 test users with mock Twitch profiles
- `auth-helper.ts`: Handles mock authentication flow
- `room-helper.ts`: Provides room management utilities

### Key Features Tested
- **Authentication**: Mock Twitch OAuth for multiple users
- **Room Capacity**: Enforces 9-player maximum
- **Concurrent Joins**: Handles race conditions
- **Admin Controls**: Kick functionality
- **State Management**: Proper WebSocket synchronization

## Configuration
The test configuration (`playwright.config.ts`) includes:
- Single worker to ensure sequential execution
- Automatic server startup (frontend and backend)
- Screenshot and video capture on failure
- HTML report generation

## Troubleshooting

### Common Issues
1. **Port conflicts**: Ensure ports 3000 (backend) and 4200 (frontend) are free
2. **Database connection**: MongoDB must be running on port 27017
3. **Redis connection**: Redis must be running on port 6379
4. **Browser installation**: Run `npx playwright install` if browsers are missing

### Debug Tips
- Use `npm run e2e:debug` to step through tests
- Check `playwright-report/` for detailed test results
- Screenshots and videos are saved on failure

## CI/CD Integration
For CI environments:
- Set `CI=true` environment variable
- Tests will retry failed cases twice
- Servers won't reuse existing instances

## Notes
- Tests use mock authentication to avoid Twitch API dependencies
- Each test creates isolated browser contexts for true multi-user simulation
- WebSocket connections are established for real-time updates
- Tests clean up after themselves (close contexts, logout users)