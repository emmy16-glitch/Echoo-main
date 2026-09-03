import { test, expect } from 'playwright/test';

const pendingListener = {
  id: '507f1f77bcf86cd799439012',
  _id: '507f1f77bcf86cd799439012',
  username: 'new-listener',
  displayName: 'new-listener',
  email: 'new-listener@example.test',
  userType: 'listener',
  roles: ['listener'],
  emailVerified: false,
  onboardingCompleted: false,
  profileCompleted: false,
};

const verifiedListener = {
  ...pendingListener,
  emailVerified: true,
};

const completeListener = {
  ...verifiedListener,
  displayName: 'New Echoo Listener',
  onboardingCompleted: true,
  profileCompleted: true,
};

const fulfill = (route, payload, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(payload),
});

const enterVerificationCode = async (page, code = '123456') => {
  for (let index = 0; index < code.length; index += 1) {
    await page.getByLabel(`Verification digit ${index + 1}`).fill(code[index]);
  }
};

test('new signup verifies email, completes Profile and lands in Listener with no role choice', async ({ page }) => {
  await page.route('**/api/auth/register', (route) => fulfill(route, {
    data: {
      user: pendingListener,
      verificationRequired: true,
      verification: {
        userId: pendingListener.id,
        email: pendingListener.email,
        expiresInSeconds: 600,
      },
    },
  }, 201));

  await page.route('**/api/auth/verify-email', (route) => fulfill(route, {
    data: {
      user: verifiedListener,
      accessToken: 'verified-listener-token',
      refreshToken: 'verified-listener-refresh-token',
      verificationRequired: false,
    },
  }));

  await page.route('**/api/onboarding/profile-setup', (route) => fulfill(route, {
    data: {
      user: completeListener,
      onboardingCompleted: true,
      redirect: '/listen',
    },
  }));

  await page.goto('/');

  await page.getByLabel('Username', { exact: true }).fill(pendingListener.username);
  await page.getByLabel('Email address').fill(pendingListener.email);
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByLabel('Confirm password').fill('Password123!');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  await expect(page.getByText(pendingListener.email)).toBeVisible();
  await expect(page.getByText('Creator / Listener')).toHaveCount(0);

  await enterVerificationCode(page);
  await page.getByRole('button', { name: 'Verify' }).click();

  await expect(page.getByRole('heading', { name: 'Set up your profile' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    token: localStorage.getItem('accessToken'),
    user: JSON.parse(localStorage.getItem('user') || '{}'),
  }))).toMatchObject({
    token: 'verified-listener-token',
    user: { id: pendingListener.id, username: pendingListener.username, emailVerified: true },
  });

  await page.getByLabel('Display name').fill(completeListener.displayName);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/listen$/, { timeout: 10_000 });
  await expect(page.getByText(/Choose how you'll use Echoo/i)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => ({
    experience: localStorage.getItem('echooActiveExperience'),
    role: localStorage.getItem('echooRole'),
    user: JSON.parse(localStorage.getItem('user') || '{}'),
  }))).toMatchObject({
    experience: 'listener',
    role: null,
    user: {
      id: pendingListener.id,
      onboardingCompleted: true,
      profileCompleted: true,
    },
  });
});

test('signup explains when an email is already registered without corrupting auth state', async ({ page }) => {
  await page.route('**/api/auth/register', (route) => fulfill(route, {
    error: { code: 'EMAIL_EXISTS', message: 'Email already registered' },
  }, 409));

  await page.goto('/');

  await page.getByLabel('Username', { exact: true }).fill('existing-listener');
  await page.getByLabel('Email address').fill('existing@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByLabel('Confirm password').fill('Password123!');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('Email already registered', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    token: localStorage.getItem('accessToken'),
    user: localStorage.getItem('user'),
  }))).toEqual({ token: null, user: null });
});
