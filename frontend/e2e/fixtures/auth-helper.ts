import { Page, BrowserContext } from '@playwright/test';
import { TestUser } from './test-users';

export class AuthHelper {
  constructor(private page: Page) {}

  async mockTwitchOAuth(user: TestUser) {
    // Mock the auth URL endpoint
    await this.page.route('**/api/auth/twitch', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          auth_url: `http://localhost:4200/auth/callback?code=test_code_${user.id}`,
        }),
      });
    });

    // Mock the callback endpoint
    await this.page.route('**/api/auth/callback', async (route) => {
      const token = Buffer.from(JSON.stringify({
        sub: user.id,
        preferred_username: user.username,
        name: user.displayName,
        picture: user.profileImageUrl,
        email: user.email,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })).toString('base64');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: `mock.${token}.signature`,
          user: {
            id: user.id,
            login: user.username,
            display_name: user.displayName,
            profile_image_url: user.profileImageUrl,
          },
        }),
      });
    });

    // Mock the user endpoint
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
    
    // Mock room endpoints
    await this.page.route('**/api/rooms', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      } else {
        await route.continue();
      }
    });
  }

  async login(user: TestUser) {
    await this.mockTwitchOAuth(user);
    
    await this.page.goto('/');
    
    // Click the Sign in button to open modal
    await this.page.click('button:has-text("Sign in with Twitch")');
    
    // Wait for modal to appear and click Continue
    await this.page.waitForSelector('text="Connect your Twitch Account"', { timeout: 5000 });
    await this.page.click('button:has-text("Continue with Twitch")');
    
    // The mock will immediately redirect to callback, simulating successful auth
    // Override window.open to prevent actual popup
    await this.page.evaluate(() => {
      const originalOpen = window.open;
      window.open = (url: any) => {
        // Simulate immediate callback with code
        if (url && url.includes('/auth/callback')) {
          window.location.href = url;
        }
        return window as any;
      };
    });
    
    // Wait for navigation to lobby after successful auth
    await this.page.waitForURL('**/lobby', { timeout: 10000 });
    
    // Store token in localStorage if needed
    const token = `mock.${Buffer.from(JSON.stringify(user)).toString('base64')}.signature`;
    await this.page.evaluate((mockToken) => {
      localStorage.setItem('access_token', mockToken);
    }, token);
  }

  async logout() {
    await this.page.evaluate(() => {
      localStorage.removeItem('auth_token');
    });
    await this.page.goto('/');
  }

  static async createAuthenticatedContext(
    browser: any,
    user: TestUser
  ): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const authHelper = new AuthHelper(page);
    await authHelper.login(user);
    
    return { context, page };
  }
}