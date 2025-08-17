import { Page, expect } from '@playwright/test';

export class RoomHelper {
  constructor(private page: Page) {}

  async createRoom(roomName: string): Promise<string> {
    // Mock room creation API
    const roomCode = `TEST_${Date.now()}`;
    await this.page.route('**/api/rooms', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            room_id: roomCode,
            room_code: roomCode,
            name: roomName,
            admin_id: 'test_user_1',
          }),
        });
      } else {
        await route.continue();
      }
    });
    
    await this.page.goto('/lobby');
    
    // Click create room button
    await this.page.click('button:has-text("Create Room")');
    
    // Fill room name in modal/form
    await this.page.fill('input[name="roomName"], input[placeholder*="room name" i]', roomName);
    
    // Submit form
    await this.page.click('button[type="submit"], button:has-text("Create"):not(:has-text("Create Room"))');
    
    // Wait for navigation to room
    await this.page.waitForURL(`**/room/${roomCode}`, { timeout: 5000 });
    
    return roomCode;
  }

  async joinRoom(roomCode: string) {
    let joinSuccess = true;
    let joinError = '';
    
    // Mock join room API
    await this.page.route(`**/api/rooms/${roomCode}/join`, async (route) => {
      // Check current player count (mocked)
      const playerCount = await this.getPlayerCount();
      if (playerCount >= 9) {
        joinSuccess = false;
        joinError = 'Room is full';
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Room is full',
            code: 'ROOM_FULL'
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: roomCode,
            room_code: roomCode,
            name: 'Test Room',
            participants: {},
            state: 'waiting',
            max_players: 9,
          }),
        });
      }
    });
    
    await this.page.goto('/lobby');
    
    // Click join room button
    await this.page.click('button:has-text("Join Room")');
    
    // Fill room code
    await this.page.fill('input[name="roomCode"], input[placeholder*="room code" i]', roomCode);
    
    // Submit
    await this.page.click('button[type="submit"], button:has-text("Join"):not(:has-text("Join Room"))');
    
    if (!joinSuccess) {
      // Wait for error message
      await expect(this.page.locator('text=/Room is full|Maximum capacity/i')).toBeVisible({ timeout: 5000 });
      return { success: false, reason: 'room_full' };
    }
    
    // Wait for navigation
    await this.page.waitForURL(`**/room/${roomCode}`, { timeout: 5000 }).catch(() => null);
    
    const currentUrl = this.page.url();
    if (currentUrl.includes(`/room/${roomCode}`)) {
      return { success: true };
    }
    
    return { success: false, reason: 'unknown' };
  }

  async kickUser(username: string) {
    const userElement = this.page.locator(`[data-player-name="${username}"]`);
    await expect(userElement).toBeVisible();
    
    await userElement.locator('button:has-text("Kick")').click();
    
    await this.page.locator('button:has-text("Confirm")').click();
    
    await expect(userElement).not.toBeVisible({ timeout: 5000 });
  }

  async getPlayerCount(): Promise<number> {
    const players = await this.page.locator('[data-player-name]').count();
    return players;
  }

  async waitForPlayerCount(expectedCount: number, timeout = 10000) {
    await expect(async () => {
      const count = await this.getPlayerCount();
      expect(count).toBe(expectedCount);
    }).toPass({ timeout });
  }

  async isInRoom(): Promise<boolean> {
    const url = this.page.url();
    return url.includes('/room/');
  }

  async getRoomId(): Promise<string | null> {
    const url = this.page.url();
    const match = url.match(/\/room\/([^\/]+)/);
    return match ? match[1] : null;
  }

  async waitForRoomFull() {
    await expect(this.page.locator('text=Room is full')).toBeVisible({ timeout: 5000 });
  }

  async selectTeam(team: 'A' | 'B') {
    await this.page.click(`button:has-text("Join Team ${team}")`);
    await expect(this.page.locator(`text=You are on Team ${team}`)).toBeVisible();
  }
}