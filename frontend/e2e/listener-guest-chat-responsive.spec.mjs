import { expect, test } from 'playwright/test';

const broadcastId = '507f1f77bcf86cd799439222';
const stationId = '507f1f77bcf86cd799439220';
const broadcast = {
  id: broadcastId,
  status: 'scheduled',
  title: 'Layers of Truth live session with a deliberately very long programme title that needs room to wrap on small phone screens',
  stationId,
  station: { id: stationId, name: 'Layers of Truth', isPublic: true },
  stationName: 'Layers of Truth',
  creatorName: 'Layers of Truth',
  listenerCount: 0,
  isPublic: true,
};

const mockGuestRoom = async (page) => {
  await page.addInitScript(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  });
  await page.route(`**/api/broadcasts/${broadcastId}/public*`, (route) =>
    route.fulfill({ json: { data: broadcast } }));
  await page.route(`**/api/chat/broadcast/${broadcastId}/public/messages?*`, (route) =>
    route.fulfill({ json: { data: [
      { id: 'chat-1', message: 'A wonderful discussion', displayName: 'Grace',
        content: 'A wonderful discussion', createdAt: new Date().toISOString() },
    ] } }));
  await page.route(`**/api/broadcasts/${broadcastId}/presence*`, (route) =>
    route.fulfill({ json: { data: { listenerCount: 0 } } }));
};

const screenHealth = async (page) => page.evaluate(() => {
  const viewport = document.documentElement.clientWidth;
  const bounds = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    };
  };
  return {
    viewport,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    toolbar: bounds('.listener-v2-room-toolbar'),
    controls: bounds('.listener-v2-room-controls'),
    chatButton: bounds('.listener-v2-room-chat-toggle'),
    artwork: bounds('.listener-v2-room-artwork'),
    chat: bounds('.listener-v2-room-chat.is-open'),
    guestActions: bounds('.listener-v2-room-chat-top-actions'),
  };
});

for (const { width, height } of [
  { width: 280, height: 568 },
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
  { width: 540, height: 720 },
  { width: 667, height: 375 },
  { width: 767, height: 560 },
]) {
  test(`guest shared broadcast and chat stay usable at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockGuestRoom(page);
    await page.goto(`/listen/live/${broadcastId}`);
    await expect(page.locator('.listener-v2-live-room')).toBeVisible();
    await expect(page.locator('.listener-v2-room-controls')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chat', exact: true })).toBeVisible();
    const initial = await screenHealth(page);
    expect(initial.documentWidth).toBeLessThanOrEqual(initial.viewport + 2);
    expect(initial.bodyWidth).toBeLessThanOrEqual(initial.viewport + 2);
    for (const key of ['toolbar', 'controls', 'chatButton', 'artwork']) {
      expect(initial[key], `missing ${key}`).not.toBeNull();
      expect(initial[key].left, `${key} spills left`).toBeGreaterThanOrEqual(-2);
      expect(initial[key].right, `${key} spills right`).toBeLessThanOrEqual(width + 2);
    }
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    const chat = page.getByRole('dialog', { name: 'Live chat' });
    await expect(chat).toBeVisible();
    await expect(chat.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(chat.getByRole('button', { name: 'Close live chat' })).toBeVisible();
    await expect(chat.locator('.lex-chat-composer')).toHaveCount(0);
    await expect.poll(async () => {
      const metrics = await screenHealth(page);
      return Boolean(metrics.chat && metrics.chat.top >= -2 && metrics.chat.bottom <= height + 2);
    }).toBe(true);
    const open = await screenHealth(page);
    expect(open.documentWidth).toBeLessThanOrEqual(width + 2);
    expect(open.chat?.top).toBeGreaterThanOrEqual(-2);
    expect(open.chat?.bottom).toBeLessThanOrEqual(height + 2);
    expect(open.guestActions?.right).toBeLessThanOrEqual(width + 2);
    await chat.getByRole('button', { name: 'Close live chat' }).click();
    await expect(page.getByRole('button', { name: 'Chat', exact: true })).toHaveAttribute('aria-expanded', 'false');
  });
}

test('guest chat reflows when a phone switches to landscape while open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockGuestRoom(page);
  await page.goto(`/listen/live/${broadcastId}`);
  await expect(page.locator('.listener-v2-live-room')).toBeVisible();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.setViewportSize({ width: 667, height: 375 });
  await expect.poll(async () => {
    const metrics = await screenHealth(page);
    return Boolean(metrics.chat && metrics.chat.top >= -2 && metrics.chat.bottom <= 377);
  }).toBe(true);
  const metrics = await screenHealth(page);
  expect(metrics.chat?.top).toBeGreaterThanOrEqual(-2);
  expect(metrics.chat?.bottom).toBeLessThanOrEqual(377);
  await expect(page.getByRole('button', { name: 'Close live chat' })).toBeVisible();
});

for (const width of [280, 320, 360, 390, 430, 767]) {
  test(`guest Listener discovery header fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await page.addInitScript(() => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    });
    await page.route('**/api/broadcasts?*', (route) => route.fulfill({ json: { data: [] } }));
    await page.route('**/api/playlists?*', (route) => route.fulfill({ json: { data: [] } }));
    await page.route('**/api/collections/public?*', (route) => route.fulfill({ json: { data: [] } }));
    await page.goto('/listen');
    await expect(page.locator('.listener-v2-header')).toBeVisible();
    const bounds = await page.evaluate(() => {
      const header = document.querySelector('.listener-v2-header');
      return { width: document.documentElement.scrollWidth, headerWidth: header?.scrollWidth || 0,
        headerClient: header?.clientWidth || 0 };
    });
    expect(bounds.width).toBeLessThanOrEqual(width + 2);
    expect(bounds.headerWidth).toBeLessThanOrEqual(bounds.headerClient + 2);
  });
}

for (const { width, height } of [
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 912, height: 1368 },
  { width: 1023, height: 600 },
]) {
  test(`guest live room stacks chat below playback at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockGuestRoom(page);
    await page.goto(`/listen/live/${broadcastId}`);
    await expect(page.locator('.listener-v2-room-grid')).toBeVisible();
    await expect(page.locator('.listener-v2-room-chat')).toBeVisible();
    const layout = await page.evaluate(() => {
      const bounds = (selector) => document.querySelector(selector)?.getBoundingClientRect();
      const player = bounds('.listener-v2-room-stage');
      const chat = bounds('.listener-v2-room-chat');
      return {
        pageWidth: document.documentElement.scrollWidth,
        player: player ? { left: player.left, right: player.right, bottom: player.bottom } : null,
        chat: chat ? { left: chat.left, right: chat.right, top: chat.top } : null,
      };
    });
    expect(layout.pageWidth).toBeLessThanOrEqual(width + 2);
    expect(layout.player?.right).toBeLessThanOrEqual(width + 2);
    expect(layout.chat?.right).toBeLessThanOrEqual(width + 2);
    expect(layout.chat?.top).toBeGreaterThanOrEqual(layout.player.bottom - 2);
  });
}

test('opening guest chat in portrait then rotating to tablet hides the backdrop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockGuestRoom(page);
  await page.goto(`/listen/live/${broadcastId}`);
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Live chat' })).toBeVisible();
  await page.setViewportSize({ width: 820, height: 600 });
  await expect(page.locator('.listener-v2-room-chat-backdrop')).toHaveCount(0);
  await expect(page.locator('.listener-v2-room-chat')).toBeVisible();
  await expect(page.locator('.listener-v2-room-chat')).not.toHaveAttribute('aria-modal', 'true');
});
