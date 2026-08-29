import { expect, test } from 'playwright/test';

const creator = {
  id: '507f1f77bcf86cd799439099',
  username: 'echoocreator',
  displayName: 'Echoo Creator',
  userType: 'creator',
  roles: ['creator'],
  onboardingCompleted: true,
  profileCompleted: true,
};

const authenticate = async (page) => {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('accessToken', 'creator-token');
    localStorage.setItem('token', 'creator-token');
    localStorage.setItem('refreshToken', 'creator-refresh-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('echooRole', 'creator');
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('creatorSetup', JSON.stringify({ type: 'individual', name: user.displayName }));
  }, { user: creator });
};

const station = (id, ownerId, name, category, listeners, extra = {}) => ({
  id,
  _id: id,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  description: `${name} live conversations`,
  category,
  tags: [category, 'Live'],
  isPublic: extra.isPublic !== false,
  isLive: Boolean(extra.live),
  listenerCount: listeners,
  owner: { id: ownerId, _id: ownerId, username: `${name.toLowerCase().replace(/\s/g, '')}creator`, displayName: `${name} Creator` },
  createdAt: extra.createdAt || '2026-08-20T12:00:00.000Z',
});

const ownStation = station('507f1f77bcf86cd799439001', creator.id, 'My Station', 'Technology', 500, { live: true });
const publicStations = [
  ownStation,
  station('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439111', 'Builders in Africa', 'Technology', 24, { live: true }),
  station('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439112', 'Knowledge Exchange', 'Education', 82, { live: true, createdAt: '2026-08-28T12:00:00.000Z' }),
  station('507f1f77bcf86cd799439013', '507f1f77bcf86cd799439113', 'Quiet Music', 'Music', 0),
  station('507f1f77bcf86cd799439014', '507f1f77bcf86cd799439114', 'Private Room', 'Talk', 70, { live: true, isPublic: false }),
];

const liveBroadcasts = publicStations.filter((item) => item.isLive).map((item, index) => ({
  id: `607f1f77bcf86cd79943901${index}`,
  _id: `607f1f77bcf86cd79943901${index}`,
  station: item,
  stationId: item.id,
  creator: item.owner,
  title: `${item.name} Live`,
  description: item.description,
  tags: item.tags,
  status: 'live',
  isPublic: item.isPublic,
  listenerCount: item.listenerCount,
  startTime: '2026-08-29T08:00:00.000Z',
  captionSettings: { language: index % 2 ? 'yo' : 'en' },
}));

const fulfill = (route, data) => route.fulfill({ json: { data } });

test.beforeEach(async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/auth/me', (route) => fulfill(route, { user: creator }));
  await page.route('**/api/studio/dashboard**', (route) => fulfill(route, {}));
  await page.route('**/api/studio/content**', (route) => fulfill(route, { tracks: [], pagination: {} }));
  await page.route('**/api/studio/analytics**', (route) => fulfill(route, {}));
  await page.route('**/api/stations/mine/all**', (route) => fulfill(route, [ownStation]));
  await page.route('**/api/stations?**', (route) => fulfill(route, publicStations.filter((item) => item.isPublic)));
  await page.route('**/api/broadcasts/mine/all**', (route) => fulfill(route, []));
  await page.route('**/api/broadcasts?**', async (route) => {
    const url = new URL(route.request().url());
    fulfill(route, url.searchParams.get('status') === 'live'
      ? liveBroadcasts.filter((item) => item.isPublic)
      : []);
  });
  await page.route('**/api/broadcasts/*/presence', (route) => {
    const id = route.request().url().split('/').at(-2);
    const broadcast = liveBroadcasts.find((item) => item.id === id);
    fulfill(route, { listenerCount: broadcast?.listenerCount || 0, peakListeners: broadcast?.listenerCount || 0 });
  });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/stations/builders-in-africa') return fulfill(route, publicStations[1]);
    if (path === `/api/broadcasts/station/${publicStations[1].id}/live`) return fulfill(route, liveBroadcasts[1]);
    if (path === `/api/broadcasts/station/${publicStations[1].id}/upcoming`) return fulfill(route, []);
    if (path === `/api/follows/stations/${publicStations[1].id}/status`) return fulfill(route, { following: false, followerCount: 0 });
    if (
      path.startsWith('/api/player/') ||
      path.startsWith('/api/notifications/') ||
      path === '/api/settings'
    ) return fulfill(route, {});
    return route.fallback();
  });
});

test('Channels matches the approved structure and all primary controls work', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/creator-studio/channels');
  await expect(page.getByRole('heading', { name: 'Channels', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Channels' })).toHaveClass(/active/);
  await expect(page.getByRole('link', { name: 'Open Builders in Africa' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Knowledge Exchange' })).toBeVisible();
  await expect(page.getByText('My Station', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Private Room', { exact: true })).toHaveCount(0);

  const search = page.getByPlaceholder('Search channels or topics...');
  await search.fill('knowledge');
  await expect(page.getByRole('link', { name: 'Open Knowledge Exchange' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Builders in Africa' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear channel search' }).click();

  await page.getByRole('button', { name: 'Education' }).click();
  await expect(page.getByRole('link', { name: 'Open Knowledge Exchange' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear all filters' }).click();

  await page.getByLabel('Sort channels').selectOption('listeners');
  await expect(page.locator('.channels-card').first()).toContainText('Knowledge Exchange');
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.locator('.channels-grid')).toHaveClass(/is-list/);
  await page.getByRole('button', { name: 'Grid view' }).click();
  await page.getByLabel('Sort channels').selectOption('live');

  await page.screenshot({
    path: 'design-qa-evidence/channels/channels-1536x1024.png',
    fullPage: false,
  });

  await page.getByRole('button', { name: 'Broadcast', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'OFF AIR', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Channels' }).click();
  await expect(page).toHaveURL(/\/creator-studio\/channels$/);
  expect(errors).toEqual([]);
});

test('Listen uses the canonical public station route', async ({ page }) => {
  await page.goto('/creator-studio/channels');
  await page.getByRole('button', { name: 'Listen to Builders in Africa' }).click();
  await expect(page).toHaveURL(/\/listen\/stations\/builders-in-africa$/);
});

test('Channels remains usable on a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/creator-studio/channels');

  await expect(page.getByRole('heading', { name: 'Channels', level: 1 })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Channel filters' })).toBeHidden();
  await page.getByRole('button', { name: 'Filters' }).click();
  await expect(page.getByRole('complementary', { name: 'Channel filters' })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalOverflow).toBe(false);
});
