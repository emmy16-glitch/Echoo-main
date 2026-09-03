import { expect, test } from 'playwright/test';

const screenshotDir = 'e2e/screenshots/password-recovery';

const capture = async (page, testInfo, state) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({
    path: `${screenshotDir}/${testInfo.project.name}-${state}.png`,
    fullPage: true,
    timeout: 30_000,
  });
};

test('create-password empty, filled and success states stay on the Figma glass shell', async ({ page }, testInfo) => {
  const browserErrors = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('net::ERR_SOCKET_NOT_CONNECTED')) {
      browserErrors.push(text);
    }
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/reset-password?token=e2e-reset-token');
  await expect(page.getByRole('heading', { name: 'Create new password' })).toBeVisible();
  await expect(page.getByLabel('New password')).toBeVisible();
  await expect(page.getByLabel('Confirm new password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update password' })).toBeDisabled();
  await expect.poll(() => page.locator('.ear-auth-card').evaluate((card) => getComputedStyle(card).backdropFilter || getComputedStyle(card).webkitBackdropFilter)).not.toBe('none');
  await capture(page, testInfo, 'create-password-empty');

  await page.getByLabel('New password').fill('StrongPass2!');
  await page.getByLabel('Confirm new password').fill('StrongPass2!');
  await expect(page.getByRole('button', { name: 'Update password' })).toBeEnabled();
  await capture(page, testInfo, 'create-password-filled');

  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to login' })).toBeVisible();
  await capture(page, testInfo, 'password-success');

  expect(browserErrors).toEqual([]);
});
