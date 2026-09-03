import { expect, test } from 'playwright/test';

const creator = {
  id: '507f1f77bcf86cd799439099', _id: '507f1f77bcf86cd799439099',
  username: 'echoocreator', displayName: 'Echoo Creator', userType: 'creator',
  roles: ['creator'], onboardingCompleted: true, profileCompleted: true,
};
const station = {
  id: '507f1f77bcf86cd799439001', _id: '507f1f77bcf86cd799439001', slug: 'my-station',
  name: 'My Station', description: 'My Station live conversations', category: 'Technology',
  isPublic: true, isLive: true, listenerCount: 500, owner: creator,
};
const fulfill = (route, data) => route.fulfill({ json: { data } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((user) => {
    localStorage.setItem('accessToken', 'creator-token');
    localStorage.setItem('token', 'creator-token');
    localStorage.setItem('refreshToken', 'creator-refresh-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('echooRole', 'creator');
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
  }, creator);
  await page.route('**/api/auth/me', (route) => fulfill(route, { user: creator }));
  await page.route('**/api/stations/mine/all**', (route) => fulfill(route, [station]));
  await page.route('**/api/broadcasts/mine/all**', (route) => fulfill(route, []));
  await page.route('**/api/studio/**', (route) => fulfill(route, {}));
  await page.route('**/api/**', (route) => route.fallback());
});

test('Channel is the canonical creator station surface', async ({ page }) => {
  await page.goto('/creator-studio/channels');
  await expect(page.getByRole('heading', { name: 'Channel', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Channel', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'My Station', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Channel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View as Listener' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy Channel link' })).toBeVisible();
});

test('Creator navigation moves between Broadcast and Channel without losing route state', async ({ page }) => {
  await page.goto('/creator-studio/channels');
  await page.getByRole('button', { name: 'Broadcast', exact: true }).click();
  await expect(page).toHaveURL(/\/creator-studio$/);
  await expect(page.getByRole('region', { name: 'Broadcast workstation' })).toBeVisible();
  await page.getByRole('button', { name: 'Channel', exact: true }).click();
  await expect(page).toHaveURL(/\/creator-studio\/channels$/);
  await expect(page.getByRole('heading', { name: 'Channel', level: 1 })).toBeVisible();
});

test('Channel remains usable without horizontal overflow on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/creator-studio/channels');
  await expect(page.getByRole('heading', { name: 'Channel', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy Channel link' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
