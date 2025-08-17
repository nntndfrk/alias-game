# Testing Room Join Functionality

## Current Room State
- Room Code: `7DRI5A`
- Room Name: "sdf"
- Current Players: 1/8
- Admin: troy_tse_kit (user_id: 68a0c341f9085f5e6babb10a)
- State: waiting

## Test Scenarios

### 1. Join with Valid Room Code
To test joining, you need:
1. A second user account (different Twitch login)
2. Navigate to http://localhost:4200/lobby
3. Enter room code: `7DRI5A`
4. Click "Join"

Expected Result:
- User is added as a "player" role
- Redirected to /room/7DRI5A
- Participant count shows 2/8
- Admin sees new player in list

### 2. Join with Invalid Room Code
1. Enter non-existent code: `XXXXXX`
2. Click "Join"

Expected Result:
- Error message: "Failed to join room. Room may not exist or be full."
- Stay on lobby page

### 3. Join Full Room
(Need to create a room with max_players: 4 and fill it)

Expected Result:
- Error message about room being full

## API Testing Commands

### Test Join Room (requires auth token)
```bash
# Get auth token from browser localStorage or network tab
TOKEN="your-jwt-token"

# Join room - NO BODY REQUIRED ANYMORE!
curl -X POST http://localhost:3000/api/v1/rooms/7DRI5A/join \
  -H "Authorization: Bearer $TOKEN"
```

### Check Room After Join
```bash
curl -X GET http://localhost:3000/api/v1/rooms/7DRI5A | jq
```

## Verification Points

1. **Role Assignment**:
   - First user (creator): role = "admin"
   - Second user (joiner): role = "player"

2. **Participant List**:
   - Check participants object has both users
   - Each participant has correct role

3. **UI Updates**:
   - Admin sees "Admin" badge
   - Players see "Player" badge
   - Admin controls only visible to admin

4. **Room State**:
   - Remains "waiting" until admin starts
   - Player count updates correctly

## Code Flow

1. User clicks "Join" in lobby
2. `LobbyComponent.joinRoomByCode()` called
3. `RoomService.joinRoom()` sends POST request
4. Backend `rooms::join_room()`:
   - Validates room exists
   - Checks room not full
   - Adds user as "player" role
   - Updates participant list
5. Frontend navigates to room
6. `RoomComponent` loads and shows participant list
7. Effect updates UI based on role