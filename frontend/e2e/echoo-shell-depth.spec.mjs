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
  roles: ['creator'],
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
    localStorage.setItem('echooRole', nextRole);
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    if (nextRole === 'creator') {
      localStorage.setItem('creatorSetup', JSON.stringify({ type: 'individual', name: nextUser.displayName }));
    }
  }, { nextUser: user, nextRole: role });
};

const settle = async (page) => {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(600);
};

const fontPx = async (locator) => locator.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize || '0'));

const assertInsideViewport = async (locator, viewportWidth) => {
  const geometry = await locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      display: style.display,
      visibility: style.visibility,
    };
  });
  expect(geometry.display).not.toBe('none');
  expect(geometry.visibility).not.toBe('hidden');
  expect(geometry.width).toBeGreaterThanOrEqual(28);
  expect(geometry.height).toBeGreaterThanOrEqual(28);
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(viewportWidth + 1);
};

test('Listener persistent transport and Stations geometry stay usable', async ({ page }, testInfo) => {
  await authenticate(page, 'listener');
  await page.goto('/listen/stations');
  await settle(page);

  const viewportWidth = page.viewportSize()?.width || 0;
  const transport = page.locator('.echoo-listener-v2-shell .layout-player-controls').first();
  await expect(transport).toBeVisible();

  const visibleTransportButtons = transport.locator('button:visible');
  const visibleCount = await visibleTransportButtons.count();
  expect(visibleCount, `${testInfo.project.name}: expected usable transport controls`).toBeGreaterThanOrEqual(viewportWidth <= 760 ? 2 : 3);

  for (let index = 0; index < visibleCount; index += 1) {
    await assertInsideViewport(visibleTransportButtons.nth(index), viewportWidth);
  }

  const timeLabels = page.locator('.echoo-listener-v2-shell .layout-player-volume > span:visible');
  for (let index = 0; index < await timeLabels.count(); index += 1) {
    expect(await fontPx(timeLabels.nth(index)), `${testInfo.project.name}: player time label must be >=10px`).toBeGreaterThanOrEqual(10);
  }

  const stationName = page.locator('.stations-top-overlay strong:visible').first();
  if (await stationName.count()) {
    const rect = await stationName.boundingBox();
    expect(rect?.width || 0, `${testInfo.project.name}: top station name was squeezed into a sliver`).toBeGreaterThanOrEqual(80);
    expect(rect?.height || 0, `${testInfo.project.name}: top station name wrapped into an unusably tall control`).toBeLessThanOrEqual(80);
  }

  const topRows = page.locator('.stations-top-card:visible');
  for (let index = 0; index < await topRows.count(); index += 1) {
    const rect = await topRows.nth(index).boundingBox();
    expect(rect?.width || 0, `${testInfo.project.name}: top station row collapsed`).toBeGreaterThanOrEqual(Math.min(220, viewportWidth - 40));
    expect(rect?.height || 0, `${testInfo.project.name}: top station card became excessively tall`).toBeLessThanOrEqual(240);
  }
});

test('Creator shell navigation and operational labels remain readable', async ({ page }, testInfo) => {
  await authenticate(page, 'creator');
  await page.goto('/creator-studio');
  await settle(page);

  const nav = page.locator('.studio-navigation').first();
  await expect(nav).toBeVisible();
  const labels = nav.locator('.studio-nav-item > span:last-child:visible');
  expect(await labels.count()).toBeGreaterThan(0);
  for (let index = 0; index < await labels.count(); index += 1) {
    expect(await fontPx(labels.nth(index)), `${testInfo.project.name}: creator nav label below 10px`).toBeGreaterThanOrEqual(10);
  }

  const liveBadge = page.locator('.ehome-primary-station-art > span:visible').filter({ hasText: /^LIVE$/ }).first();
  if (await liveBadge.count()) {
    expect(await fontPx(liveBadge), `${testInfo.project.name}: LIVE badge below 10px`).toBeGreaterThanOrEqual(10);
  }

  const broadcastButton = page.locator('button').filter({ hasText: 'Broadcast Studio' }).first();
  if (await broadcastButton.count()) {
    await broadcastButton.evaluate((node) => node.click());
    await page.waitForTimeout(500);
  }

  for (const selector of [
    '.ecbs-monitor-card span > strong',
    '.ecbs-monitor-card span > small',
    '.ecbs-transcript-ready-card > header > span',
    '.ecbs-setup-action small',
  ]) {
    const nodes = page.locator(`${selector}:visible`);
    for (let index = 0; index < await nodes.count(); index += 1) {
      expect(await fontPx(nodes.nth(index)), `${testInfo.project.name}: ${selector} below 10px`).toBeGreaterThanOrEqual(10);
    }
  }

  const sourceActions = page.locator('.ecbs-source > .ecbs-connect:visible');
  for (let index = 0; index < await sourceActions.count(); index += 1) {
    const action = sourceActions.nth(index);
    const label = (await action.textContent())?.trim() || `source action ${index + 1}`;
    const rect = await action.boundingBox();
    expect(rect?.width || 0, `${testInfo.project.name}: Broadcast Studio action "${label}" is too narrow`).toBeGreaterThanOrEqual(80);
    expect(rect?.height || 0, `${testInfo.project.name}: Broadcast Studio action "${label}" is too short`).toBeGreaterThanOrEqual(36);
  }
});
