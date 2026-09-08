import { test, expect } from 'playwright/test';

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

const authenticate = async (page) => {
  await page.addInitScript((user) => {
    localStorage.setItem('accessToken', 'creator-token');
    localStorage.setItem('token', 'creator-token');
    localStorage.setItem('refreshToken', 'creator-refresh-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooActiveExperience', 'creator');
    localStorage.setItem('creatorSetup', JSON.stringify({ type: 'individual', name: user.displayName }));
  }, creatorUser);
};

const openSchedule = async (page) => {
  await page.goto('/creator-studio');
  const navigation = page.getByRole('button', { name: 'Schedule Events', exact: true });
  await expect(navigation).toBeVisible();
  await navigation.click();
  await expect(page.getByRole('heading', { name: 'Schedule Events' })).toBeVisible();
};

test('Schedule Events modal is a real keyboard dialog and restores trigger focus', async ({ page }) => {
  await authenticate(page);
  await openSchedule(page);

  const trigger = page.getByRole('button', { name: 'Schedule event', exact: true }).first();
  await trigger.focus();
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Schedule event' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByLabel('Event title')).toBeFocused();

  const focusables = dialog.locator('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])');
  expect(await focusables.count()).toBeGreaterThan(3);
  await focusables.last().focus();
  await page.keyboard.press('Tab');
  await expect(focusables.first()).toBeFocused();
  await focusables.first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect(focusables.last()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('Schedule Events validates artwork and completes a real schedule action', async ({ page }) => {
  await authenticate(page);
  await openSchedule(page);

  const trigger = page.getByRole('button', { name: 'Schedule event', exact: true }).first();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Schedule event' });

  const artwork = dialog.locator('input[type="file"]');
  await artwork.setInputFiles({
    name: 'not-an-image.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.getByRole('alert')).toContainText('Event artwork must be JPG, PNG or WebP.');
  await page.getByRole('button', { name: 'Dismiss' }).click();

  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const date = [future.getFullYear(), String(future.getMonth() + 1).padStart(2, '0'), String(future.getDate()).padStart(2, '0')].join('-');
  const time = '18:30';

  await page.route('**/api/broadcasts', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const payload = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: '507f1f77bcf86cd799439077',
          _id: '507f1f77bcf86cd799439077',
          ...payload,
          status: 'scheduled',
        },
      }),
    });
  });

  await page.getByLabel('Event title').fill('Deep Playwright Broadcast');
  await page.getByLabel('Description').fill('Scheduled from the current Creator Studio modal.');
  await page.getByLabel('Date').fill(date);
  await page.getByLabel('Start time').fill(time);
  await dialog.getByRole('button', { name: 'Schedule event', exact: true }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Broadcast scheduled.');
  await expect(trigger).toBeFocused();
});
