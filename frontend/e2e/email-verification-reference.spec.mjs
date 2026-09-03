import { expect, test } from 'playwright/test';

const screenshotDir = 'e2e/screenshots/email-verification';

const capture = async (page, testInfo, state) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({
    path: `${screenshotDir}/${testInfo.project.name}-${state}.png`,
    fullPage: true,
    timeout: 30_000,
  });
};

test('signup verification empty, half-filled and filled states match the Echoo Figma flow', async ({ page }, testInfo) => {
  const pendingUser = {
    id: '507f1f77bcf86cd799439091',
    _id: '507f1f77bcf86cd799439091',
    username: 'verifiedlistener',
    displayName: 'verifiedlistener',
    email: 'verified@example.test',
    userType: 'listener',
    roles: ['listener'],
    emailVerified: false,
    onboardingCompleted: false,
    profileCompleted: false,
  };

  await page.route('**/api/auth/register', async (route) => {
    await route.fulfill({
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
    });
  });

  await page.route('**/api/auth/verify-email', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.code !== '123456') {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INVALID_VERIFICATION_CODE', message: 'That verification code is not correct. Please try again.' } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          user: { ...pendingUser, emailVerified: true },
          accessToken: 'verified-listener-token',
          refreshToken: 'verified-listener-refresh-token',
          verificationRequired: false,
        },
      }),
    });
  });

  await page.route('**/api/auth/resend-verification', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          message: 'A new verification code has been sent to your email.',
          verificationRequired: true,
          verification: {
            userId: pendingUser.id,
            email: pendingUser.email,
            expiresInSeconds: 600,
          },
        },
      }),
    });
  });

  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill('verifiedlistener');
  await page.getByLabel('Email address').fill('verified@example.test');
  await page.getByLabel('Password', { exact: true }).fill('StrongPass1!');
  await page.getByLabel('Confirm password').fill('StrongPass1!');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  await expect(page.getByText('verified@example.test')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify' })).toBeDisabled();
  await expect(page.locator('.ear-code-box')).toHaveCount(6);
  await capture(page, testInfo, 'verify-empty');

  for (let index = 0; index < 3; index += 1) {
    await page.getByLabel(`Verification digit ${index + 1}`).fill(String(index + 1));
  }
  await expect(page.getByRole('button', { name: 'Verify' })).toBeDisabled();
  await capture(page, testInfo, 'verify-half-filled');

  for (let index = 3; index < 6; index += 1) {
    await page.getByLabel(`Verification digit ${index + 1}`).fill(String(index + 1));
  }
  await expect(page.getByRole('button', { name: 'Verify' })).toBeEnabled();
  await capture(page, testInfo, 'verify-filled');

  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { name: 'Set up your profile' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('accessToken'))).toBe('verified-listener-token');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('echooActiveExperience'))).toBe('listener');
});
