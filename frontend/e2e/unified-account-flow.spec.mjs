import { expect, test } from 'playwright/test';

const activatedCreator = {
  id: '507f1f77bcf86cd799439012',
  _id: '507f1f77bcf86cd799439012',
  username: 'newlistener',
  displayName: 'New Listener',
  email: 'newlistener@example.test',
  userType: 'creator',
  roles: ['listener', 'creator'],
  onboardingCompleted: true,
  profileCompleted: true,
  creatorProfile: {
    isApproved: false,
  },
};

test('new Echoo signup becomes Listener without any role-choice screen', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Username', { exact: true }).fill('newlistener');
  await page.getByLabel('Email address').fill('newlistener@example.test');
  await page.getByLabel('Password', { exact: true }).fill('StrongPass1!');
  await page.getByLabel('Confirm password').fill('StrongPass1!');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('Creator / Listener')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Set up your profile' })).toBeVisible({ timeout: 5_000 });

  await expect(page.getByText('Account').first()).toBeVisible();
  await expect(page.getByText('Profile').first()).toBeVisible();
  await expect(page.getByText('Role')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/listen$/, { timeout: 8_000 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('echooActiveExperience'))).toBe('listener');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}')))
    .toMatchObject({ username: 'newlistener', onboardingCompleted: true, profileCompleted: true });
});

test('Listener can start Channel setup in the same account and return without another login', async ({ page }) => {
  await page.addInitScript(() => {
    const listener = {
      id: '507f1f77bcf86cd799439012',
      _id: '507f1f77bcf86cd799439012',
      username: 'newlistener',
      displayName: 'New Listener',
      email: 'newlistener@example.test',
      userType: 'listener',
      roles: ['listener'],
      onboardingCompleted: true,
      profileCompleted: true,
    };
    localStorage.setItem('accessToken', 'listener-token');
    localStorage.setItem('token', 'listener-token');
    localStorage.setItem('refreshToken', 'listener-refresh-token');
    localStorage.setItem('user', JSON.stringify(listener));
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooActiveExperience', 'listener');
  });

  await page.route('**/api/auth/me', (route) => route.fulfill({
    json: {
      data: {
        user: {
          ...activatedCreator,
          userType: 'listener',
          roles: ['listener'],
          creatorProfile: undefined,
        },
      },
    },
  }));

  await page.route('**/api/onboarding/activate-creator', (route) => route.fulfill({
    json: {
      data: {
        user: activatedCreator,
        capabilities: { listener: true, creator: true },
        creatorSetupCompleted: false,
        nextStep: 'creator-type-selection',
      },
    },
  }));

  await page.goto('/listen');
  await expect(page.getByRole('button', { name: 'Create your Channel' })).toBeVisible();
  await page.getByRole('button', { name: 'Create your Channel' }).click();

  await expect(page).toHaveURL(/experience=creator/);
  await expect(page.getByRole('heading', { name: /How will you create/i })).toBeVisible();
  await expect(page.getByText('Individual')).toBeVisible();
  await expect(page.getByText('Organization / Brand')).toBeVisible();

  const identityDuringSetup = await page.evaluate(() => ({
    token: localStorage.getItem('accessToken'),
    user: JSON.parse(localStorage.getItem('user') || '{}'),
    experience: localStorage.getItem('echooActiveExperience'),
  }));
  expect(identityDuringSetup.token).toBe('listener-token');
  expect(identityDuringSetup.user.id).toBe(activatedCreator.id);
  expect(identityDuringSetup.user.roles).toEqual(['listener', 'creator']);
  expect(identityDuringSetup.experience).toBe('creator');

  await page.getByRole('button', { name: 'Back to Listener' }).click();
  await expect(page).toHaveURL(/\/listen$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('accessToken'))).toBe('listener-token');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('echooActiveExperience'))).toBe('listener');
});
