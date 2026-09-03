import { test, expect } from 'playwright/test';

test('new signup persists a session and can continue through profile setup', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Full name').fill('New Echoo Listener');
  await page.getByLabel('Username').fill('new-listener');
  await page.getByLabel('Email address').fill('new-listener@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByLabel('Confirm password').fill('Password123!');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Set up your profile' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    token: localStorage.getItem('accessToken'),
    user: JSON.parse(localStorage.getItem('user') || '{}'),
  }))).toMatchObject({ token: 'listener-token', user: { id: '507f1f77bcf86cd799439012', username: 'new-listener' } });

  await page.getByLabel('Display name').fill('New Echoo Listener');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: /Choose how you'll use Echoo/i })).toBeVisible();
});
