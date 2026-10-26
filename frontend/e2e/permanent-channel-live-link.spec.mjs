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

test('one permanent Channel link opens the current live guest room', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const live = { current: FIRST_BROADCAST_ID };
  await routeChannelApi(page, live);
  await page.goto(PERMANENT_PATH);
  await expect(page).toHaveURL(new RegExp(`${PERMANENT_PATH}$`));
  await expect(page.locator('.listener-v2-live-room')).toBeVisible();
  const button = page.getByRole('button', { name: 'Chat', exact: true });
  await expect(button).toBeVisible();
  await button.click();
  const chat = page.getByRole('dialog', { name: 'Live chat' });
  await expect(chat).toBeVisible();
  await expect(chat.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(chat.locator('.lex-chat-composer')).toHaveCount(0);
  await chat.getByRole('button', { name: 'Close live chat' }).click();
  await expect(page.locator('.listener-v2-root--room')).toBeVisible();
  live.current = SECOND_BROADCAST_ID;
  await page.goto(PERMANENT_PATH);
  await expect(page).toHaveURL(new RegExp(`${PERMANENT_PATH}$`));
  await expect(page.locator('.listener-v2-room-event-copy h1')).toContainText('Monday live teaching');
});

test('guests share the Channel URL rather than the broadcast ID', async ({ page }) => {
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
  await page.locator('.listener-room-actions summary').click();
  await page.getByRole('menuitem', { name: 'Copy link' }).click();
  await expect.poll(() => page.evaluate(() => window.__sharedLink)).toBe(
    `https://echoo.digi02.org${PERMANENT_PATH}`
  );
});

test('the permanent Channel URL remains an off-air Channel profile', async ({ page }) => {
  await routeChannelApi(page, { current: null });
  await page.goto(PERMANENT_PATH);
  await expect(page).toHaveURL(new RegExp(`${PERMANENT_PATH}$`));
  await expect(page.getByRole('heading', { name: 'Layers of Truth' })).toBeVisible();
  await expect(page.getByText('Nothing scheduled yet.')).toBeVisible();
});
