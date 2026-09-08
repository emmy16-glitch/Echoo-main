import { test, expect } from 'playwright/test';

const makeUser = (overrides = {}) => ({
  id: '507f1f77bcf86cd799439090',
  _id: '507f1f77bcf86cd799439090',
  username: 'journey-user',
  displayName: 'Journey User',
  email: 'journey@example.test',
  userType: 'listener',
  roles: ['listener'],
  onboardingCompleted: false,
  profileCompleted: false,
  creatorProfile: {},
  ...overrides,
});

const fulfill = (route, status, body) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const bodyOf = (route) => {
  try {
    return JSON.parse(route.request().postData() || '{}');
  } catch {
    return {};
  }
};

test('account journey: signup -> profile -> Listener -> Channel setup -> Creator Studio -> Listener -> sign out', async ({ page }) => {
  let currentUser = makeUser();
  let channels = [];
  const createdChannel = {
    id: '507f1f77bcf86cd799439091',
    _id: '507f1f77bcf86cd799439091',
    slug: 'journey-channel',
    name: 'Journey Channel',
    description: 'A real Channel created by the full Echoo browser journey.',
    category: 'Technology',
    isPublic: true,
    isLive: false,
    listenerCount: 0,
    followerCount: 0,
    owner: {
      id: currentUser.id,
      _id: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName,
    },
  };

  await page.route('**/api/auth/register', async (route) => {
    const payload = bodyOf(route);
    currentUser = makeUser({
      username: payload.username,
      email: payload.email,
      displayName: payload.displayName,
    });
    return fulfill(route, 201, {
      data: {
        user: currentUser,
        accessToken: 'journey-token',
        refreshToken: 'journey-refresh-token',
      },
    });
  });

  await page.route('**/api/onboarding/profile-setup', async (route) => {
    const payload = bodyOf(route);
    currentUser = {
      ...currentUser,
      displayName: payload.displayName,
      bio: payload.bio || '',
      avatar: payload.avatar || null,
      profileCompleted: true,
      onboardingCompleted: true,
    };
    return fulfill(route, 200, { data: { user: currentUser, onboardingCompleted: true } });
  });

  await page.route('**/api/auth/me', (route) => fulfill(route, 200, { data: { user: currentUser } }));

  await page.route('**/api/onboarding/activate-creator', (route) => {
    currentUser = {
      ...currentUser,
      userType: 'creator',
      roles: ['listener', 'creator'],
      onboardingCompleted: false,
      creatorProfile: {},
    };
    return fulfill(route, 200, { data: { user: currentUser, nextStep: 'creator-type-selection' } });
  });

  await page.route('**/api/onboarding/choose-creator-type', async (route) => {
    const payload = bodyOf(route);
    currentUser = {
      ...currentUser,
      creatorProfile: {
        ...currentUser.creatorProfile,
        creatorType: payload.creatorType,
        artistName: payload.artistName || '',
        organizationName: payload.organizationName || '',
        organizationType: payload.organizationType || '',
      },
    };
    return fulfill(route, 200, { data: { user: currentUser, nextStep: 'content-info' } });
  });

  await page.route('**/api/onboarding/content-info', async (route) => {
    const payload = bodyOf(route);
    currentUser = {
      ...currentUser,
      creatorProfile: {
        ...currentUser.creatorProfile,
        category: payload.category,
        contentDescription: payload.contentDescription || '',
      },
    };
    return fulfill(route, 200, { data: { user: currentUser, nextStep: 'complete' } });
  });

  await page.route('**/api/onboarding/complete', (route) => {
    currentUser = {
      ...currentUser,
      onboardingCompleted: true,
      creatorProfile: {
        ...currentUser.creatorProfile,
        isApproved: true,
      },
    };
    return fulfill(route, 200, { data: { user: currentUser, redirect: '/studio/dashboard' } });
  });

  await page.route('**/api/stations/mine/all', (route) => fulfill(route, 200, { data: channels }));
  await page.route('**/api/stations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    channels = [{
      ...createdChannel,
      owner: {
        id: currentUser.id,
        _id: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.displayName,
      },
    }];
    return fulfill(route, 201, { data: channels[0] });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Create your Echoo account' })).toBeVisible();

  await page.getByLabel('Full name').fill('Journey User');
  await page.getByLabel('Username').fill('journey-user');
  await page.getByLabel('Email address').fill('journey@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByLabel('Confirm password').fill('Password123!');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Set up your profile' })).toBeVisible();
  await page.getByLabel('Display name').fill('Journey User');
  await page.getByLabel(/Short bio/i).fill('Testing the entire Echoo account and Channel flow.');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/listen$/);
  await expect(page.getByRole('button', { name: 'Create your Channel' })).toBeVisible();
  await page.getByRole('button', { name: 'Create your Channel' }).click();

  await expect(page.getByRole('heading', { name: 'Set up your Channel' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Individual/i })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Organization/i }).click();
  await expect(page.getByLabel('Organization type')).toBeVisible();
  await page.getByRole('button', { name: /Individual/i }).click();
  await expect(page.getByLabel('Organization type')).toHaveCount(0);

  await page.getByLabel('Channel name').fill('Journey Channel');
  await page.getByLabel('Category').selectOption('Technology');
  await page.getByLabel('Description').fill('A real Channel created by the full Echoo browser journey.');
  await page.getByRole('button', { name: 'Set up Channel' }).click();

  await expect(page).toHaveURL(/\/creator-studio$/);
  await expect(page.getByRole('button', { name: 'Broadcast' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Channel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recordings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collections' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Schedule Events' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Analytics' })).toBeVisible();

  await page.getByRole('button', { name: 'Channel' }).click();
  await expect(page).toHaveURL(/\/creator-studio\/channels$/);
  await expect(page.getByRole('heading', { name: 'Channel', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Journey Channel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Channel' })).toBeVisible();

  await page.getByRole('tab', { name: 'Listener' }).click();
  await expect(page).toHaveURL(/\/listen$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('accessToken'))).toBe('journey-token');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('echooActiveExperience'))).toBe('listener');

  await page.getByRole('tab', { name: 'Creator' }).click();
  await expect(page).toHaveURL(/\/creator-studio$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('accessToken'))).toBe('journey-token');

  await page.getByRole('tab', { name: 'Listener' }).click();
  await expect(page).toHaveURL(/\/listen$/);
  await page.getByRole('button', { name: 'Open listener account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Create your Echoo account' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken'),
    user: localStorage.getItem('user'),
    experience: localStorage.getItem('echooActiveExperience'),
  }))).toEqual({ accessToken: null, refreshToken: null, user: null, experience: null });
});
