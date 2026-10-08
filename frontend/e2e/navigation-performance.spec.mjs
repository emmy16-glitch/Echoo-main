import { expect, test } from 'playwright/test';

const routeInApp = (page, path) => page.evaluate((nextPath) => {
  history.pushState({}, '', nextPath);
  window.dispatchEvent(new PopStateEvent('popstate'));
}, path);

const measuredRouteInApp = (page, path, heading) => page.evaluate(({ nextPath, expectedHeading }) => (
  new Promise((resolve, reject) => {
    const started = performance.now();
    const findHeading = () => [...document.querySelectorAll('h1, h2')]
      .some((node) => node.textContent?.trim() === expectedHeading);
    const observer = new MutationObserver(() => {
      if (!findHeading()) return;
      observer.disconnect();
      resolve(performance.now() - started);
    });
    observer.observe(document.getElementById('echoo-route-content'), { childList: true, subtree: true });
    history.pushState({}, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
    if (findHeading()) {
      observer.disconnect();
      resolve(performance.now() - started);
    }
    window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Route ${nextPath} did not render ${expectedHeading}`));
    }, 3000);
  })
), { nextPath: path, expectedHeading: heading });

test('warm Listener navigation reuses page data and remains available offline', async ({ page, context }, testInfo) => {
  const requests = new Map();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return;
    requests.set(url.pathname + url.search, (requests.get(url.pathname + url.search) || 0) + 1);
  });

  await page.goto('/listen');
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();

  await routeInApp(page, '/listen/channels');
  await expect(page.getByRole('heading', { name: 'Channels', exact: true })).toBeVisible();
  await expect(page.locator('.listener-v2-skeleton-grid')).toHaveCount(0);

  await routeInApp(page, '/listen');
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
  const warmMs = await measuredRouteInApp(page, '/listen/channels', 'Channels');
  expect(warmMs).toBeLessThan(200);
  await expect(page.locator('.listener-v2-skeleton-grid')).toHaveCount(0);

  await context.setOffline(true);
  await expect(page.getByText('You’re offline · Cached pages remain available')).toBeVisible();
  await routeInApp(page, '/listen');
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
  const offlineMs = await measuredRouteInApp(page, '/listen/channels', 'Channels');
  expect(offlineMs).toBeLessThan(200);
  await expect(page.locator('.listener-v2-skeleton-grid')).toHaveCount(0);

  await context.setOffline(false);
  await expect(page.getByText('Back online · Refreshing Echoo')).toBeVisible();
  await expect(page.getByText('Back online · Refreshing Echoo')).toBeHidden({ timeout: 4000 });

  // The same channels resource is reused during warm/offline navigation. A
  // reconnect may trigger one deliberate background revalidation, never one
  // request per route visit.
  const stationRequests = [...requests.entries()]
    .filter(([key]) => key.includes('/api/stations'))
    .reduce((sum, [, count]) => sum + count, 0);
  expect(stationRequests).toBeLessThanOrEqual(2);
  await testInfo.attach('navigation-metrics.json', {
    body: JSON.stringify({ warmMs, offlineMs, stationRequests }, null, 2),
    contentType: 'application/json',
  });
  console.info(`[Echoo navigation] warm=${warmMs.toFixed(1)}ms offline=${offlineMs.toFixed(1)}ms stationRequests=${stationRequests}`);
});
