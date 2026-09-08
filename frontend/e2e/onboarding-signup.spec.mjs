import { test, expect } from 'playwright/test';

test('new signup persists one Echoo session, completes profile setup and lands in Listener', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Full name').fill('New Echoo Listener');
  await page.getByLabel('Username').fill('new-listener');
  await page.getByLabel('Email address').fill('new-listener@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByLabel('Confirm password').fill('Password123!');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Set up your profile' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    token: localStorage.getItem('accessToken'),
    user: JSON.parse(localStorage.getItem('user') || '{}'),
  }))).toMatchObject({
    token: 'listener-token',
    user: { id: '507f1f77bcf86cd799439012', username: 'new-listener' },
  });

  await page.getByLabel('Display name').fill('New Echoo Listener');
  await page.getByLabel(/Short bio/i).fill('Testing the complete Echoo account journey.');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Profile saved')).toBeVisible();
  await expect(page).toHaveURL(/\/listen$/);
  await expect(page.getByRole('button', { name: 'Create your Channel' })).toBeVisible();

  await expect.poll(() => page.evaluate(() => ({
    profileComplete: localStorage.getItem('echooProfileCompleted'),
    experience: localStorage.getItem('echooActiveExperience'),
    user: JSON.parse(localStorage.getItem('user') || '{}'),
  }))).toMatchObject({
    profileComplete: 'true',
    experience: 'listener',
    user: { username: 'new-listener', profileCompleted: true },
  });
});

test('signup explains duplicate email and duplicate username without losing entered values', async ({ page }) => {
  let responseCode = 'EMAIL_EXISTS';

  await page.route('**/api/auth/register', (route) => route.fulfill({
    status: 409,
    contentType: 'application/json',
    body: JSON.stringify({
      error: {
        code: responseCode,
        message: responseCode === 'EMAIL_EXISTS' ? 'Email already registered' : 'Username already taken',
      },
    }),
  }));

  await page.goto('/');
  await page.getByLabel('Full name').fill('Existing Echoo Listener');
  await page.getByLabel('Username').fill('existing-listener');
  await page.getByLabel('Email address').fill('existing@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByLabel('Confirm password').fill('Password123!');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Email already registered', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Username')).toHaveValue('existing-listener');
  await expect(page.getByLabel('Email address')).toHaveValue('existing@example.test');

  responseCode = 'USERNAME_TAKEN';
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Username already taken', { exact: true })).toBeVisible();
});
