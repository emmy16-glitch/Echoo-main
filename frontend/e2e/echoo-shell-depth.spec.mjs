import { test, expect } from 'playwright/test';

const listenerUser = {
  id: '507f1f77bcf86cd799439012',
  _id: '507f1f77bcf86cd799439012',
  username: 'echolistener',
  displayName: 'Echoo Listener',
  email: 'listener@example.test',
  userType: 'listener',
  roles: ['listener'],
  onboardingCompleted: true,
  profileCompleted: true,
};

const creatorUser = {
  id: '507f1f77bcf86cd799439011',
  _id: '507f1f77bcf86cd799439011',
  username: 'echoocreator',
  displayName: 'Echoo Creator',
  email: 'creator@example.test',
  userType: 'creator',
  roles: ['listener', 'creator'],
  onboardingCompleted: true,
  profileCompleted: true,
  creatorProfile: { creatorType: 'individual', artistName: 'Echoo Creator' },
};

const authenticate = async (page, role) => {
  const user = role === 'creator' ? creatorUser : listenerUser;
  await page.addInitScript(({ nextUser, nextRole }) => {
    localStorage.setItem('accessToken', `${nextRole}-token`);
    localStorage.setItem('token', `${nextRole}-token`);
    localStorage.setItem('refreshToken', `${nextRole}-refresh-token`);
    localStorage.setItem('user', JSON.stringify(nextUser));
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooActiveExperience', nextRole);
    if (nextRole === 'creator') localStorage.setItem('creatorSetup', JSON.stringify({ type: 'individual', name: nextUser.displayName }));
  }, { nextUser: user, nextRole: role });
};

const assertShellIntegrity = async (page, label) => {
  const geometry = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    mains: [...document.querySelectorAll('main')].filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }).length,
  }));
  expect(geometry.scrollWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(geometry.clientWidth + 2);
  expect(geometry.mains, `${label}: duplicate main landmarks`).toBeLessThanOrEqual(1);
};

test('Listener canonical routes stay inside one ListenerV2 shell', async ({ page }) => {
  await authenticate(page, 'listener');

  for (const route of [
    '/listen',
    '/listen/channels',
    '/listen/search?q=Echoo',
    '/listen/following',
    '/listen/library',
    '/listen/settings',
  ]) {
    await page.goto(route);
    await expect(page.locator('.listener-v2-root')).toHaveCount(1);
    await assertShellIntegrity(page, route);
  }

  await page.goto('/listen/channels');
  await expect(page.getByRole('heading', { name: 'Channels' })).toBeVisible();
  await expect(page.getByPlaceholder('Search Channels...')).toBeVisible();
});

test('Creator shell exposes only the current six primary workspaces', async ({ page }) => {
  await authenticate(page, 'creator');
  await page.goto('/creator-studio');

  for (const label of ['Broadcast', 'Channel', 'Recordings', 'Collections', 'Schedule Events', 'Analytics']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }

  for (const obsolete of ['Home', 'Stations', 'Audio', 'Audience']) {
    await expect(page.getByRole('button', { name: obsolete, exact: true })).toHaveCount(0);
  }

  const destinations = [
    ['Broadcast', /\/creator-studio\/?$/],
    ['Channel', /\/creator-studio\/channels$/],
    ['Recordings', /\/creator-studio\/recordings$/],
    ['Collections', /\/creator-studio\/collections$/],
    ['Schedule Events', /\/creator-studio\/schedule-events$/],
    ['Analytics', /\/creator-studio\/analytics$/],
  ];

  for (const [label, route] of destinations) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page).toHaveURL(route);
    await assertShellIntegrity(page, `Creator ${label}`);
  }
});

test('legacy Listener Station URLs remain compatible but current UI emits Channel URLs', async ({ page }) => {
  await authenticate(page, 'listener');

  await page.goto('/listen/stations/507f1f77bcf86cd799439021');
  await expect(page).toHaveURL(/\/listen\/stations\/507f1f77bcf86cd799439021$/);
  await expect(page.locator('.listener-v2-root')).toHaveCount(1);

  await page.goto('/listen/channels');
  const channelCard = page.locator('.listener-v2-station-card .listener-v2-station-meta button').first();
  await expect(channelCard).toBeVisible();
  await channelCard.click();
  await expect(page).toHaveURL(/\/listen\/channels\/507f1f77bcf86cd799439021$/);
});
