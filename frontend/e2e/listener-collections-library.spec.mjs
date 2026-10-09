import { test, expect } from 'playwright/test';

const stationId = '507f1f77bcf86cd799439021';
const savedId = '507f1f77bcf86cd799439091';
const publicId = '507f1f77bcf86cd799439092';

const station = { id: stationId, name: 'Layers of Truth', isPublic: true };
const saved = {
  id: savedId, title: 'School of Doctrine – Day 01', station, isPublic: true,
  isSaved: true, broadcastCount: 2, recordings: [
    { id: '507f1f77bcf86cd799439041', title: 'Morning Session', duration: 1800, coverArt: null },
  ],
};
const published = { id: publicId, title: 'Thursday Bible Study', station, isPublic: true, isSaved: false, broadcastCount: 1, recordings: [] };
const response = (route, data) => route.fulfill({ json: { data } });
const authenticate = (page) => page.addInitScript(() => {
  localStorage.setItem('accessToken', 'listener-token');
  localStorage.setItem('token', 'listener-token');
  localStorage.setItem('user', JSON.stringify({
    id: '507f1f77bcf86cd799439012', username: 'listener', roles: ['listener'],
    userType: 'listener', onboardingCompleted: true, profileCompleted: true,
  }));
  localStorage.setItem('echooProfileCompleted', 'true');
  localStorage.setItem('echooOnboardingCompleted', 'true');
});

test('web Library distinguishes saved Collections from published series and opens recordings', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/collections/public?*', (route) => response(route, [saved, published]));
  await page.route('**/api/collections/saved/mine*', (route) => response(route, [saved]));
  await page.route(`**/api/collections/${publicId}`, (route) => response(route, published));
  await page.goto('/listen/library?tab=collections');
  await expect(page.getByRole('button', { name: 'Collections', exact: true })).toHaveAttribute('aria-current', 'page');

  const savedSection = page.getByRole('region', { name: 'Saved Collections' });
  await expect(savedSection.getByText('School of Doctrine – Day 01')).toBeVisible();
  await expect(savedSection.getByText('Thursday Bible Study')).toHaveCount(0);

  const exploreSection = page.getByRole('region', { name: 'Published Collections' });
  await expect(exploreSection.getByText('Thursday Bible Study')).toBeVisible();
  await exploreSection.getByRole('button', { name: 'Open Thursday Bible Study' }).click();
  await expect(page).toHaveURL(new RegExp(`/listen/collections/${publicId}$`));
  await expect(page.getByRole('heading', { name: 'Thursday Bible Study' })).toBeVisible();
});

test('published Collections can be found from Discover without opening the Channel profile', async ({ page }) => {
  await page.route('**/api/collections/public?*', (route) => response(route, [published]));
  await page.goto('/listen');
  const preview = page.getByRole('region', { name: 'Published Collections' });
  await expect(preview.getByText('Thursday Bible Study')).toBeVisible();
  await preview.getByRole('button', { name: 'Explore all' }).click();
  await expect(page).toHaveURL(/\/listen\/library\?tab=collections$/);
  await expect(page.getByRole('heading', { name: 'Explore Collections' })).toBeVisible();
});
