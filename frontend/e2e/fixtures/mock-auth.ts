import { Page } from '@playwright/test';
import { TestUser } from './test-users';

export class MockAuth {
  constructor(private page: Page) {}

  async setupMockAuth(user: TestUser) {
    // Inject auth token directly into localStorage to bypass OAuth flow
    await this.page.addInitScript((userData) => {
      const token = btoa(JSON.stringify({
        sub: userData.id,
        preferred_username: userData.username,
        name: userData.displayName,
        picture: userData.profileImageUrl,
        email: userData.email,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }));
      
      // Use the correct keys that AuthService expects
      localStorage.setItem('alias_auth_token', `mock.${token}.signature`);
      localStorage.setItem('alias_user', JSON.stringify({
        id: userData.id,
        username: userData.username,
        display_name: userData.displayName,
        profile_image_url: userData.profileImageUrl,
      }));
    }, user);

    // Mock API endpoints
    await this.page.route('**/api/auth/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: user.id,
          login: user.username,
          display_name: user.displayName,
          profile_image_url: user.profileImageUrl,
        }),
      });
    });
  }

  async loginDirectly(user: TestUser) {
    await this.setupMockAuth(user);
    await this.page.goto('/lobby');
    
    // Check if we're redirected to login
    const url = this.page.url();
    if (!url.includes('/lobby')) {
      // Force navigation if auth guard blocks
      await this.page.evaluate(() => {
        window.location.href = '/lobby';
      });
      await this.page.waitForURL('**/lobby', { timeout: 5000 });
    }
  }
}