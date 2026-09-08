import { test, expect } from 'playwright/test';

const listener = {
  id: '507f1f77bcf86cd799439012',
  _id: '507f1f77bcf86cd799439012',
  username: 'lola',
  displayName: 'Lola',
  email: 'listener@example.test',
  userType: 'listener',
  roles: ['listener'],
  onboardingCompleted: true,
  profileCompleted: true,
};

const authenticate = async (page) => {
  await page.addInitScript((user) => {
    localStorage.setItem('accessToken', 'listener-token');
    localStorage.setItem('token', 'listener-token');
    localStorage.setItem('refreshToken', 'listener-refresh-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('echooRole', 'listener');
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
  }, listener);
};

const settle = async (page) => {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(700);
};

test.beforeEach(async ({ page }) => authenticate(page));

test('Listener Home keeps the Listener 2.0 shell and responsive navigation geometry', async ({ page }, testInfo) => {
  await page.goto('/listen');
  await settle(page);
  const viewport = page.viewportSize();
  const isMobile = viewport.width <= 760;

  await expect(page.getByRole('heading', { level: 1, name: 'Discover' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Trending recordings' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Live now' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Popular playlists' })).toBeVisible();

  const shell = page.locator('.listener-v2-root');
  await expect(shell).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${testInfo.project.name}: Listener Home overflowed horizontally`).toBeLessThanOrEqual(2);

  if (isMobile) {
    const mobileNav = page.locator('.listener-v2-mobile-nav');
    await expect(mobileNav).toBeVisible();
    expect(await mobileNav.locator('button').count()).toBe(4);
    await expect(page.locator('.listener-v2-nav')).toBeHidden();
  } else {
    const topNav = page.locator('.listener-v2-nav');
    await expect(topNav).toBeVisible();
    await expect(topNav.getByRole('button', { name: 'Live now' })).toBeVisible();
    await expect(topNav.getByRole('button', { name: 'Following' })).toBeVisible();
    await expect(page.locator('.listener-v2-mobile-nav')).toBeHidden();
  }

  await page.screenshot({ path: `test-results/reference-home-${testInfo.project.name}.png`, fullPage: true });
});

test('Following lists live and all-following channel sections without a dashboard rail', async ({ page }, testInfo) => {
  await page.goto('/listen/following');
  await settle(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Following' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Live from your following' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'All following' })).toBeVisible();
  await expect(page.locator('.listener-v2-following-row').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `test-results/reference-following-${testInfo.project.name}.png`, fullPage: true });
});

test('Channels keeps ranked artwork, real filters, and usable channel actions', async ({ page }, testInfo) => {
  await page.goto('/listen/channels');
  await settle(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Channels' })).toBeVisible();
  await expect(page.getByPlaceholder('Search Channels...')).toBeVisible();
  await expect(page.getByRole('button', { name: 'All Channels' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Explore Channels' })).toBeVisible();

  const card = page.locator('.listener-v2-station-card').first();
  await expect(card).toBeVisible();
  const stationName = card.locator('.listener-v2-station-meta strong').first();
  const stationNameStyle = await stationName.evaluate((node) => ({
    writingMode: getComputedStyle(node).writingMode,
    width: node.getBoundingClientRect().width,
  }));
  expect(stationNameStyle.writingMode).toBe('horizontal-tb');
  expect(stationNameStyle.width).toBeGreaterThan(40);

  const follow = card.locator('.listener-v2-follow-button').first();
  await expect(follow).toBeVisible();
  await expect(follow).toHaveText(/Follow/);

  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `test-results/reference-channels-${testInfo.project.name}.png`, fullPage: true });
});
