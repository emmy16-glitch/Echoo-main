import { test, expect } from 'playwright/test';

const listenerUser = {
  id: '507f1f77bcf86cd799439012',
  _id: '507f1f77bcf86cd799439012',
  username: 'echolistener',
  displayName: 'Echoo Listener With A Long Display Name',
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
  displayName: 'Echoo Creator With A Long Display Name',
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
    if (nextRole === 'creator') {
      localStorage.setItem('creatorSetup', JSON.stringify({ type: 'individual', name: nextUser.displayName }));
    }
  }, { nextUser: user, nextRole: role });
};

const settle = async (page, ms = 350) => {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(ms);
};

const assertNoDocumentOverflow = async (page, label) => {
  const geometry = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth, `${label}: document overflowed horizontally`).toBeLessThanOrEqual(geometry.innerWidth + 2);
};

const json = async (route, status, body) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const data = (value) => ({ data: value, timestamp: new Date().toISOString() });

test('Channels browse survives repeated reflow and opens the canonical Channel URL', async ({ page }, testInfo) => {
  await authenticate(page, 'listener');
  await page.goto('/listen/channels');
  await settle(page);

  await expect(page.getByRole('heading', { name: 'Channels' })).toBeVisible();
  const search = page.getByPlaceholder('Search Channels...');
  await search.fill('Echoo');

  for (const state of [
    { width: 390, height: 844, label: 'portrait phone' },
    { width: 844, height: 390, label: 'landscape phone' },
    { width: 1024, height: 768, label: 'tablet' },
    { width: 1440, height: 1000, label: 'desktop' },
    { width: 390, height: 844, label: 'portrait return' },
  ]) {
    await page.setViewportSize({ width: state.width, height: state.height });
    await page.waitForTimeout(120);
    await assertNoDocumentOverflow(page, `${testInfo.project.name} ${state.label}`);
    await expect(search).toHaveValue('Echoo');
  }

  const cardTitle = page.locator('.listener-v2-station-card .listener-v2-station-meta button').first();
  await expect(cardTitle).toBeVisible();
  await cardTitle.click();
  await expect(page).toHaveURL(/\/listen\/channels\/507f1f77bcf86cd799439021$/);
});

test('Following has no dead More control and non-live Channels open canonically', async ({ page }) => {
  await authenticate(page, 'listener');
  const channel = {
    id: '507f1f77bcf86cd799439099',
    _id: '507f1f77bcf86cd799439099',
    name: 'Stateful QA Channel',
    category: 'Technology',
    description: 'A non-live Channel used for route testing.',
    isPublic: true,
    isLive: false,
    followerCount: 42,
    owner: creatorUser,
  };

  await page.route('**/api/follows/me/stations', (route) => json(route, 200, data({ stations: [channel] })));
  await page.route('**/api/stations/507f1f77bcf86cd799439099', (route) => json(route, 200, data(channel)));

  await page.goto('/listen/following');
  await expect(page.getByRole('heading', { name: 'Following' })).toBeVisible();
  await expect(page.getByRole('button', { name: /More options for/i })).toHaveCount(0);

  await page.getByRole('button', { name: 'Open Stateful QA Channel' }).click();
  await expect(page).toHaveURL(/\/listen\/channels\/507f1f77bcf86cd799439099$/);
});

test('Broadcast workstation remains mounted and usable through repeated viewport changes', async ({ page }, testInfo) => {
  await authenticate(page, 'creator');
  await page.goto('/creator-studio');
  await settle(page);

  const workstation = page.locator('.ec2-broadcast').first();
  const mixer = page.locator('.eam-approved-mixer').first();
  await expect(workstation).toBeVisible();
  await expect(mixer).toBeVisible();

  for (const state of [
    { width: 1440, height: 1000, label: 'desktop' },
    { width: 900, height: 720, label: 'small laptop' },
    { width: 430, height: 932, label: 'portrait phone' },
    { width: 932, height: 430, label: 'landscape phone' },
    { width: 1280, height: 900, label: 'desktop return' },
  ]) {
    await page.setViewportSize({ width: state.width, height: state.height });
    await page.waitForTimeout(140);
    await assertNoDocumentOverflow(page, `${testInfo.project.name} Broadcast ${state.label}`);
    await expect(workstation).toBeVisible();
    await expect(mixer).toBeVisible();
    expect(await page.locator('.eam-approved-strip:visible').count()).toBeGreaterThanOrEqual(3);
  }
});

test('History focus refresh does not multiply after repeated mounts', async ({ page }) => {
  await authenticate(page, 'listener');

  let historyRequests = 0;
  page.on('request', (request) => {
    try {
      const url = new URL(request.url());
      if (url.pathname === '/api/history') historyRequests += 1;
    } catch {
      // Non-HTTP URLs are irrelevant to this leak check.
    }
  });

  for (let index = 0; index < 4; index += 1) {
    await page.goto('/listen/history');
    await settle(page, 160);
    await page.goto('/listen/downloads');
    await settle(page, 100);
  }

  await page.goto('/listen/history');
  await settle(page, 220);
  historyRequests = 0;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(350);
  expect(historyRequests, 'one focus event should cause at most one History refresh after repeated mounts').toBeLessThanOrEqual(1);
});
