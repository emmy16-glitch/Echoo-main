import { test, expect } from 'playwright/test';

const assertNoHorizontalOverflow = async (page) => {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
};

const collectBrowserErrors = (page) => {
  const errors = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('net::ERR_SOCKET_NOT_CONNECTED')) {
      errors.push(text);
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
};

test('new Echoo auth UI has distinct identity fields, working password eyes and responsive layout', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Create your Echoo account' })).toBeVisible();
  await expect(page.getByLabel('Full name')).toBeVisible();
  await expect(page.getByLabel('Username')).toBeVisible();
  await expect(page.getByText('This becomes your @username on Echoo.')).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByText('Used for account recovery and security notices.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start microphone test' })).toBeVisible();

  await page.getByLabel('Username').fill('ab');
  await expect(page.getByText('Username must be between 3 and 30 characters.')).toBeVisible();
  await page.getByLabel('Username').fill('new-listener');

  await page.getByLabel('Email address').fill('not-an-email');
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await page.getByLabel('Email address').fill('new-listener@example.test');

  const password = page.getByLabel('Password', { exact: true });
  await password.fill('Password123!');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');

  const confirm = page.getByLabel('Confirm password');
  await confirm.fill('Password123!');
  await expect(confirm).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show confirmed password' }).click();
  await expect(confirm).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide confirmed password' }).click();
  await expect(confirm).toHaveAttribute('type', 'password');

  await assertNoHorizontalOverflow(page);
  expect(browserErrors).toEqual([]);
});

test('login accepts username or email, normalizes @username and exposes working recovery', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const loginPayloads = [];

  await page.route('**/api/auth/login', async (route) => {
    loginPayloads.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          user: {
            id: '507f1f77bcf86cd799439012',
            username: 'echo-listener',
            email: 'listener@example.test',
            displayName: 'Echoo Listener',
            userType: 'listener',
            roles: ['listener'],
            onboardingCompleted: true,
            profileCompleted: true,
          },
          accessToken: 'listener-token',
          refreshToken: 'listener-refresh-token',
        },
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Echoo' })).toBeVisible();
  await expect(page.getByLabel('Username or email')).toBeVisible();
  await expect(page.getByText('Example: @okunlola or name@example.com')).toBeVisible();

  await page.getByLabel('Username or email').fill('@echo-listener');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page).toHaveURL(/\/listen$/);
  expect(loginPayloads).toEqual([{ username: 'echo-listener', password: 'Password123!' }]);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('accessToken'))).toBe('listener-token');

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();

  await page.getByLabel('Email address').fill('bad-email');
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await page.getByLabel('Email address').fill('listener@example.test');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Reset link sent')).toBeVisible();
  await page.getByRole('button', { name: /Back to sign in/i }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Echoo' })).toBeVisible();

  await assertNoHorizontalOverflow(page);
  expect(browserErrors).toEqual([]);
});
