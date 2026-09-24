import { test, expect } from 'playwright/test';

const PARTIAL_CREATOR = {
  id: '507f1f77bcf86cd799439081',
  _id: '507f1f77bcf86cd799439081',
  username: 'partial.creator',
  displayName: 'Partial Creator',
  email: 'partial@example.test',
  userType: 'creator',
  roles: ['listener', 'creator'],
  profileCompleted: true,
  onboardingCompleted: false,
  creatorProfile: {},
};

const READY_CREATOR = {
  ...PARTIAL_CREATOR,
  onboardingCompleted: true,
  creatorProfile: {
    creatorType: 'individual',
    artistName: 'Partial Creator',
    category: 'Technology',
    contentDescription: 'A current Echoo Channel used for lifecycle QA.',
  },
};

const EXISTING_CHANNEL = {
  id: '507f1f77bcf86cd799439091',
  _id: '507f1f77bcf86cd799439091',
  name: 'Recovered Channel',
  category: 'Technology',
  description: 'Existing canonical Channel returned after a create race.',
  isPublic: true,
  owner: READY_CREATOR,
};

const seedSession = async (page, user, activeExperience = 'listener') => {
  await page.addInitScript(({ nextUser, nextExperience }) => {
    // Re-runs on every navigation/reload: only seed a fresh browser so
    // reload-persistence and sign-out assertions observe real app state.
    // Auth routes never need a seed (expired sessions must reach sign-in).
    try {
      if (localStorage.getItem('echooE2EDisableSeed')) return;
      if (/^\/(login|register|reset-password)/.test(window.location.pathname)) return;
      if (localStorage.getItem('accessToken') || localStorage.getItem('user')) return;
    } catch {
      return;
    }
    localStorage.setItem('accessToken', 'deep-access-token');
    localStorage.setItem('token', 'deep-access-token');
    localStorage.setItem('refreshToken', 'deep-refresh-token');
    localStorage.setItem('user', JSON.stringify(nextUser));
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooActiveExperience', nextExperience);
    if (nextUser.onboardingCompleted) {
      localStorage.setItem('echooOnboardingCompleted', 'true');
    }
  }, { nextUser: user, nextExperience: activeExperience });
};

const json = async (route, status, body) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const data = (value) => ({ data: value, timestamp: new Date().toISOString() });

const browserErrors = (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    const text = message.text();
    if (
      message.type() === 'error' &&
      !text.includes('/socket.io/') &&
      !text.includes('ERR_BLOCKED_BY_ORB') &&
      // The race test deliberately answers the create call with a 409 the
      // app recovers from; the browser still logs the failed resource.
      !text.includes('409 (Conflict)')
    ) errors.push(text);
  });
  return errors;
};

test('leaving interrupted Channel setup persists Listener mode across reload', async ({ page }) => {
  const errors = browserErrors(page);
  await seedSession(page, PARTIAL_CREATOR, 'creator');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Create your Channel' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to Listener' }).click();
  await expect(page).toHaveURL(/\/listen$/);
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('echooActiveExperience'))).toBe('listener');
  // Let the Listener shell's initial deterministic API requests settle before
  // intentionally reloading. WebKit otherwise reports the aborted requests as
  // access-control failures even though the page and CORS contract are valid.
  await page.waitForLoadState('networkidle');

  await page.reload();
  await expect(page).toHaveURL(/\/listen$/);
  await expect(page.getByRole('button', { name: 'Finish Channel setup' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('partial Creator cannot bypass Channel setup with a direct Studio URL', async ({ page }) => {
  const errors = browserErrors(page);
  await seedSession(page, PARTIAL_CREATOR, 'creator');

  await page.goto('/creator-studio/channels');
  await expect(page).toHaveURL(/\/creator-studio\/channels$/);
  await expect(page.getByRole('heading', { name: 'Create your Channel' })).toBeVisible();
  await expect(page.getByText('Set up the identity listeners will see when you broadcast. You can change these details later in Creator Studio.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('failed token refresh ejects the user from protected UI and clears the session', async ({ page }) => {
  await seedSession(page, {
    ...PARTIAL_CREATOR,
    userType: 'listener',
    roles: ['listener'],
    onboardingCompleted: true,
  }, 'listener');

  await page.route('**/api/listener/dashboard**', (route) => json(route, 401, {
    error: { code: 'SESSION_EXPIRED', message: 'Access token expired.' },
  }));
  await page.route('**/api/auth/refresh', (route) => json(route, 401, {
    error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token expired.' },
  }));

  await page.goto('/listen');
  await expect(page).toHaveURL(/\/login\?reason=session-expired$/);
  await expect(page.getByRole('heading', { name: 'Echoo your sound' })).toBeVisible();

  const state = await page.evaluate(() => ({
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken'),
    user: localStorage.getItem('user'),
    activeExperience: localStorage.getItem('echooActiveExperience'),
  }));
  expect(state).toEqual({
    accessToken: null,
    refreshToken: null,
    user: null,
    activeExperience: null,
  });
});

test('Channel creation race recovers the existing canonical Channel instead of trapping setup', async ({ page }) => {
  const errors = browserErrors(page);
  await seedSession(page, PARTIAL_CREATOR, 'creator');

  let mineReads = 0;
  let createAttempts = 0;

  await page.route('**/api/stations/mine/all', async (route) => {
    mineReads += 1;
    const stations = mineReads === 1 ? [] : [EXISTING_CHANNEL];
    await json(route, 200, data({
      stations,
      pagination: { page: 1, limit: 100, total: stations.length, pages: 1, hasMore: false },
    }));
  });
  await page.route('**/api/stations', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    createAttempts += 1;
    await json(route, 409, {
      error: {
        code: 'CHANNEL_ALREADY_EXISTS',
        message: 'This Creator already has a Channel.',
      },
    });
  });
  await page.route('**/api/onboarding/choose-creator-type', (route) => json(route, 200, data({
    user: {
      ...PARTIAL_CREATOR,
      creatorProfile: { creatorType: 'individual', artistName: 'Partial Creator' },
    },
  })));
  await page.route('**/api/onboarding/content-info', (route) => json(route, 200, data({
    user: {
      ...PARTIAL_CREATOR,
      creatorProfile: {
        creatorType: 'individual',
        artistName: 'Partial Creator',
        category: 'Technology',
        contentDescription: 'Lifecycle QA Channel.',
      },
    },
  })));
  await page.route('**/api/onboarding/complete', (route) => json(route, 200, data({ user: READY_CREATOR })));

  await page.goto('/');
  await page.getByLabel('Channel name').fill('Lifecycle QA Channel');
  await page.getByLabel('Category').selectOption('Technology');
  await page.getByLabel('Description').fill('Lifecycle QA Channel.');
  await page.getByRole('button', { name: 'Create Channel' }).click();

  await expect(page).toHaveURL(/\/creator-studio(?:\/broadcast)?$/);
  await expect(page.getByRole('button', { name: 'Channel', exact: true })).toBeVisible();
  expect(createAttempts).toBe(1);
  expect(mineReads).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('sign out plus browser Back cannot resurrect Listener or Creator protected UI', async ({ page }) => {
  const errors = browserErrors(page);
  await seedSession(page, READY_CREATOR, 'listener');

  await page.route('**/api/auth/logout', (route) => json(route, 200, data({ message: 'Logged out successfully' })));
  await page.route('**/api/auth/me', (route) => json(route, 200, data({ user: READY_CREATOR })));

  await page.goto('/listen');
  await page.getByRole('button', { name: 'Open listener account menu' }).click();
  await page.getByRole('menuitem', { name: /Sign out/i }).click();

  // Signed-out browsers land on public guest discovery, never an auth wall.
  await expect(page).toHaveURL(/\/listen$/);
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('accessToken'))).toBe(null);
  await page.evaluate(() => localStorage.setItem('echooE2EDisableSeed', '1'));

  await page.goBack();
  // History before sign-in is empty (fresh browser): Back leaves Listener
  // discovery or a blank entry — never an authenticated shell.
  await expect.poll(() => page.evaluate(() => window.location.pathname)).not.toBe('/creator-studio');
  await page.goForward().catch(() => {});
  await page.goto('/listen');
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
  await expect(page.locator('.studio-final-shell')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('accessToken'))).toBe(null);
  expect(errors).toEqual([]);
});
