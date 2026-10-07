import { test, expect } from 'playwright/test';

const listener = {
  id: '507f1f77bcf86cd799439012',
  _id: '507f1f77bcf86cd799439012',
  username: 'alexmorgan',
  displayName: 'Alex Morgan',
  userType: 'listener',
  roles: ['listener'],
  onboardingCompleted: true,
  profileCompleted: true,
};

const authenticate = (page) => page.addInitScript((user) => {
  localStorage.setItem('accessToken', 'listener-token');
  localStorage.setItem('token', 'listener-token');
  localStorage.setItem('refreshToken', 'listener-refresh-token');
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('echooRole', 'listener');
  localStorage.setItem('echooProfileCompleted', 'true');
  localStorage.setItem('echooOnboardingCompleted', 'true');
}, listener);

test('listener live catalogue has a usable shell and opens a live listening room', async ({ page }, testInfo) => {
  await authenticate(page);
  await page.goto('/listen');

  await expect(page.getByRole('heading', { name: 'Live now' })).toBeVisible();
  await expect(page.locator('.listener-v2-header')).toBeVisible();
  await expect(page.locator('.listener-v2-live-card').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

  await page.locator('.listener-v2-live-meta').first().click();
  await expect(page).toHaveURL(/\/listen\/live\//);
  await expect(page.locator('.listener-v2-live-room')).toBeVisible();
  await page.screenshot({ path: `design-qa-evidence/listener-streaming/${testInfo.project.name}-live-room.png`, fullPage: false });
});

test('listener catalogue keeps navigation and live cards aligned on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page);
  await page.goto('/listen');

  await expect(page.getByRole('heading', { name: 'Live now' })).toBeVisible();
  await expect(page.locator('.listener-v2-mobile-nav')).toBeVisible();
  await expect(page.locator('.listener-v2-live-grid')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('full player keeps long recording names inside its sheet', async ({ page }) => {
  await authenticate(page);
  await page.goto('/listen');
  await page.locator('.listener-v2-audio-list button').first().click();
  await page.getByRole('button', { name: 'Open full player' }).click();

  const sheet = page.locator('.listener-v2-full-player-sheet');
  const title = sheet.locator('.listener-v2-full-player-copy h2');
  await expect(sheet).toBeVisible();
  await expect(title).toBeVisible();
  expect(await title.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await sheet.evaluate((node) => node.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
});
