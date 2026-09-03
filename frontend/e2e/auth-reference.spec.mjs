import { test, expect } from 'playwright/test';

const screenshotDir = 'e2e/screenshots/auth-reference';

const assertNoHorizontalOverflow = async (page) => {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
};

test('signup and login match the Listener-first Echoo auth composition', async ({ page }, testInfo) => {
  const browserErrors = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('net::ERR_SOCKET_NOT_CONNECTED')) {
      browserErrors.push(text);
    }
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Join the Echoo community' })).toBeVisible();
  await expect(page.getByText('STEP 1 OF 2')).toBeVisible();
  await expect(page.getByText('Creator / Listener')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start microphone test' })).toBeVisible();
  const firstWaveBar = page.locator('.ear-waveform span').first();
  const initialWaveTransform = await firstWaveBar.evaluate((bar) => getComputedStyle(bar).transform);
  await expect.poll(() => firstWaveBar.evaluate((bar) => getComputedStyle(bar).transform)).not.toBe(initialWaveTransform);
  await assertNoHorizontalOverflow(page);
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({
    path: `${screenshotDir}/${testInfo.project.name}-signup.png`,
    fullPage: true,
    timeout: 30_000,
  });

  await page.locator('.ear-auth-switch button').click({ force: true });
  await expect(page.locator('#ear-auth-title')).toHaveText('Echoo your sound');
  await expect(page.getByText('Sign in to continue your listening experience')).toBeVisible();
  await expect(page.getByLabel('Username or email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  await expect.poll(() => page.locator('.ear-login-art img').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.ear-auth-card')).toHaveCSS('position', 'relative');
  await expect.poll(() => page.locator('.ear-auth-card').evaluate((card) => getComputedStyle(card).backdropFilter || getComputedStyle(card).webkitBackdropFilter)).not.toBe('none');
  await assertNoHorizontalOverflow(page);
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({
    path: `${screenshotDir}/${testInfo.project.name}-login.png`,
    fullPage: true,
    timeout: 30_000,
  });

  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Forgot password?' })).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to login' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to login' }).click();

  await page.getByLabel('Username or email').fill('listener@example.test');
  await page.locator('#echoo-login-password').fill('password123');
  await page.getByRole('button', { name: 'Login' }).click({ force: true });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('accessToken'))).toBe('listener-token');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('echooActiveExperience'))).toBe('listener');

  expect(browserErrors).toEqual([]);
});
