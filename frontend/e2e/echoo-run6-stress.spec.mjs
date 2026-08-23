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
  await page.waitForTimeout(650);
};

const rectOf = async (locator) => locator.evaluate((node) => {
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    display: style.display,
    writingMode: style.writingMode,
    overflowX: style.overflowX,
  };
});

const assertKeyboardFocusInsideViewport = async (page, projectName, presses = 28) => {
  const viewport = page.viewportSize();
  for (let index = 0; index < presses; index += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const node = document.activeElement;
      if (!node || node === document.body || node === document.documentElement) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        tag: node.tagName,
        name: node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent?.trim().slice(0, 50) || '',
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        display: style.display,
        visibility: style.visibility,
      };
    });
    if (!focused || focused.display === 'none' || focused.visibility === 'hidden' || focused.width <= 0 || focused.height <= 0) continue;
    expect(focused.left, `${projectName}: keyboard focus left viewport (${focused.tag} ${focused.name})`).toBeGreaterThanOrEqual(-2);
    expect(focused.right, `${projectName}: keyboard focus right of viewport (${focused.tag} ${focused.name})`).toBeLessThanOrEqual((viewport?.width || 0) + 2);
    /* Vertical focus may legitimately be below the fold after Tab scrolls it into view.
       Require the browser to have scrolled it into the visible viewport. */
    expect(focused.bottom, `${projectName}: keyboard focus above viewport (${focused.tag} ${focused.name})`).toBeGreaterThanOrEqual(-2);
    expect(focused.top, `${projectName}: keyboard focus below viewport (${focused.tag} ${focused.name})`).toBeLessThanOrEqual((viewport?.height || 0) + 2);
  }
};

test('run6: Top Stations title and Follow action never compete for geometry', async ({ page }, testInfo) => {
  await authenticate(page, 'listener');
  await page.goto('/listen/stations');
  await settle(page);

  const rows = page.locator('.ls-top-row:visible');
  expect(await rows.count(), `${testInfo.project.name}: expected Top Stations rows`).toBeGreaterThan(0);

  for (let index = 0; index < await rows.count(); index += 1) {
    const row = rows.nth(index);
    const name = row.locator('.ls-top-name:visible');
    const follow = row.locator('.ls-top-follow:visible');
    if (!(await name.count()) || !(await follow.count())) continue;

    const rowRect = await rectOf(row);
    const nameRect = await rectOf(name);
    const followRect = await rectOf(follow);

    expect(rowRect.display, `${testInfo.project.name}: Top Stations row must use the repaired grid`).toBe('grid');
    expect(nameRect.width, `${testInfo.project.name}: station title collapsed`).toBeGreaterThanOrEqual(80);
    expect(nameRect.height, `${testInfo.project.name}: station title became vertical text`).toBeLessThanOrEqual(48);
    expect(followRect.width, `${testInfo.project.name}: Follow action collapsed`).toBeGreaterThanOrEqual(70);
    expect(followRect.height, `${testInfo.project.name}: Follow action too short`).toBeGreaterThanOrEqual(32);
    expect(followRect.top + 2, `${testInfo.project.name}: Follow action still competes with title row`).toBeGreaterThanOrEqual(nameRect.bottom);
    expect(rowRect.height, `${testInfo.project.name}: Top Stations row became excessively tall`).toBeLessThanOrEqual(100);
  }

  await assertKeyboardFocusInsideViewport(page, `${testInfo.project.name} Listener Stations`, 24);
});

test('run6: Broadcast Studio uses current main/rail architecture at every breakpoint', async ({ page }, testInfo) => {
  await authenticate(page, 'creator');
  await page.goto('/creator-studio');
  await settle(page);

  const broadcastButton = page.locator('button').filter({ hasText: 'Broadcast Studio' }).first();
  await expect(broadcastButton).toBeVisible();
  await broadcastButton.click();
  await settle(page);

  const layout = page.locator('.ebsx.setup-page .ebsx-setup-layout:visible').first();
  const main = page.locator('.ebsx.setup-page .ebsx-setup-main:visible').first();
  const rail = page.locator('.ebsx.setup-page .ecbs-setup-rail:visible').first();
  await expect(layout).toBeVisible();
  await expect(main).toBeVisible();
  await expect(rail).toBeVisible();

  const layoutRect = await rectOf(layout);
  const mainRect = await rectOf(main);
  const railRect = await rectOf(rail);

  expect(layoutRect.display, `${testInfo.project.name}: setup parent must be a real grid`).toBe('grid');
  expect(mainRect.display, `${testInfo.project.name}: current setup-main must never revert to display:contents`).not.toBe('contents');
  expect(railRect.display, `${testInfo.project.name}: current setup-rail must never revert to display:contents`).not.toBe('contents');
  expect(mainRect.width, `${testInfo.project.name}: setup-main collapsed`).toBeGreaterThanOrEqual(Math.min(260, layoutRect.width * 0.72));

  const sideBySide = Math.abs(mainRect.top - railRect.top) < 20;
  if (sideBySide) {
    expect(mainRect.width / layoutRect.width, `${testInfo.project.name}: legacy three-column grid is stealing main workspace width`).toBeGreaterThan(0.52);
    expect(railRect.width, `${testInfo.project.name}: setup rail grew beyond intended width`).toBeLessThanOrEqual(380);
  } else {
    expect(mainRect.width / layoutRect.width, `${testInfo.project.name}: stacked main should use nearly full width`).toBeGreaterThan(0.88);
    expect(railRect.width / layoutRect.width, `${testInfo.project.name}: stacked rail should use nearly full width`).toBeGreaterThan(0.88);
  }

  const sourceCards = page.locator('.ecbs-source:visible');
  expect(await sourceCards.count(), `${testInfo.project.name}: expected audio source cards`).toBeGreaterThanOrEqual(4);
  for (let index = 0; index < await sourceCards.count(); index += 1) {
    const cardRect = await rectOf(sourceCards.nth(index));
    expect(cardRect.width, `${testInfo.project.name}: source card ${index + 1} collapsed`).toBeGreaterThanOrEqual(118);
  }

  const sourceActions = page.locator('.ecbs-source > .ecbs-connect:visible');
  for (let index = 0; index < await sourceActions.count(); index += 1) {
    const action = sourceActions.nth(index);
    const label = (await action.textContent())?.trim() || `source ${index + 1}`;
    const actionRect = await rectOf(action);
    expect(actionRect.width, `${testInfo.project.name}: ${label} collapsed`).toBeGreaterThanOrEqual(92);
    expect(actionRect.height, `${testInfo.project.name}: ${label} too short`).toBeGreaterThanOrEqual(36);
    expect(actionRect.writingMode, `${testInfo.project.name}: ${label} rendered vertically`).toBe('horizontal-tb');
  }

  const audioModes = page.locator('.ecbs-audio-modes button:visible');
  for (let index = 0; index < await audioModes.count(); index += 1) {
    const modeRect = await rectOf(audioModes.nth(index));
    expect(modeRect.width, `${testInfo.project.name}: audio-mode card collapsed`).toBeGreaterThanOrEqual(118);
    expect(modeRect.height, `${testInfo.project.name}: audio-mode card became excessively tall`).toBeLessThanOrEqual(150);
  }

  await assertKeyboardFocusInsideViewport(page, `${testInfo.project.name} Broadcast Studio`, 30);
});
