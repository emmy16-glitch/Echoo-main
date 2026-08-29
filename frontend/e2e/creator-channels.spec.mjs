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

test('Creator sidebar routes, refresh, history, and quick clicks stay in sync', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const canonicalRoutes = [
    ['/creator-studio', 'Broadcast'],
    ['/creator-studio/channels', 'Channels'],
    ['/creator-studio/recordings', 'Recordings'],
    ['/creator-studio/schedule-events', 'Schedule Events'],
    ['/creator-studio/analytics', 'Analytics'],
  ];

  for (const [path, label] of canonicalRoutes) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
  }

  await page.goto('/creator-studio');
  await page.getByRole('button', { name: 'Channels' }).click();
  await expect(page).toHaveURL(/\/creator-studio\/channels$/);
  await page.getByRole('button', { name: 'Recordings' }).click();
  await expect(page).toHaveURL(/\/creator-studio\/recordings$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/creator-studio\/channels$/);
  await expect(page.getByRole('button', { name: 'Channels', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page).toHaveURL(/\/creator-studio$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/creator-studio\/channels$/);

  await page.getByRole('button', { name: 'Recordings' }).click();
  await expect(page).toHaveURL(/\/creator-studio\/recordings$/);
  await page.getByRole('button', { name: 'Channels' }).click();
  await expect(page).toHaveURL(/\/creator-studio\/channels$/);
  await page.getByRole('button', { name: 'Recordings' }).click();
  await expect(page).toHaveURL(/\/creator-studio\/recordings$/);
  await page.getByRole('button', { name: 'Analytics' }).click();
  await expect(page).toHaveURL(/\/creator-studio\/analytics$/);
  await page.getByRole('button', { name: 'Schedule Events' }).click();
  await expect(page).toHaveURL(/\/creator-studio\/schedule-events$/);

  await page.locator('.studio-nav-item').evaluateAll((items) => {
    ['Broadcast', 'Channels', 'Recordings', 'Analytics'].forEach((label) => (
      [...items].find((item) => item.getAttribute('aria-label') === label)?.click()
    ));
  });
  await expect(page).toHaveURL(/\/creator-studio\/analytics$/);
  await expect(page.getByRole('button', { name: 'Analytics', exact: true })).toHaveAttribute('aria-current', 'page');
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

test('one live channel stays left-aligned and the Channels surface hugs real content', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.route('**/api/broadcasts?**', (route) => {
    const url = new URL(route.request().url());
    fulfill(route, url.searchParams.get('status') === 'live' ? [liveBroadcasts[1]] : []);
  });

  await page.goto('/creator-studio/channels');
  await expect(page.locator('.channels-card')).toHaveCount(1);

  const geometry = await page.evaluate(() => {
    const surface = document.querySelector('.channels-surface')?.getBoundingClientRect();
    const card = document.querySelector('.channels-card')?.getBoundingClientRect();
    const grid = document.querySelector('.channels-grid')?.getBoundingClientRect();
    const filters = document.querySelector('.channels-filters')?.getBoundingClientRect();
    const surfaceStyle = document.querySelector('.channels-surface');
    const filtersStyle = document.querySelector('.channels-filters');
    return {
      surface,
      card,
      grid,
      filters,
      surfaceMinHeight: surfaceStyle ? getComputedStyle(surfaceStyle).minHeight : '',
      filtersAlignSelf: filtersStyle ? getComputedStyle(filtersStyle).alignSelf : '',
    };
  });

  expect(geometry.card.width).toBeGreaterThanOrEqual(218);
  expect(geometry.card.width).toBeLessThanOrEqual(222);
  expect(Math.abs(geometry.card.left - geometry.grid.left)).toBeLessThanOrEqual(1);
  expect(geometry.surfaceMinHeight).toBe('0px');
  expect(geometry.filtersAlignSelf).toBe('start');
  expect(geometry.surface.height).toBeLessThan(900);
  expect(Math.abs(geometry.filters.bottom - geometry.surface.bottom)).toBeLessThanOrEqual(2);

  await page.screenshot({
    path: 'design-qa-evidence/channels/channels-one-1536x1024.png',
    fullPage: false,
  });
});

test('eight live channels retain the four-column reference grid without growing cards', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  const manyLiveBroadcasts = Array.from({ length: 8 }, (_, index) => {
    const channel = station(
      `507f1f77bcf86cd79943902${index}`,
      `507f1f77bcf86cd79943912${index}`,
      `QA Channel ${index + 1}`,
      index % 2 ? 'Education' : 'Technology',
      20 + index,
      { live: true },
    );
    return {
      ...liveBroadcasts[1],
      id: `607f1f77bcf86cd79943902${index}`,
      _id: `607f1f77bcf86cd79943902${index}`,
      station: channel,
      stationId: channel.id,
      creator: channel.owner,
      title: `${channel.name} Live`,
      description: channel.description,
      tags: channel.tags,
      listenerCount: channel.listenerCount,
    };
  });
  await page.route('**/api/stations?**', (route) => fulfill(route, manyLiveBroadcasts.map((broadcast) => broadcast.station)));
  await page.route('**/api/broadcasts?**', (route) => {
    const url = new URL(route.request().url());
    fulfill(route, url.searchParams.get('status') === 'live' ? manyLiveBroadcasts : []);
  });

  await page.goto('/creator-studio/channels');
  await expect(page.locator('.channels-card')).toHaveCount(8);
  const cards = await page.locator('.channels-card').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()));

  expect(cards.every((card) => card.width >= 218 && card.width <= 222)).toBe(true);
  expect(Math.abs(cards[0].left - cards[4].left)).toBeLessThanOrEqual(1);
  expect(cards[4].top).toBeGreaterThan(cards[0].top);
});

test('Creator workspace navigation resets the main scroll, while Channels filtering does not', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/creator-studio');
  const mainScroll = page.locator('#echoo-main-content');
  const initialSidebarBox = await page.locator('.studio-sidebar').boundingBox();
  const initialTopbarBox = await page.locator('.studio-topbar-final').boundingBox();
  await mainScroll.evaluate((container) => {
    const spacer = document.createElement('div');
    spacer.id = 'creator-scroll-test-spacer';
    spacer.style.height = '1200px';
    container.append(spacer);
    container.scrollTo(0, 650);
  });
  await expect.poll(() => mainScroll.evaluate((container) => container.scrollTop)).toBeGreaterThan(100);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect((await page.locator('.studio-sidebar').boundingBox()).y).toBe(initialSidebarBox.y);
  expect((await page.locator('.studio-topbar-final').boundingBox()).y).toBe(initialTopbarBox.y);

  await page.getByRole('button', { name: 'Channels' }).click();
  await expect(page).toHaveURL(/\/creator-studio\/channels$/);
  await expect.poll(() => mainScroll.evaluate((container) => container.scrollTop)).toBe(0);

  await mainScroll.evaluate((container) => container.scrollTo(0, 500));
  await expect.poll(() => mainScroll.evaluate((container) => container.scrollTop)).toBeGreaterThan(100);
  await page.getByPlaceholder('Search channels or topics...').fill('builders');
  await expect.poll(() => mainScroll.evaluate((container) => container.scrollTop)).toBeGreaterThan(100);

  await page.getByRole('button', { name: 'Recordings' }).click();
  await expect(page).toHaveURL(/\/creator-studio\/recordings$/);
  await expect.poll(() => mainScroll.evaluate((container) => container.scrollTop)).toBeLessThanOrEqual(8);

  await mainScroll.evaluate((container) => container.scrollTo(0, 500));
  await expect.poll(() => mainScroll.evaluate((container) => container.scrollTop)).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Channels' }).click();
  await expect(page).toHaveURL(/\/creator-studio\/channels$/);
  await expect.poll(() => mainScroll.evaluate((container) => container.scrollTop)).toBeLessThanOrEqual(8);
});
