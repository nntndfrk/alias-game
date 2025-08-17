# Room Join Functionality Test Guide

## Overview
The room joining functionality has been fully implemented with proper role differentiation:
- **Room Creator**: Automatically assigned "admin" role
- **Room Joiners**: Automatically assigned "player" role

## Implementation Details

### Backend (Rust)
1. **Role Assignment** in `rooms.rs`:
   - `create_room()`: Assigns `UserRole::Admin` to creator
   - `join_room()`: Assigns `UserRole::Player` to joiners

2. **Validation**:
   - Room must exist
   - Room must not be full
   - User can't join same room twice

3. **Participant Management**:
   - Stores participants in HashMap with user_id as key
   - Tracks connection status and join time

### Frontend (Angular)
1. **Room Service**:
   - `joinRoom()`: Sends POST request with proper error handling
   - Redirects to room on success
   - Shows error messages on failure

2. **Lobby Component**:
   - Join by room code input
   - Join from available rooms list
   - Loading states and error feedback

3. **Room Component**:
   - Displays participants with role badges
   - Admin sees "Admin" label
   - Players see "Player" label
   - Admin-only controls visible to room creator

## Testing Steps

### 1. Create a Room (First User - Admin)
1. Open http://localhost:4200 in Browser 1
2. Login with Twitch (User A)
3. Navigate to Lobby
4. Create a room:
   - Name: "Test Game Room"
   - Max Players: 8
   - Click "Create Room"
5. You'll be redirected to `/room/[ROOM_CODE]`
6. Note the room code (e.g., "ABC123")
7. Verify:
   - You see "Admin" next to your name
   - Admin controls are visible
   - Player count shows 1/8

### 2. Join the Room (Second User - Player)
1. Open http://localhost:4200 in Browser 2 (incognito/different browser)
2. Login with different Twitch account (User B)
3. Navigate to Lobby
4. Join room either by:
   - **Option A**: Enter room code manually
   - **Option B**: Click "Join" on room in available rooms list
5. You'll be redirected to same room
6. Verify:
   - You see "Player" next to your name
   - NO admin controls visible
   - Player count shows 2/8
   - Both users visible in participant list

### 3. Role-Based UI Differences

#### Admin (Room Creator) Sees:
- "Admin" badge next to their name
- "Start Game" button
- "Settings" button
- Admin Controls panel:
  - "Kick Player" option
  - "Transfer Admin" option

#### Player (Room Joiner) Sees:
- "Player" label next to their name
- NO start game button
- NO admin controls
- Can only leave room

### 4. Error Cases

#### Invalid Room Code:
1. Try joining with code "XXXXXX"
2. Should see: "Failed to join room. Room may not exist or be full."

#### Full Room:
1. Create room with max_players: 4
2. Have 4 users join
3. 5th user tries to join
4. Should see: "Room is full" error

## API Testing

### Create Room (requires auth):
```bash
TOKEN="your-jwt-token"
curl -X POST http://localhost:3000/api/v1/rooms \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "API Test Room", "max_players": 6}'
```

### Join Room (requires auth):
```bash
curl -X POST http://localhost:3000/api/v1/rooms/ABC123/join \
  -H "Authorization: Bearer $TOKEN"
```

### Check Room Details:
```bash
curl http://localhost:3000/api/v1/rooms/ABC123 | jq '.participants'
```

## Expected JSON Structure

After one player joins admin's room:
```json
{
  "participants": {
    "admin_user_id": {
      "user_id": "admin_user_id",
      "username": "admin_user",
      "display_name": "Admin User",
      "role": "admin",
      "is_connected": true,
      "joined_at": "2025-08-17T10:00:00Z"
    },
    "player_user_id": {
      "user_id": "player_user_id", 
      "username": "player_user",
      "display_name": "Player User",
      "role": "player",
      "is_connected": true,
      "joined_at": "2025-08-17T10:01:00Z"
    }
  }
}
```

## Troubleshooting

1. **"Unauthorized" Error**: 
   - Check if logged in
   - Token might be expired
   - Check browser console for auth errors

2. **Room Not Found**:
   - Room codes are case-sensitive
   - Room may have been deleted
   - Check available rooms list

3. **Can't See Other Players**:
   - Refresh the page
   - Check WebSocket connection (future feature)
   - Verify both users joined same room code

## Success Indicators

✅ Room creator has "admin" role
✅ Room joiners have "player" role  
✅ Participant list updates with new joiners
✅ Role-based UI elements work correctly
✅ Error messages display appropriately
✅ Navigation works after join
✅ Room state persists across page refreshes