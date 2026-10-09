import { expect, test } from 'playwright/test';

const STATION_ID = '507f1f77bcf86cd799439220';
const COLLECTION_ID = '507f1f77bcf86cd799439221';

const fulfill = (route, data) => route.fulfill({ json: { data } });

test('Channel Collections show collection artwork and a styled action that opens the selected Collection', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('echooActiveExperience', 'listener');
  });
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  await page.route(`**/api/stations/${STATION_ID}`, (route) => fulfill(route, {
    id: STATION_ID,
    name: 'Layers of Truth',
    description: 'Faith and community.',
    isPublic: true,
  }));
  await page.route(`**/api/broadcasts/live/station/${STATION_ID}`, (route) => fulfill(route, null));
  await page.route(`**/api/broadcasts/upcoming/station/${STATION_ID}**`, (route) => fulfill(route, []));
  await page.route(`**/api/follows/stations/${STATION_ID}/status`, (route) => fulfill(route, {
    isFollowing: false,
    followerCount: 0,
  }));
  await page.route(`**/api/collections/station/${STATION_ID}`, (route) => fulfill(route, [{
    id: COLLECTION_ID,
    title: 'School of Doctrine - Day 01 with a deliberately long readable title',
    broadcastCount: 6,
    coverArt: 'https://echoo.digi02.org/uploads/audio-covers/collection-cover.jpg',
  }]));
  await page.route('**/api/**', (route) => route.fallback());

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/listen/channels/${STATION_ID}`);

  const row = page.locator('.b3-collections-list article');
  await expect(row).toBeVisible();
  await expect(row.getByText(/School of Doctrine/)).toBeVisible();
  await expect(row.getByText('6 recordings')).toBeVisible();
  await expect(row.locator('.b3-collection-art')).toHaveAttribute('src', 'https://echoo.digi02.org/uploads/audio-covers/collection-cover.jpg');
  await expect(row.getByRole('button', { name: 'View' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'View' })).toHaveCSS('border-radius', '8px');

  const layout = await row.evaluate((node) => {
    const title = node.querySelector('strong')?.getBoundingClientRect();
    const button = node.querySelector('button')?.getBoundingClientRect();
    return {
      overflow: node.scrollWidth > node.clientWidth + 1,
      titleWidth: title?.width || 0,
      buttonWidth: button?.width || 0,
    };
  });
  expect(layout.overflow).toBe(false);
  expect(layout.titleWidth).toBeGreaterThan(layout.buttonWidth);
  expect(layout.buttonWidth).toBeLessThanOrEqual(100);

  await row.getByRole('button', { name: 'View' }).click();
  await expect(page).toHaveURL(new RegExp(`/listen/collections/${COLLECTION_ID}$`));
});
