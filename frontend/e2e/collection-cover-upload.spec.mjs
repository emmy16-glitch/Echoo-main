import { expect, test } from 'playwright/test';

const CREATOR_ID = '507f1f77bcf86cd799439011';
const STATION_ID = '507f1f77bcf86cd799439021';
const COLLECTION_ID = '507f1f77bcf86cd799439091';
const ORIGINAL_COVER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#e2e8f0"/></svg>');
const SAVED_COVER = 'https://example.test/uploads/collection-covers/collection-cover.png';

const creator = {
  id: CREATOR_ID,
  _id: CREATOR_ID,
  username: 'echoocreator',
  displayName: 'Echoo Creator',
  userType: 'creator',
  roles: ['creator'],
  onboardingCompleted: true,
  profileCompleted: true,
};

const station = { id: STATION_ID, _id: STATION_ID, name: 'Layers of truth', isPublic: true };
const collection = {
  id: COLLECTION_ID,
  _id: COLLECTION_ID,
  title: 'Back to faith',
  description: 'Curated recordings.',
  station,
  stationId: STATION_ID,
  creator,
  isPublic: true,
  coverArt: ORIGINAL_COVER,
  recordings: [],
  broadcastCount: 0,
};

const fulfill = (route, value) => route.fulfill({ json: { data: value } });

const authenticate = (page) => page.addInitScript((user) => {
  localStorage.setItem('accessToken', 'creator-token');
  localStorage.setItem('token', 'creator-token');
  localStorage.setItem('refreshToken', 'creator-refresh-token');
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('echooRole', 'creator');
  localStorage.setItem('echooProfileCompleted', 'true');
  localStorage.setItem('echooOnboardingCompleted', 'true');
}, creator);

test('collection artwork crop stays above its editor and replaces the visible cover after save', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await authenticate(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.route('**/collections/mine/all**', (route) => fulfill(route, [collection]));
  await page.route('**/stations/mine/all**', (route) => fulfill(route, [station]));
  await page.route('**/studio/content**', (route) => fulfill(route, { tracks: [], pagination: {} }));
  await page.route(`**/collections/${COLLECTION_ID}**`, async (route) => {
    if (route.request().method() !== 'PATCH') return fulfill(route, collection);
    const contentType = await route.request().headerValue('content-type') || '';
    return fulfill(route, contentType.includes('multipart/form-data')
      ? { ...collection, coverArt: SAVED_COVER }
      : collection);
  });

  await page.goto('/creator-studio/collections');
  await page.getByRole('button', { name: /collections/i }).first().click();
  const card = page.getByRole('button', { name: /back to faith/i });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole('button', { name: /^edit$/i }).click();

  const editor = page.locator('.creator-collections-modal');
  await expect(editor).toBeVisible();
  await editor.getByLabel('Collection cover').setInputFiles('public/favicon-32x32.png');

  const cropper = page.getByRole('dialog', { name: 'Crop artwork' });
  await expect(cropper).toBeVisible();
  const layers = await page.evaluate(() => ({
    crop: Number(getComputedStyle(document.querySelector('.echoo-crop-overlay')).zIndex),
    editor: Number(getComputedStyle(document.querySelector('.creator-collections-modal')).zIndex),
  }));
  expect(layers.crop).toBeGreaterThan(layers.editor);

  await cropper.getByRole('button', { name: 'Use this crop' }).click();
  await expect(cropper).toHaveCount(0);
  await expect(editor.getByAltText('Selected collection cover preview')).toHaveAttribute('src', /^blob:/);
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator('.creator-collection-cover')).toHaveAttribute('src', SAVED_COVER);
  expect(errors).toEqual([]);
});
