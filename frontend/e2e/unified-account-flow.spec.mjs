import { expect, test } from 'playwright/test';

const accountId = '507f1f77bcf86cd799439012';

const listenerAccount = {
  id: accountId,
  _id: accountId,
  username: 'newlistener',
  displayName: 'New Listener',
  email: 'newlistener@example.test',
  userType: 'listener',
  roles: ['listener'],
  onboardingCompleted: true,
  profileCompleted: true,
};

const activatedCreator = {
  ...listenerAccount,
  userType: 'creator',
  roles: ['listener', 'creator'],
  creatorProfile: {
    isApproved: false,
  },
};

const fulfill = (route, payload, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(payload),
});

const noHorizontalOverflow = async (page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
};

const seedListenerSession = async (page, user = listenerAccount) => {
  await page.addInitScript((seedUser) => {
    localStorage.setItem('accessToken', 'listener-token');
    localStorage.setItem('token', 'listener-token');
    localStorage.setItem('refreshToken', 'listener-refresh-token');
    localStorage.setItem('user', JSON.stringify(seedUser));
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooActiveExperience', 'listener');
    localStorage.removeItem('echooRole');
  }, user);
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
  await expect.poll(() => page.evaluate(() => localStorage.getItem('echooRole'))).toBeNull();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}')))
    .toMatchObject({ username: 'newlistener', onboardingCompleted: true, profileCompleted: true });
  await noHorizontalOverflow(page);
});

test('Listener can start Channel setup in the same account and return without another login', async ({ page }) => {
  await seedListenerSession(page);

  await page.route('**/api/auth/me', (route) => fulfill(route, {
    data: { user: listenerAccount },
  }));

  await page.route('**/api/onboarding/activate-creator', (route) => fulfill(route, {
    data: {
      user: activatedCreator,
      capabilities: { listener: true, creator: true },
      creatorSetupCompleted: false,
      nextStep: 'creator-type-selection',
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
  await noHorizontalOverflow(page);
});

test('one Listener account can create its Channel, enter Creator Studio, switch both ways, sign out and log back in', async ({ page }) => {
  await seedListenerSession(page);

  let currentUser = { ...listenerAccount };
  let createdStation = null;
  let stationCreateBody = '';

  await page.route('**/api/auth/me', (route) => fulfill(route, {
    data: { user: currentUser },
  }));

  await page.route('**/api/auth/login', (route) => fulfill(route, {
    data: {
      user: currentUser,
      accessToken: 'returning-account-token',
      refreshToken: 'returning-account-refresh',
    },
  }));

  await page.route('**/api/onboarding/activate-creator', (route) => {
    currentUser = {
      ...activatedCreator,
      creatorProfile: { isApproved: false },
    };
    return fulfill(route, {
      data: {
        user: currentUser,
        capabilities: { listener: true, creator: true },
        creatorSetupCompleted: false,
        nextStep: 'creator-type-selection',
      },
    });
  });

  await page.route('**/api/onboarding/choose-creator-type', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    expect(payload.creatorType).toBe('individual');
    expect(payload.artistName).toBe(listenerAccount.displayName);
    currentUser = {
      ...currentUser,
      creatorProfile: {
        ...currentUser.creatorProfile,
        creatorType: 'individual',
        artistName: payload.artistName,
        isApproved: false,
      },
    };
    return fulfill(route, { data: { user: currentUser, nextStep: 'content-info' } });
  });

  await page.route('**/api/onboarding/content-info', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    expect(payload.category).toBe('Technology');
    currentUser = {
      ...currentUser,
      creatorProfile: {
        ...currentUser.creatorProfile,
        category: payload.category,
        contentDescription: payload.contentDescription,
        isApproved: false,
      },
    };
    return fulfill(route, { data: { user: currentUser, nextStep: 'complete' } });
  });

  await page.route('**/api/stations/mine/all**', (route) => fulfill(route, {
    data: createdStation ? [createdStation] : [],
  }));

  await page.route('**/api/stations', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    stationCreateBody = route.request().postData() || '';
    createdStation = {
      id: '507f1f77bcf86cd799439099',
      _id: '507f1f77bcf86cd799439099',
      slug: 'new-listener-live',
      name: 'New Listener Live',
      description: 'Live technology conversations for the Echoo community.',
      category: 'Technology',
      isPublic: true,
      isLive: false,
      listenerCount: 0,
      followerCount: 0,
      branding: { mode: 'generated', variant: 0, version: 1 },
      owner: currentUser,
      updatedAt: new Date().toISOString(),
    };
    return fulfill(route, { data: createdStation }, 201);
  });

  await page.route('**/api/onboarding/complete', (route) => {
    currentUser = {
      ...currentUser,
      onboardingCompleted: true,
      profileCompleted: true,
      onboardingStep: 4,
      creatorProfile: {
        ...currentUser.creatorProfile,
        isApproved: true,
      },
    };
    return fulfill(route, {
      data: {
        user: currentUser,
        capabilities: { listener: true, creator: true },
        creatorSetupCompleted: true,
        redirect: '/creator-studio',
      },
    });
  });

  await page.goto('/listen');
  await expect(page.getByRole('button', { name: 'Create your Channel' })).toBeVisible();
  await page.getByRole('button', { name: 'Create your Channel' }).click();

  await expect(page.getByRole('heading', { name: /How will you create/i })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.getByRole('radio', { name: /Individual/i }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page.getByRole('heading', { name: /Set up your Channel/i })).toBeVisible();
  await page.getByLabel('Channel name').fill('New Listener Live');
  await page.getByLabel('Category').selectOption('Technology');
  await page.getByLabel('What will you create?').fill('Live technology conversations for the Echoo community.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page.getByRole('heading', { name: /Almost ready/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel('Your public Channel preview')).toContainText('New Listener Live');
  expect(stationCreateBody).toContain('New Listener Live');
  await noHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Open Creator Studio' }).click();
  await expect(page).toHaveURL(/\/creator-studio$/, { timeout: 10_000 });
  await expect(page.getByRole('tab', { name: 'Creator' })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => page.evaluate(() => ({
    token: localStorage.getItem('accessToken'),
    experience: localStorage.getItem('echooActiveExperience'),
    user: JSON.parse(localStorage.getItem('user') || '{}'),
    legacyRole: localStorage.getItem('echooRole'),
  }))).toMatchObject({
    token: 'listener-token',
    experience: 'creator',
    user: { id: accountId, roles: ['listener', 'creator'], creatorProfile: { isApproved: true } },
    legacyRole: null,
  });
  await noHorizontalOverflow(page);

  await page.getByRole('tab', { name: 'Listener' }).click();
  await expect(page).toHaveURL(/\/listen$/, { timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('echooActiveExperience'))).toBe('listener');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}').id)).toBe(accountId);

  await page.getByRole('tab', { name: 'Creator' }).click();
  await expect(page).toHaveURL(/\/creator-studio$/, { timeout: 10_000 });
  await expect(page.getByRole('heading', { name: /How will you create/i })).toHaveCount(0);

  await page.getByRole('button', { name: 'Open creator account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Sign up' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('accessToken'))).toBeNull();

  await page.goto('/creator-studio');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Sign up' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Username or email').fill(listenerAccount.email);
  await page.getByLabel('Password', { exact: true }).fill('StrongPass1!');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page).toHaveURL(/\/listen$/, { timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => ({
    token: localStorage.getItem('accessToken'),
    experience: localStorage.getItem('echooActiveExperience'),
    userId: JSON.parse(localStorage.getItem('user') || '{}').id,
  }))).toEqual({
    token: 'returning-account-token',
    experience: 'listener',
    userId: accountId,
  });

  await page.getByRole('tab', { name: 'Creator' }).click();
  await expect(page).toHaveURL(/\/creator-studio$/, { timeout: 10_000 });
  await expect(page.getByRole('heading', { name: /How will you create/i })).toHaveCount(0);
  await noHorizontalOverflow(page);
});

test('protected Listener and Creator routes reject unauthenticated browsers', async ({ page }) => {
  await page.goto('/listen');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Sign up' })).toBeVisible();

  await page.goto('/creator-studio');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Sign up' })).toBeVisible();
});
