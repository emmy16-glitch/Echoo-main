import { test, expect } from 'playwright/test';

const assertNoHorizontalOverflow = async (page) => {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
};

const assertAuthFitsViewport = async (page) => {
  const dimensions = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    bodyScrollHeight: document.body.scrollHeight,
  }));
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight + 1);
  expect(dimensions.bodyScrollHeight).toBeLessThanOrEqual(dimensions.clientHeight + 1);
};

const assertSignupViewportBehavior = async (page) => {
  await assertNoHorizontalOverflow(page);
  if (page.viewportSize().width > 700 || page.viewportSize().height >= 461) {
    await assertAuthFitsViewport(page);
  }
};

const toggleEyeWithoutDrift = async (page, input, showName, hideName) => {
  const shell = input.locator('xpath=..');
  const field = await shell.boundingBox();
  const eye = page.getByRole('button', { name: showName });
  const eyeBefore = await eye.boundingBox();
  const eyeOffsetBefore = {
    x: eyeBefore.x - field.x,
  };
  const centerBefore = Math.abs((eyeBefore.y + eyeBefore.height / 2) - (field.y + field.height / 2));
  await eye.click();
  await expect(input).toHaveAttribute('type', 'text');
  const eyeAfter = await page.getByRole('button', { name: hideName }).boundingBox();
  const fieldAfter = await shell.boundingBox();
  expect(Math.abs((eyeAfter.x - fieldAfter.x) - eyeOffsetBefore.x)).toBeLessThan(2);
  expect(Math.abs(eyeAfter.width - eyeBefore.width)).toBeLessThan(2);
  expect(Math.abs(eyeAfter.height - eyeBefore.height)).toBeLessThan(2);
  expect(eyeBefore.x + eyeBefore.width / 2).toBeGreaterThan(field.x + field.width - 50);
  const centerAfter = Math.abs((eyeAfter.y + eyeAfter.height / 2) - (fieldAfter.y + fieldAfter.height / 2));
  expect(centerBefore).toBeLessThan(2);
  expect(centerAfter).toBeLessThan(2);
  await page.getByRole('button', { name: hideName }).click();
  await expect(input).toHaveAttribute('type', 'password');
};

const collectBrowserErrors = (page) => {
  const errors = [];
  page.on('console', (message) => {
    const text = message.text();
    if (
      message.type() === 'error' &&
      !text.includes('net::ERR_SOCKET_NOT_CONNECTED') &&
      !text.includes('Failed to load resource: the server responded with a status of 502')
    ) {
      errors.push(text);
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
};

test('Echoo photographed signup preserves fields, policy consent and responsive layout', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto('/register');

  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
  await expect(page.getByText('Join Echoo and start sharing or listening.')).toHaveCount(0);
  await expect(page.locator('.ear-auth-backdrop')).toHaveCSS('background-image', /echoo-auth-studio-reference-v2/);
  await expect(page.locator('.ear-auth-story')).toHaveCount(0);
  await expect(page.locator('.ear-policy-agreement')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue listening without an account' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create an account' })).toHaveCSS('color', 'rgb(105, 168, 255)');
  await expect(page.getByText('Create your Echoo account to get started.')).toBeVisible();
  await expect(page.getByText('Continue with Google')).toHaveCount(0);
  await assertSignupViewportBehavior(page);
  if (page.viewportSize().width <= 560) {
    await page.screenshot({ path: `design-qa-evidence/auth-approved/auth-signup-${test.info().project.name}.png` });
  }
  await expect(page.getByLabel('Full name')).toBeVisible();
  await page.getByLabel('Full name').fill('New Echoo Listener');
  await expect(page.getByLabel('Username')).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();

  await page.getByLabel('Username').fill('ab');
  await expect(page.getByText('Username must be between 3 and 30 characters.')).toBeVisible();
  await page.getByLabel('Username').fill('new-listener');

  await page.getByLabel('Email address').fill('not-an-email');
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await page.getByLabel('Email address').fill('new-listener@example.test');

  const password = page.getByLabel('Password', { exact: true });
  await password.fill('Password123!');
  await expect(password).toHaveAttribute('type', 'password');
  await toggleEyeWithoutDrift(page, password, 'Show password', 'Hide password');

  const confirm = page.getByLabel('Confirm password');
  await confirm.fill('Password123!');
  await expect(confirm).toHaveAttribute('type', 'password');
  await toggleEyeWithoutDrift(page, confirm, 'Show confirmed password', 'Hide confirmed password');

  const agreement = page.getByRole('checkbox', { name: /I have read and agree to Echoo.*Privacy Policy/i });
  await expect(agreement).not.toBeChecked();
  const createAccount = page.getByRole('button', { name: 'Create account' });
  await expect(createAccount).toBeEnabled();
  await createAccount.click();
  await expect(page.getByText('Please agree to the Privacy Policy before creating your account.')).toBeVisible();
  await agreement.check();
  await expect(createAccount).toBeEnabled();
  await expect(page.getByText('Please agree to the Privacy Policy before creating your account.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Privacy Policy' }).click();
  await expect(page).toHaveURL(/\/privacy-policy$/);
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  await page.getByRole('link', { name: /Back to sign up/i }).click();
  await expect(page.getByRole('checkbox', { name: /I have read and agree to Echoo.*Privacy Policy/i })).toBeChecked();
  await expect(page.getByLabel('Username')).toHaveValue('new-listener');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('Password123!');
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  await assertSignupViewportBehavior(page);
  expect(browserErrors).toEqual([]);
});

test('signup card fits and stays centered in an Electron-sized desktop viewport', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop-1280');
  await page.setViewportSize({ width: 1365, height: 672 });
  await page.goto('/register');

  await assertAuthFitsViewport(page);
  const viewport = page.viewportSize();
  const card = await page.locator('.ear-auth-card').boundingBox();
  expect(card).not.toBeNull();
  expect(card.y).toBeGreaterThanOrEqual(0);
  expect(card.y + card.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(Math.abs((card.x + card.width / 2) - viewport.width / 2)).toBeLessThan(2);
  await expect(page.getByRole('button', { name: 'Create account' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Continue listening without an account' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'design-qa-evidence/auth-approved/auth-signup-short-1365x672.png' });
});

test('login card fits and stays centered in an Electron-sized desktop viewport', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop-1280');
  await page.setViewportSize({ width: 1365, height: 672 });
  await page.goto('/login');

  await assertAuthFitsViewport(page);
  const viewport = page.viewportSize();
  const card = await page.locator('.ear-auth-card').boundingBox();
  expect(card).not.toBeNull();
  expect(card.y).toBeGreaterThanOrEqual(0);
  expect(card.y + card.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(Math.abs((card.x + card.width / 2) - viewport.width / 2)).toBeLessThan(2);
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Sign up', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Continue listening without an account' })).toBeInViewport();
  await page.screenshot({ path: 'design-qa-evidence/auth-approved/auth-login-short-1365x672.png' });
});

test('login accepts both @username and email and exposes working recovery', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const loginPayloads = [];

  // The authentication flow should be deterministic when Google's font CDN is
  // unavailable; Echoo supplies local/system fallbacks for this test.
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '',
  }));

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
  await page.route('**/api/auth/forgot-password', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { message: 'Reset link sent' } }),
  }));

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  await expect(page.getByText('Welcome back, please log in to your account.')).toBeVisible();
  await expect(page.getByText('Continue with Google')).toHaveCount(0);
  await expect(page.getByLabel('Username or email')).toBeVisible();
  if (page.viewportSize().width <= 560) {
    await assertAuthFitsViewport(page);
    await page.screenshot({ path: `design-qa-evidence/auth-approved/auth-login-${test.info().project.name}.png` });
  }

  await page.getByLabel('Username or email').fill('@echo-listener');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await toggleEyeWithoutDrift(page, page.getByLabel('Password', { exact: true }), 'Show password', 'Hide password');
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  await expect(page).toHaveURL(/\/listen$/);
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
  expect(loginPayloads[0]).toEqual({ username: 'echo-listener', password: 'Password123!' });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('accessToken'))).toBe('listener-token');

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  await page.getByLabel('Username or email').fill('listener@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/listen$/);
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
  expect(loginPayloads[1]).toEqual({ username: 'listener@example.test', password: 'Password123!' });

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();

  await page.getByLabel('Email address').fill('bad-email');
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await page.getByLabel('Email address').fill('listener@example.test');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Reset link sent').first()).toBeVisible();
  await page.getByRole('button', { name: /Back to sign in/i }).click();
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

  await expect(page.getByRole('checkbox', { name: /Privacy Policy/i })).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
  await assertSignupViewportBehavior(page);
  expect(browserErrors).toEqual([]);
});

test('logged-out listeners can leave auth and return to public listening', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  await expect(page.getByText('Example: @okunlola or name@example.com')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue listening without an account' }).click();

  await expect(page).toHaveURL(/\/listen(?:\/)?$/);
  await expect(page).not.toHaveURL(/\/login/);
  await assertNoHorizontalOverflow(page);
  expect(browserErrors).toEqual([]);
});

test('signed-out visitors can enter public listening from sign up too', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Continue listening without an account' }).click();
  await expect(page).toHaveURL(/\/listen(?:\/)?$/);
  await expect(page).not.toHaveURL(/\/register/);
  await assertNoHorizontalOverflow(page);
});

test('reset-password completion uses the new design, both eye toggles and returns to sign in', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const resetPayloads = [];

  await page.route('**/api/auth/reset-password', async (route) => {
    resetPayloads.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { message: 'Password reset successfully. You can now sign in.' } }),
    });
  });

  await page.goto('/reset-password?token=reset-token', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();

  const password = page.getByRole('textbox', { name: 'New password', exact: true });
  const confirm = page.getByRole('textbox', { name: 'Confirm new password', exact: true });
  await password.fill('weak');
  await expect(page.getByText(/Use 8\+ characters/i)).toBeVisible();
  await password.fill('NewPassword123!');
  await confirm.fill('DifferentPassword123!');
  await expect(page.getByText('Passwords do not match.')).toBeVisible();
  await confirm.fill('NewPassword123!');

  await page.getByRole('button', { name: 'Show new password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide new password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show confirm new password' }).click();
  await expect(confirm).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide confirm new password' }).click();
  await expect(confirm).toHaveAttribute('type', 'password');

  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText(/Password reset successfully/i)).toBeVisible();
  expect(resetPayloads).toEqual([{ token: 'reset-token', password: 'NewPassword123!' }]);
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible({ timeout: 4_000 });
  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/reset-password', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('This reset link is invalid or incomplete.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update password' })).toBeDisabled();

  await assertNoHorizontalOverflow(page);
  expect(browserErrors).toEqual([]);
});
