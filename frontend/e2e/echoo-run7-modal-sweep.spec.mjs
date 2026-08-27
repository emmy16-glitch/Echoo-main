import { test, expect } from 'playwright/test';

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

const authenticate = async (page) => {
  await page.addInitScript((user) => {
    localStorage.setItem('accessToken', 'creator-token');
    localStorage.setItem('token', 'creator-token');
    localStorage.setItem('refreshToken', 'creator-refresh-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('echooRole', 'creator');
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('creatorSetup', JSON.stringify({ type: 'individual', name: user.displayName }));
  }, creatorUser);
};

const settle = async (page, ms = 400) => {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(ms);
};

const representative = new Set(['desktop-1440', 'firefox-1440', 'webkit-1440']);

const assertModalKeyboardContract = async ({ page, opener, dialog, closeByEscape = true }) => {
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  const labelledBy = await dialog.getAttribute('aria-labelledby');
  const ariaLabel = await dialog.getAttribute('aria-label');
  expect(Boolean(labelledBy || ariaLabel), 'modal must have a programmatic accessible name').toBe(true);

  const focusables = dialog.locator('button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  const count = await focusables.count();
  expect(count, 'modal must contain keyboard-operable controls').toBeGreaterThan(0);

  const last = focusables.last();
  await last.focus();
  await page.keyboard.press('Tab');
  await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);

  const first = focusables.first();
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);

  if (closeByEscape) {
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
};

test('Creator Upload Audio modal is named, trapped, Escape-closeable and restores focus', async ({ page }, testInfo) => {
  test.skip(!representative.has(testInfo.project.name));
  await authenticate(page);
  await page.goto('/creator-studio');
  await settle(page);

  const opener = page.getByRole('button', { name: /upload audio/i }).first();
  await expect(opener).toBeVisible();
  await opener.focus();
  await opener.click();

  const dialog = page.locator('.studio-upload-modal').first();
  await assertModalKeyboardContract({ page, opener, dialog });
});

test('Creator Audio Detail modal keeps keyboard focus inside and restores its Details trigger', async ({ page }, testInfo) => {
  test.skip(!representative.has(testInfo.project.name));
  await authenticate(page);
  await page.goto('/creator-studio');
  await settle(page);

  const audioNav = page.getByRole('button', { name: /^Audio$/ }).first();
  await expect(audioNav).toBeVisible();
  await audioNav.click();
  await page.waitForTimeout(500);

  const opener = page.getByRole('button', { name: /^Details$/ }).first();
  if (!(await opener.count())) {
    test.skip(true, 'Mock Creator library has no audio detail row in this fixture.');
    return;
  }

  await opener.focus();
  await opener.click();
  const dialog = page.locator('.creator-audio-modal').first();
  await assertModalKeyboardContract({ page, opener, dialog });
});

test('Creator audio rename confirms successful saves without closing the detail modal', async ({ page }, testInfo) => {
  test.skip(!representative.has(testInfo.project.name));
  await authenticate(page);
  await page.goto('/creator-studio');
  await settle(page);

  const audioNav = page.getByRole('button', { name: /^Audio$/ }).first();
  await expect(audioNav).toBeVisible();
  await audioNav.click();
  await page.waitForTimeout(500);

  const opener = page.getByRole('button', { name: /^Details$/ }).first();
  if (!(await opener.count())) {
    test.skip(true, 'Mock Creator library has no audio detail row in this fixture.');
    return;
  }

  await opener.click();
  const dialog = page.locator('.creator-audio-modal').first();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Rename audio' }).click();
  const input = dialog.getByLabel('Audio title');
  await input.fill('Verified rename feedback');
  await dialog.getByRole('button', { name: 'Save' }).click();

  const toast = page.locator('.echoo-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText(/Audio renamed/);
  await expect(toast).toHaveText(/Verified rename feedback/);
  await expect(dialog).toBeVisible();
});
