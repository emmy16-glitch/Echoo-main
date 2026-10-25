import { expect, test } from 'playwright/test';

const CREATOR_ID = '507f1f77bcf86cd799439011';
const LISTENER_ID = '507f1f77bcf86cd799439012';
const STATION_ID = '507f1f77bcf86cd799439021';
const BROADCAST_ID = '507f1f77bcf86cd799439031';
const STATION_SLUG = 'echoo-e2e-station';

const creator = {
  id: CREATOR_ID,
  username: 'echoocreator',
  displayName: 'Echoo Creator',
  userType: 'creator',
  roles: ['listener', 'creator'],
  onboardingCompleted: true,
  profileCompleted: true,
  creatorProfile: {
    creatorType: 'individual',
    category: 'Education',
    artistName: 'Echoo Creator',
    isApproved: true,
  },
};

const listener = {
  id: LISTENER_ID,
  username: 'echolistener',
  displayName: 'Echoo Listener',
  userType: 'listener',
  roles: ['listener'],
  onboardingCompleted: true,
  profileCompleted: true,
};

const station = {
  id: STATION_ID,
  _id: STATION_ID,
  slug: STATION_SLUG,
  name: 'Layers of Truth',
  description: 'Talk · Teach · Transform',
  category: 'Education',
  isPublic: true,
  isLive: true,
  owner: creator,
};

const liveBroadcast = {
  id: BROADCAST_ID,
  _id: BROADCAST_ID,
  title: 'Layers of Truth Live',
  status: 'live',
  isPublic: true,
  station,
  stationId: STATION_ID,
  creator,
  mediaState: 'audio_live',
  startTime: new Date(Date.now() - 60_000).toISOString(),
};

const authenticate = async (page, user) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({
    json: { data: { user } },
  }));
  await page.addInitScript(({ nextUser }) => {
    localStorage.setItem('accessToken', `${nextUser.userType}-token`);
    localStorage.setItem('token', `${nextUser.userType}-token`);
    localStorage.setItem('refreshToken', `${nextUser.userType}-refresh-token`);
    localStorage.setItem('user', JSON.stringify(nextUser));
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooActiveExperience', nextUser.userType === 'creator' ? 'creator' : 'listener');
    localStorage.removeItem('echooRole');
    if (nextUser.userType === 'creator') {
      localStorage.setItem('creatorSetup', JSON.stringify({
        type: 'individual',
        name: nextUser.displayName,
      }));
    }
  }, { nextUser: user });
};

test('LIVE controls copy the permanent live URL and survive refresh', async ({ page }) => {
  await authenticate(page, creator);
  await page.addInitScript(() => {
    window.__copiedText = '';
    window.__sharePayload = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value) => { window.__copiedText = value; } },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (payload) => { window.__sharePayload = payload; },
    });
  });

  await page.route('**/api/stations/mine/all', (route) => route.fulfill({
    json: { data: { stations: [station] } },
  }));
  await page.route('**/api/broadcasts/mine/all', (route) => route.fulfill({
    json: { data: [liveBroadcast] },
  }));

  await page.goto('/creator-studio');
  await expect(page.getByRole('button', { name: 'Copy live link' })).toBeVisible();

  const expectedUrl = `${new URL(page.url()).origin}/listen/stations/${STATION_SLUG}`;
  await page.getByRole('button', { name: 'Copy live link' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__copiedText)).toBe(expectedUrl);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Copy live link' })).toBeVisible();

  await page.evaluate(() => { window.__copiedText = ''; });
  await page.getByRole('button', { name: 'Copy live link' }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedText)).toBe(expectedUrl);
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
});

test('a stale LIVE page offers publisher recovery and explains how to restore browser audio', async ({ page }) => {
  await authenticate(page, creator);
  await page.route('**/api/stations/mine/all', (route) => route.fulfill({
    json: { data: { stations: [station] } },
  }));
  await page.route('**/api/broadcasts/mine/all', (route) => route.fulfill({
    json: { data: [liveBroadcast] },
  }));

  await page.goto('/creator-studio');
  const reconnect = page.getByRole('button', { name: 'Reconnect live audio' });
  await expect(reconnect).toBeVisible();
  await reconnect.click();
  await expect(page.getByRole('alert')).toContainText(
    'Use Add audio to share the browser tab again, then choose Reconnect live audio.'
  );
});

test('OFF AIR hides sharing controls and keeps the existing Go Live action', async ({ page }) => {
  await authenticate(page, creator);
  await page.route('**/api/stations/mine/all', (route) => route.fulfill({
    json: { data: { stations: [{ ...station, isLive: false }] } },
  }));
  await page.route('**/api/broadcasts/mine/all', (route) => route.fulfill({
    json: { data: [{ ...liveBroadcast, status: 'completed' }] },
  }));

  await page.goto('/creator-studio');
  await expect(page.getByRole('button', { name: 'Go Live' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy live link' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);
});

test('the slug listener URL resolves live state through the canonical station ID', async ({ page }) => {
  await authenticate(page, listener);
  const requests = [];
  let currentLiveBroadcast = liveBroadcast;
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));

  await page.route(`**/api/stations/${STATION_SLUG}`, (route) => route.fulfill({
    json: { data: station },
  }));
  await page.route(`**/api/broadcasts/station/${STATION_ID}/live`, (route) => route.fulfill({
    json: { data: currentLiveBroadcast },
  }));

  await page.goto(`/listen/stations/${STATION_SLUG}`);
  await expect(page.getByRole('heading', { name: station.name })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Listen Live' })).toBeVisible();
  expect(requests).toContain(`/api/broadcasts/station/${STATION_ID}/live`);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Listen Live' })).toBeVisible();

  currentLiveBroadcast = null;
  await page.reload();
  await expect(page.getByRole('heading', { name: station.name })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Listen Live' })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/listen/stations/${STATION_SLUG}$`));
});

test('Listener live room does not repeat Channel name as both station and creator', async ({ page }) => {
  await authenticate(page, listener);
  await page.route(`**/api/broadcasts/${BROADCAST_ID}*`, (route) => route.fulfill({
    json: { data: {
      ...liveBroadcast,
      title: 'Layers Of Truth live - 12 Oct',
      creatorName: 'Layers of Truth',
      stationName: 'Layers of Truth',
      status: 'scheduled',
    } },
  }));
  await page.goto(`/listen/live/${BROADCAST_ID}`);
  await expect(page.locator('.listener-v2-room-event-copy h1')).toContainText('Layers Of Truth live');
  await expect(page.locator('.listener-v2-room-station')).toHaveCount(1);
  await expect(page.locator('.listener-v2-room-creator')).toHaveCount(0);
});

test('Auth autofill matches the translucent style of ordinary fields', async ({ page }) => {
  await page.goto('/login');
  const input = page.locator('#echoo-login-identifier');
  await expect(input).toBeVisible();
  const background = await input.evaluate((node) => ({
    field: getComputedStyle(node).backgroundColor,
    shell: getComputedStyle(node.closest('.ear-input-shell')).backgroundColor,
  }));
  expect(background.field).toMatch(/rgba?\(0, 0, 0, 0\)|transparent/);
  expect(background.shell).toMatch(/^rgba\(/);
  await page.goto('/register');
  await expect(page.locator('#echoo-signup-password')).toBeVisible();
});
