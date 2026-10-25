import { expect, test } from 'playwright/test';

const STATION_ID = '507f1f77bcf86cd799439021';
const FIRST_BROADCAST_ID = '507f1f77bcf86cd799439031';
const SECOND_BROADCAST_ID = '507f1f77bcf86cd799439032';
const PERMANENT_PATH = '/listen/stations/layers-of-truth';

const station = {
  id: STATION_ID,
  slug: 'layers-of-truth',
  name: 'Layers of Truth',
  description: 'Listen to our live teachings and recordings.',
  isPublic: true,
  owner: { id: '507f1f77bcf86cd799439011', displayName: 'Channel creator' },
};

const broadcast = (id) => ({
  id,
  title: id === FIRST_BROADCAST_ID ? 'Sunday live teaching' : 'Monday live teaching',
  status: 'live',
  stationId: STATION_ID,
  station,
  startedAt: new Date().toISOString(),
  isPublic: true,
});

const routeChannelApi = async (page, liveId) => {
  await page.route('**/api/stations/layers-of-truth', (route) =>
    route.fulfill({ json: { data: station } }));
  await page.route(`**/api/broadcasts/station/${STATION_ID}/live`, (route) =>
    route.fulfill({ json: { data: liveId.current ? broadcast(liveId.current) : null } }));
  await page.route(`**/api/broadcasts/station/${STATION_ID}/upcoming`, (route) =>
    route.fulfill({ json: { data: [] } }));
  for (const id of [FIRST_BROADCAST_ID, SECOND_BROADCAST_ID]) {
    await page.route(`**/api/broadcasts/${id}/public`, (route) =>
      route.fulfill({ json: { data: broadcast(id) } }));
    await page.route(`**/api/chat/broadcast/${id}/public/messages?*`, (route) =>
      route.fulfill({ json: { data: [] } }));
  }
};

test('the same public Channel URL takes guests to whichever broadcast is live', async ({ page }) => {
  const live = { current: FIRST_BROADCAST_ID };
  await routeChannelApi(page, live);
  await page.goto(PERMANENT_PATH);
  await expect(page).toHaveURL(new RegExp(`/listen/live/${FIRST_BROADCAST_ID}$`));
  await expect(page.locator('.listener-v2-live-room')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chat', exact: true })).toBeVisible();

  live.current = SECOND_BROADCAST_ID;
  await page.goto(PERMANENT_PATH);
  await expect(page).toHaveURL(new RegExp(`/listen/live/${SECOND_BROADCAST_ID}$`));
  await expect(page.locator('.listener-v2-room-event-copy h1')).toContainText('Monday live teaching');
});

test('guests share the permanent Channel URL, not a one-time broadcast link', async ({ page }) => {
  const live = { current: FIRST_BROADCAST_ID };
  await routeChannelApi(page, live);
  await page.addInitScript(() => {
    localStorage.removeItem('accessToken');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value) => { window.__sharedLink = value; } },
    });
  });
  await page.goto(PERMANENT_PATH);
  await expect(page.locator('.listener-v2-live-room')).toBeVisible();
  const actions = page.locator('.listener-room-actions summary');
  await actions.click();
  await page.getByRole('menuitem', { name: 'Copy link' }).click();
  await expect.poll(() => page.evaluate(() => window.__sharedLink)).toBe(
    `${new URL(page.url()).origin}${PERMANENT_PATH}`
  );
});

test('permanent Channel URL displays the Channel when no broadcast is live', async ({ page }) => {
  await routeChannelApi(page, { current: null });
  await page.goto(PERMANENT_PATH);
  await expect(page).toHaveURL(new RegExp(`${PERMANENT_PATH}$`));
  await expect(page.getByRole('heading', { name: 'Layers of Truth' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Listen live/i })).toHaveCount(0);
  await expect(page.getByText('Nothing scheduled yet.')).toBeVisible();
});
