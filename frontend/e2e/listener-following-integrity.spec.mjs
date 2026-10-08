import { test, expect } from 'playwright/test';

const listener = {
  id: '507f1f77bcf86cd799439012',
  username: 'listener',
  userType: 'listener',
  roles: ['listener'],
  onboardingCompleted: true,
  profileCompleted: true,
};
const creatorId = '507f1f77bcf86cd799439080';
const stationId = '507f1f77bcf86cd799439081';
const audioId = '507f1f77bcf86cd799439082';
const creator = { id: creatorId, _id: creatorId, username: 'pastor', displayName: 'Pastor Emmanuel', userType: 'creator', isActive: true };
const station = { id: stationId, _id: stationId, name: 'Layers of Truth', category: 'Faith', isPublic: true, isLive: false, owner: creator };
const recording = { id: audioId, _id: audioId, title: 'Thursday Bible Study', artist: creator, createdAt: new Date().toISOString(), duration: 360 };

const authenticate = async (page) => page.addInitScript((identity) => {
  localStorage.setItem('accessToken', 'listener-token');
  localStorage.setItem('token', 'listener-token');
  localStorage.setItem('user', JSON.stringify(identity));
  localStorage.setItem('echooRole', 'listener');
  localStorage.setItem('echooProfileCompleted', 'true');
  localStorage.setItem('echooOnboardingCompleted', 'true');
}, listener);

const mockFollowData = async (page, { withStation = false, withRecording = false, initiallyFollowing = true } = {}) => {
  let following = initiallyFollowing;
  await page.route('**/api/follows/me/creators**', (route) =>
    route.fulfill({ json: { data: { following: following ? [creator] : [] } } }));
  await page.route('**/api/follows/me/stations**', (route) =>
    route.fulfill({ json: { data: { stations: withStation ? [station] : [] } } }));
  await page.route('**/api/follows/users/' + creatorId, (route) => {
    if (route.request().method() === 'POST') following = true;
    if (route.request().method() === 'DELETE') following = false;
    return route.fulfill({ json: { data: { following } } });
  });
  await page.route('**/api/audio?*', (route) => {
    const userId = new URL(route.request().url()).searchParams.get('userId');
    const tracks = withRecording && userId === creatorId ? [recording] : [];
    return route.fulfill({ json: { data: tracks } });
  });
  await page.route('**/api/listener/dashboard**', (route) =>
    route.fulfill({ json: { data: { liveNow: [], upcoming: [], continueListening: [] } } }));
  return { isFollowing: () => following };
};

test('Following shows creator subscriptions without any new recordings or followed Channels', async ({ page }) => {
  await authenticate(page);
  await mockFollowData(page);
  await page.goto('/listen');

  const homeFollowing = page.locator('.listener-v2-followed-panel');
  await expect(homeFollowing.getByRole('button', { name: 'Open Pastor Emmanuel' })).toBeVisible();
  await expect(homeFollowing.getByText('No other recordings from the creators you follow are available here yet.')).toBeVisible();
  await expect(homeFollowing.getByText('No new recordings yet.')).toHaveCount(0);
  await expect(homeFollowing.getByRole('button', { name: 'Find creators' })).toHaveCount(0);

  await homeFollowing.getByRole('button', { name: 'View all' }).click();
  await expect(page).toHaveURL(/\/listen\/following$/);
  await expect(page.getByRole('heading', { name: 'Creators you follow' })).toBeVisible();
  await expect(page.locator('.listener-v2-creator-card')).toContainText('Pastor Emmanuel');
  await expect(page.getByText('No creators or Channels followed yet')).toHaveCount(0);
});

test('Following combines creator and Channel follows, and displays available recordings', async ({ page }) => {
  await authenticate(page);
  await mockFollowData(page, { withStation: true, withRecording: true });
  await page.goto('/listen/following');

  await expect(page.getByRole('heading', { name: 'Channels you follow' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Layers of Truth' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Creators you follow' })).toBeVisible();
  await expect(page.locator('.listener-v2-creator-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Play Thursday Bible Study' })).toBeVisible();
});

test('Following refreshes immediately after a confirmed creator follow action', async ({ page }) => {
  await authenticate(page);
  await mockFollowData(page, { initiallyFollowing: false });
  await page.goto('/listen');

  const homeFollowing = page.locator('.listener-v2-followed-panel');
  await expect(homeFollowing.getByRole('button', { name: 'Find creators' })).toBeVisible();

  await page.evaluate(async (id) => {
    const { default: followService } = await import('/src/services/followService.js');
    await followService.followCreator(id);
  }, creatorId);

  await expect(homeFollowing.getByRole('button', { name: 'Open Pastor Emmanuel' })).toBeVisible();
  await homeFollowing.getByRole('button', { name: 'View all' }).click();
  await expect(page.locator('.listener-v2-creator-card')).toContainText('Pastor Emmanuel');
});
