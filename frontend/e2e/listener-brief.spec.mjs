import { test, expect } from 'playwright/test';

const user = { id: '507f1f77bcf86cd799439012', username: 'listener', roles: ['listener'], userType: 'listener', onboardingCompleted: true, profileCompleted: true };
const authenticate = (page) => page.addInitScript((identity) => {
  localStorage.setItem('accessToken', 'listener-token');
  localStorage.setItem('user', JSON.stringify(identity));
  localStorage.setItem('echooRole', 'listener');
  localStorage.setItem('echooProfileCompleted', 'true');
  localStorage.setItem('echooOnboardingCompleted', 'true');
}, user);

test('listener has five consistent destinations and honest compact discovery', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/listener/dashboard', route => route.fulfill({ json: { success: true, data: { liveNow: [], upcoming: [], continueListening: [] } } }));
  await page.route('**/api/playlists?*', route => route.fulfill({ json: { success: true, data: [] } }));
  await page.goto('/listen');
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
  await expect(page.getByText('Nothing is live right now', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upcoming broadcasts' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Popular|Trending/ })).toHaveCount(0);
  const nav = page.locator(await page.locator('.listener-v2-mobile-nav').isVisible() ? '.listener-v2-mobile-nav' : '.listener-v2-nav');
  await expect(nav.getByRole('button')).toHaveText(['Discover', 'Following', 'Library', 'Search', 'Profile']);
  await nav.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(/\/listen\/library$/);
  await expect(nav.getByRole('button', { name: 'Library', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('live card does not invent listener counts', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/listener/dashboard', route => route.fulfill({ json: { success: true, data: { liveNow: [{ id: 'broadcast', title: 'Real broadcast', station: { name: 'Real creator' } }], upcoming: [] } } }));
  await page.goto('/listen');
  await expect(page.locator('.listener-v2-live-card')).toBeVisible();
  await expect(page.locator('.listener-v2-live-listeners')).toHaveCount(0);
  await expect(page.locator('.listener-v2-live-meta')).toContainText('Real creator');
  await expect(page.locator('.listener-v2-live-meta')).toContainText('Listen Live');
});
