import { test, expect } from 'playwright/test';

const listenerUser = {
  id: '507f1f77bcf86cd799439012',
  _id: '507f1f77bcf86cd799439012',
  username: 'echolistener',
  displayName: 'Echoo Listener With A Long Display Name',
  email: 'listener@example.test',
  userType: 'listener',
  roles: ['listener'],
  onboardingCompleted: true,
  profileCompleted: true,
};

const creatorUser = {
  id: '507f1f77bcf86cd799439011',
  _id: '507f1f77bcf86cd799439011',
  username: 'echoocreator',
  displayName: 'Echoo Creator With A Long Display Name',
  email: 'creator@example.test',
  userType: 'creator',
  roles: ['creator'],
  onboardingCompleted: true,
  profileCompleted: true,
  creatorProfile: { creatorType: 'individual', artistName: 'Echoo Creator' },
};

const authenticate = async (page, role) => {
  const user = role === 'creator' ? creatorUser : listenerUser;
  await page.addInitScript(({ nextUser, nextRole }) => {
    localStorage.setItem('accessToken', `${nextRole}-token`);
    localStorage.setItem('token', `${nextRole}-token`);
    localStorage.setItem('refreshToken', `${nextRole}-refresh-token`);
    localStorage.setItem('user', JSON.stringify(nextUser));
    localStorage.setItem('echooRole', nextRole);
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    if (nextRole === 'creator') {
      localStorage.setItem('creatorSetup', JSON.stringify({ type: 'individual', name: nextUser.displayName }));
    }
  }, { nextUser: user, nextRole: role });
};

const settle = async (page, ms = 350) => {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(ms);
};

const assertNoHorizontalOverflow = async (page, label) => {
  const geometry = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth, `${label}: horizontal document overflow`).toBeLessThanOrEqual(geometry.width + 2);
};

const desktopEngines = new Set(['desktop-1440', 'firefox-1440', 'webkit-1440']);

test('role boundaries survive direct deep links, reloads and wrong-role navigation', async ({ page }, testInfo) => {
  test.skip(!desktopEngines.has(testInfo.project.name));

  await authenticate(page, 'listener');
  await page.goto('/listen/history');
  await settle(page);
  await expect(page).toHaveURL(/\/listen\/history$/);
  await expect(page.locator('#echoo-route-content')).toBeVisible();

  await page.reload();
  await settle(page);
  await expect(page).toHaveURL(/\/listen\/history$/);

  await page.goto('/creator-studio');
  await settle(page);
  await expect(page).toHaveURL(/\/listen\/?$/);

  await page.evaluate((user) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('echooRole', 'creator');
    localStorage.setItem('accessToken', 'creator-token');
    localStorage.setItem('token', 'creator-token');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('creatorSetup', JSON.stringify({ type: 'individual', name: user.displayName }));
  }, creatorUser);
  await page.goto('/listen/settings');
  await settle(page);
  await expect(page).toHaveURL(/\/creator-studio$/);
});

test('lazy Creator Studio chunk failure shows a usable fallback and Try again performs a true recovery', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440');
  await authenticate(page, 'creator');

  let failedOnce = false;
  await page.route('**/src/Components/CreatorStudio/CreatorStudio*', async (route) => {
    if (!failedOnce) {
      failedOnce = true;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.goto('/creator-studio');
  const fallback = page.getByRole('alert');
  await expect(fallback).toContainText("This page couldn't load");
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible();
  await retry.click();

  await expect(page).toHaveURL(/\/creator-studio$/);
  await expect(page.getByRole('button', { name: /^Audio$/ }).first()).toBeVisible({ timeout: 15_000 });
  expect(failedOnce).toBe(true);
});

test('Listener Stations recovers from a real API outage without a page reload', async ({ page }, testInfo) => {
  test.skip(!['desktop-1440', 'webkit-390'].includes(testInfo.project.name));
  await authenticate(page, 'listener');

  let failStations = true;
  await page.route('**/api/stations**', async (route) => {
    if (failStations) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.goto('/listen/stations');
  await expect(page.getByText('Stations could not be loaded.').first()).toBeVisible({ timeout: 10_000 });
  const retry = page.getByRole('button', { name: 'Try again' }).first();
  await expect(retry).toBeVisible();

  failStations = false;
  await retry.click();
  await expect(page.getByRole('heading', { name: 'Stations', exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'All stations', exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page, `${testInfo.project.name} recovered Stations`);
});

test('rapid listener SPA navigation plus back/forward stays stable without page errors', async ({ page }, testInfo) => {
  test.skip(!desktopEngines.has(testInfo.project.name));
  await authenticate(page, 'listener');

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

  await page.goto('/listen');
  await settle(page);

  const steps = [
    ['Search', '/listen/search'],
    ['Stations', '/listen/stations'],
    ['Library', '/listen/library'],
    ['History', '/listen/history'],
    ['Downloads', '/listen/downloads'],
    ['Settings', '/listen/settings'],
  ];

  for (const [name, path] of steps) {
    const link = page.getByRole('link', { name, exact: true }).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`));
    await assertNoHorizontalOverflow(page, `${testInfo.project.name} ${name}`);
  }

  for (let index = 0; index < 3; index += 1) {
    await page.goBack();
    await settle(page, 100);
  }
  for (let index = 0; index < 3; index += 1) {
    await page.goForward();
    await settle(page, 100);
  }

  expect(pageErrors, `uncaught browser errors: ${pageErrors.join(' | ')}`).toEqual([]);
});

test('keyboard skip navigation and reduced-motion preference remain usable', async ({ page }, testInfo) => {
  test.skip(!['desktop-1440', 'webkit-1440'].includes(testInfo.project.name));
  await authenticate(page, 'listener');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/listen/search');
  await settle(page);

  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#echoo-route-content')).toBeFocused();
  await assertNoHorizontalOverflow(page, `${testInfo.project.name} reduced motion`);
});

test('Creator Upload Audio modal can open/close repeatedly without focus or overlay leakage', async ({ page }, testInfo) => {
  test.skip(!desktopEngines.has(testInfo.project.name));
  await authenticate(page, 'creator');
  await page.goto('/creator-studio');
  await settle(page);

  const opener = page.getByRole('button', { name: /upload audio/i }).first();
  await expect(opener).toBeVisible();

  for (let cycle = 0; cycle < 5; cycle += 1) {
    await opener.focus();
    await opener.click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await page.locator('[role="dialog"]:visible').count(), `cycle ${cycle + 1}: leaked modal`).toBe(0);
  }
});
