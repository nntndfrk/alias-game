import { test, expect } from '@playwright/test';

test.describe('Simple Authentication Test', () => {
  test('should load home page and show sign in button', async ({ page }) => {
    await page.goto('/');
    
    // Check if the page loads
    await expect(page.locator('h1:has-text("Welcome to Alias")')).toBeVisible();
    
    // Check if sign in button is visible
    const signInButton = page.locator('button:has-text("Sign in with Twitch")');
    await expect(signInButton).toBeVisible();
    
    // Click the button to open modal
    await signInButton.click();
    
    // Check if modal opens
    await expect(page.locator('text="Connect your Twitch Account"')).toBeVisible({ timeout: 5000 });
    
    // Check if Continue button is visible in modal
    await expect(page.locator('button:has-text("Continue with Twitch")')).toBeVisible();
    
    console.log('✓ Home page loads correctly');
    console.log('✓ Sign in button works');
    console.log('✓ OAuth modal opens');
  });
});