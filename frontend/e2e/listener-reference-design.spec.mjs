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

test('Listener Home keeps the reference shell and responsive player/navigation geometry', async ({ page }, testInfo) => {
  await page.goto('/listen');
  await settle(page);
  const viewport = page.viewportSize();
  const isMobile = viewport.width <= 760;

  await expect(page.getByRole('heading', { level: 1, name: /Good morning, Lola/i })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Live now' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Stations for you' })).toBeVisible();

  const shell = page.locator('.echoo-listener-v2-shell');
  await expect(shell).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${testInfo.project.name}: Listener Home overflowed horizontally`).toBeLessThanOrEqual(2);

  if (isMobile) {
    await expect(page.locator('.echoo-app-sidebar')).toBeHidden();
    const nav = page.locator('.echoo-mobile-nav');
    const player = page.locator('.echoo-persistent-player');
    await expect(nav).toBeVisible();
    await expect(player).toBeVisible();
    expect(await nav.locator('.echoo-mobile-nav-item').count()).toBe(5);
    const navBox = await nav.boundingBox();
    const playerBox = await player.boundingBox();
    const playerBottom = playerBox.y + playerBox.height;
    expect(playerBottom).toBeLessThanOrEqual(navBox.y + 1);
    expect(playerBottom).toBeGreaterThanOrEqual(navBox.y - 2);
    expect(await player.locator('.layout-player-controls button:visible').count()).toBe(2);
    await expect(player.locator('.layout-player-volume')).toBeHidden();
  } else {
    const sidebar = page.locator('.echoo-app-sidebar');
    await expect(sidebar).toBeVisible();
    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox.width).toBeGreaterThanOrEqual(viewport.width <= 820 ? 190 : 220);
    expect(sidebarBox.width).toBeLessThanOrEqual(245);
    await expect(sidebar.locator('.studio-brand-icon img')).toBeVisible();
    const labels = sidebar.locator('.studio-nav-label:visible');
    for (let index = 0; index < await labels.count(); index += 1) {
      const style = await labels.nth(index).evaluate((node) => ({ writingMode: getComputedStyle(node).writingMode, width: node.getBoundingClientRect().width }));
      expect(style.writingMode).toBe('horizontal-tb');
      expect(style.width).toBeGreaterThan(40);
    }
  }

  await page.screenshot({ path: `test-results/reference-home-${testInfo.project.name}.png`, fullPage: true });
});

test('Following uses creator, station, and latest-content sections without a dashboard rail', async ({ page }, testInfo) => {
  await page.goto('/listen/library/following');
  await settle(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Following' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Creators you follow' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Stations you follow' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Latest from people you follow' })).toBeVisible();
  await expect(page.locator('.following-page aside')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `test-results/reference-following-${testInfo.project.name}.png`, fullPage: true });
});

test('Stations keeps ranked artwork, real filters, and usable station actions', async ({ page }, testInfo) => {
  await page.goto('/listen/stations');
  await settle(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Stations' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Top stations' })).toBeVisible();
  await expect(page.getByPlaceholder('Search stations', { exact: true })).toBeVisible();
  await expect(page.locator('.stations-top-card').first()).toBeVisible();
  const stationName = page.locator('.stations-top-overlay strong').first();
  const stationNameStyle = await stationName.evaluate((node) => ({ writingMode: getComputedStyle(node).writingMode, width: node.getBoundingClientRect().width }));
  expect(stationNameStyle.writingMode).toBe('horizontal-tb');
  expect(stationNameStyle.width).toBeGreaterThan(70);
  const follow = page.locator('.station-follow').first();
  await expect(follow).toBeVisible();
  expect((await follow.boundingBox()).height).toBeGreaterThanOrEqual(36);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `test-results/reference-stations-${testInfo.project.name}.png`, fullPage: true });
});
