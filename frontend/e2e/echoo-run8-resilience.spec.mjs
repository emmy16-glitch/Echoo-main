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
  roles: ['listener', 'creator'],
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
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooActiveExperience', nextRole);
    if (nextRole === 'creator') {
      localStorage.setItem('creatorSetup', JSON.stringify({ type: 'individual', name: nextUser.displayName }));
    }
  }, { nextUser: user, nextRole: role });
};

const settle = async (page, ms = 300) => {
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

test('unified account boundaries survive deep links and reloads', async ({ page }) => {
  await authenticate(page, 'listener');
  await page.goto('/listen/history');
  await expect(page).toHaveURL(/\/listen\/history$/);
  await page.reload();
  await expect(page).toHaveURL(/\/listen\/history$/);

  await page.goto('/creator-studio');
  await expect(page).toHaveURL(/\/listen\/?$/);

  await page.evaluate((user) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('accessToken', 'creator-token');
    localStorage.setItem('token', 'creator-token');
    localStorage.setItem('refreshToken', 'creator-refresh-token');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooActiveExperience', 'creator');
    localStorage.setItem('creatorSetup', JSON.stringify({ type: 'individual', name: user.displayName }));
  }, creatorUser);

  // Creator capability adds Studio; it never removes the account's Listener experience.
  await page.goto('/listen/settings');
  await expect(page).toHaveURL(/\/listen\/settings$/);
  await page.reload();
  await expect(page).toHaveURL(/\/listen\/settings$/);

  await page.goto('/creator-studio/collections');
  await expect(page).toHaveURL(/\/creator-studio\/collections$/);
  await page.reload();
  await expect(page).toHaveURL(/\/creator-studio\/collections$/);
});

test('lazy Creator Studio chunk failure shows a usable fallback and retry recovers to Broadcast', async ({ page }) => {
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
  await retry.click();

  await expect(page).toHaveURL(/\/creator-studio\/?$/);
  await expect(page.getByRole('button', { name: 'Broadcast', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.ec2-broadcast')).toBeVisible();
  expect(failedOnce).toBe(true);
});

test('Listener Live recovers from a real API outage without a page reload', async ({ page }) => {
  await authenticate(page, 'listener');

  let failDashboard = true;
  await page.route('**/api/listener/dashboard**', async (route) => {
    if (failDashboard) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.goto('/listen');
  await expect(page.getByText('We couldn’t reach Echoo.')).toBeVisible({ timeout: 10_000 });
  const retry = page.getByRole('button', { name: 'Try again' }).first();
  await expect(retry).toBeVisible();

  failDashboard = false;
  await retry.click();
  await expect(page.locator('.listener-v2-live-card').first()).toBeVisible({ timeout: 10_000 });
  await assertNoHorizontalOverflow(page, 'recovered Listener Live');
});

test('rapid current Listener navigation plus browser back and forward stays stable', async ({ page }) => {
  await authenticate(page, 'listener');
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

  await page.goto('/listen');
  await page.getByRole('button', { name: 'Following', exact: true }).first().click();
  await expect(page).toHaveURL(/\/listen\/following$/);

  const headerSearch = page.getByPlaceholder('Search live Channels...');
  await headerSearch.fill('Echoo');
  await headerSearch.press('Enter');
  await expect(page).toHaveURL(/\/listen\/search\?q=Echoo$/);

  await page.getByRole('button', { name: 'Open listener account menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/listen\/settings$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/listen\/search\?q=Echoo$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/listen\/following$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/listen\/search\?q=Echoo$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/listen\/settings$/);

  await assertNoHorizontalOverflow(page, 'rapid Listener navigation');
  expect(pageErrors).toEqual([]);
});

test('keyboard skip navigation and reduced-motion preference remain usable', async ({ page }) => {
  await authenticate(page, 'listener');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/listen/search');
  await settle(page);

  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#echoo-route-content')).toBeFocused();
  await assertNoHorizontalOverflow(page, 'reduced motion');
});

test('Creator Upload Audio modal can open and close repeatedly without overlay leakage', async ({ page }) => {
  await authenticate(page, 'creator');
  await page.goto('/creator-studio');
  await settle(page);

  const opener = page.getByRole('button', { name: /upload audio/i }).first();
  await expect(opener).toBeVisible();

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await opener.focus();
    await opener.click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.locator('[role="dialog"]:visible').count(), `cycle ${cycle + 1}: leaked modal`).toBe(0);
  }
});
