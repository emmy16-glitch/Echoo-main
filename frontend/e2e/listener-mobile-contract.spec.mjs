import { expect, test } from 'playwright/test';

const stationId = '507f1f77bcf86cd799439220';
const duplicatedStation = {
  id: stationId,
  name: 'Layers of Truth',
  slug: 'layers-of-truth',
  ownerId: '507f1f77bcf86cd799439200',
  category: 'Faith',
  isPublic: true,
  isLive: false,
};

test('Channel discovery shows one copy even when the API returns duplicate Channels', async ({ page }) => {
  await page.route('**/api/stations?*', (route) =>
    route.fulfill({ json: { data: [
      duplicatedStation,
      { ...duplicatedStation, id: '507f1f77bcf86cd799439221' },
    ] } }));
  await page.goto('/listen/channels');
  const cards = page.locator('.listener-v2-station-card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Layers of Truth');
});

for (const width of [320, 360, 375, 390, 430, 768]) {
  test(`Listener shared-link interface stays inside ${width}px screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.route('**/api/broadcasts/**', (route) => route.fulfill({
      json: { data: { id: '507f1f77bcf86cd799439222', status: 'ended', isPublic: true,
        title: 'Layers of Truth community discussion with a longer broadcast title',
        station: duplicatedStation, stationName: 'Layers of Truth',
      } },
    }));
    await page.goto('/listen/live/507f1f77bcf86cd799439222');
    await expect(page.locator('.listener-v2-live-room')).toBeVisible();
    const widths = await page.evaluate(() => {
      const root = document.documentElement;
      const controls = document.querySelector('.listener-v2-room-controls');
      return {
        scrollWidth: root.scrollWidth,
        viewportWidth: window.innerWidth,
        controlsWidth: controls?.scrollWidth || 0,
        controlsClientWidth: controls?.clientWidth || 0,
      };
    });
    expect(widths.scrollWidth).toBeLessThanOrEqual(widths.viewportWidth + 2);
    expect(widths.controlsWidth).toBeLessThanOrEqual(widths.controlsClientWidth + 2);
  });
}

test('Listener playback never asks for microphone capture', async ({ page }) => {
  await page.addInitScript(() => {
    window.__listenerMicRequests = 0;
    if (navigator.mediaDevices) {
      const original = navigator.mediaDevices.getUserMedia?.bind(navigator.mediaDevices);
      if (original) navigator.mediaDevices.getUserMedia = (...args) => {
        window.__listenerMicRequests += 1;
        return Promise.reject(new Error('Listeners cannot access microphone capture'));
      };
    }
  });
  await page.route('**/api/broadcasts/**', (route) => route.fulfill({
    json: { data: { id: '507f1f77bcf86cd799439222', status: 'ended',
      title: 'Layers of Truth', station: duplicatedStation, isPublic: true } },
  }));
  await page.goto('/listen/live/507f1f77bcf86cd799439222');
  await expect(page.locator('.listener-v2-live-room')).toBeVisible();
  expect(await page.evaluate(() => window.__listenerMicRequests)).toBe(0);
});
