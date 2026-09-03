import { test, expect } from 'playwright/test';

const screenshotDir = 'e2e/screenshots/auth-reference';

const assertNoHorizontalOverflow = async (page) => {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
};

const capture = async (page, testInfo, state) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({
    path: `${screenshotDir}/${testInfo.project.name}-${state}.png`,
    fullPage: true,
    timeout: 30_000,
  });
};

test('Echoo auth and password recovery follow the Figma glass-screen flow', async ({ page }, testInfo) => {
  const browserErrors = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('net::ERR_SOCKET_NOT_CONNECTED')) {
      browserErrors.push(text);
    }
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/');

  // Figma: Web Sign Up (empty/filled)
  await expect(page.getByRole('heading', { name: 'Sign up' })).toBeVisible();
  await expect(page.getByText('Enjoy wonderful listening experience')).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Confirm password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await expect(page.getByText('Creator / Listener')).toHaveCount(0);
  await expect(page.locator('.ear-auth-card')).toHaveCSS('position', 'relative');
  await expect.poll(() => page.locator('.ear-auth-card').evaluate((card) => getComputedStyle(card).backdropFilter || getComputedStyle(card).webkitBackdropFilter)).not.toBe('none');
  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo, 'signup-empty');

  await page.getByLabel('Username', { exact: true }).fill('figma-listener');
  await page.getByLabel('Email address').fill('listener@example.test');
  await page.getByLabel('Password', { exact: true }).fill('StrongPass1!');
  await page.getByLabel('Confirm password').fill('StrongPass1!');
  await expect(page.getByText(/By signing up, I agree to Echoo/)).toBeVisible();
  await capture(page, testInfo, 'signup-filled');

  // Figma: Sign in pg (empty/filled)
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#ear-auth-title')).toHaveText('Echoo your sound');
  await expect(page.getByText('Sign in to continue your listening experience')).toBeVisible();
  await expect(page.getByLabel('Username or email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  await expect.poll(() => page.locator('.ear-login-art img').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo, 'login-empty');

  await page.getByLabel('Username or email').fill('listener@example.test');
  await page.locator('#echoo-login-password').fill('password123');
  await capture(page, testInfo, 'login-filled');

  // Figma: forget password -> check email
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Forgot password?' })).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to login' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo, 'forgot-empty');

  await page.getByLabel('Email address').fill('listener@example.test');
  await capture(page, testInfo, 'forgot-filled');
  await page.getByRole('button', { name: 'Send reset link' }).click();

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect(page.getByText('listener@example.test')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to login' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo, 'check-email');

  await page.getByRole('button', { name: 'Back to login' }).click();
  await page.getByLabel('Username or email').fill('listener@example.test');
  await page.locator('#echoo-login-password').fill('password123');
  await page.getByRole('button', { name: 'Login' }).click({ force: true });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('accessToken'))).toBe('listener-token');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('echooActiveExperience'))).toBe('listener');

  expect(browserErrors).toEqual([]);
});

test('email verification stays inside the Figma auth shell and starts the same Listener account session', async ({ page }, testInfo) => {
  const pendingUser = {
    id: '507f1f77bcf86cd799439088',
    _id: '507f1f77bcf86cd799439088',
    username: 'verify-listener',
    displayName: 'verify-listener',
    email: 'verify-listener@example.test',
    userType: 'listener',
    roles: ['listener'],
    profileCompleted: false,
    onboardingCompleted: false,
    emailVerified: false,
  };

  await page.route('**/api/auth/register', (route) => route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        user: pendingUser,
        verificationRequired: true,
        verification: {
          userId: pendingUser.id,
          email: pendingUser.email,
          expiresInSeconds: 600,
        },
      },
    }),
  }));

  await page.route('**/api/auth/verify-email', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        user: { ...pendingUser, emailVerified: true },
        accessToken: 'verified-listener-token',
        refreshToken: 'verified-listener-refresh',
        verificationRequired: false,
      },
    }),
  }));

  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill(pendingUser.username);
  await page.getByLabel('Email address').fill(pendingUser.email);
  await page.getByLabel('Password', { exact: true }).fill('StrongPass1!');
  await page.getByLabel('Confirm password').fill('StrongPass1!');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  await expect(page.getByText(pendingUser.email)).toBeVisible();
  await expect(page.getByLabel('Verification code')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo, 'verify-empty');

  for (let index = 0; index < 6; index += 1) {
    await page.getByLabel(`Verification digit ${index + 1}`).fill(String(index + 1));
  }
  await capture(page, testInfo, 'verify-filled');
  await page.getByRole('button', { name: 'Verify' }).click();

  await expect(page.getByRole('heading', { name: 'Set up your profile' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('accessToken'))).toBe('verified-listener-token');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}')))
    .toMatchObject({ id: pendingUser.id, username: pendingUser.username, emailVerified: true });
});

test('reset-password link uses the same Echoo Web visual family and reaches success', async ({ page }, testInfo) => {
  await page.goto('/reset-password?token=playwright-reset-token');

  await expect(page.getByRole('heading', { name: 'Create new password' })).toBeVisible();
  await expect(page.getByLabel('New password')).toBeVisible();
  await expect(page.getByLabel('Confirm new password')).toBeVisible();
  await expect(page.locator('.ear-login-art img')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo, 'reset-password-empty');

  await page.getByLabel('New password').fill('FreshPass1!');
  await page.getByLabel('Confirm new password').fill('FreshPass1!');
  await capture(page, testInfo, 'reset-password-filled');
  await page.getByRole('button', { name: 'Update password' }).click();

  await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to login' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo, 'reset-password-success');
});
