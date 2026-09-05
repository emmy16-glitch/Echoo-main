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

const settle = async (page) => {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(550);
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
  };
});

const assertNoHorizontalOverflow = async (page, label) => {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth, `${label}: document overflow`).toBeLessThanOrEqual(dimensions.clientWidth + 2);
};

const assertKeyboardFocusInsideViewport = async (page, projectName, presses = 24) => {
  const viewport = page.viewportSize();
  for (let index = 0; index < presses; index += 1) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(25);
    const focused = await page.evaluate(() => {
      const node = document.activeElement;
      if (!node || node === document.body || node === document.documentElement) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        name: node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 60) || node.tagName,
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
    expect(focused.left, `${projectName}: focus left viewport (${focused.name})`).toBeGreaterThanOrEqual(-2);
    expect(focused.right, `${projectName}: focus right viewport (${focused.name})`).toBeLessThanOrEqual((viewport?.width || 0) + 2);
    expect(focused.bottom, `${projectName}: focus above viewport (${focused.name})`).toBeGreaterThanOrEqual(-2);
    expect(focused.top, `${projectName}: focus below viewport (${focused.name})`).toBeLessThanOrEqual((viewport?.height || 0) + 2);
  }
};

test('run6: current Channel cards preserve title and Follow geometry', async ({ page }, testInfo) => {
  await authenticate(page, 'listener');
  await page.goto('/listen/search?q=Echoo');
  await settle(page);

  const cards = page.locator('.listener-v2-station-card:visible');
  expect(await cards.count(), `${testInfo.project.name}: expected Channel cards`).toBeGreaterThan(0);

  for (let index = 0; index < await cards.count(); index += 1) {
    const card = cards.nth(index);
    const title = card.locator('.listener-v2-station-meta strong:visible').first();
    const follow = card.locator('.listener-v2-follow-button:visible').first();
    const cardRect = await rectOf(card);

    expect(cardRect.width, `${testInfo.project.name}: Channel card collapsed`).toBeGreaterThanOrEqual(180);
    expect(cardRect.writingMode, `${testInfo.project.name}: Channel card writing mode`).toBe('horizontal-tb');

    if (await title.count()) {
      const titleRect = await rectOf(title);
      expect(titleRect.width, `${testInfo.project.name}: Channel title collapsed`).toBeGreaterThanOrEqual(60);
      expect(titleRect.height, `${testInfo.project.name}: Channel title became vertical`).toBeLessThanOrEqual(80);
    }

    if (await follow.count()) {
      const followRect = await rectOf(follow);
      expect(followRect.width, `${testInfo.project.name}: Follow action collapsed`).toBeGreaterThanOrEqual(60);
      expect(followRect.height, `${testInfo.project.name}: Follow action too short`).toBeGreaterThanOrEqual(30);
    }
  }

  await assertNoHorizontalOverflow(page, `${testInfo.project.name} Listener Channels`);
  await assertKeyboardFocusInsideViewport(page, `${testInfo.project.name} Listener Channels`, 22);
});

test('run6: current Broadcast workstation and mixer remain usable at every breakpoint', async ({ page }, testInfo) => {
  await authenticate(page, 'creator');
  await page.goto('/creator-studio');
  await settle(page);

  const workstation = page.locator('.ec2-broadcast:visible').first();
  const mixer = page.locator('.eam-approved-mixer:visible').first();
  await expect(workstation).toBeVisible();
  await expect(mixer).toBeVisible();

  const workstationRect = await rectOf(workstation);
  const mixerRect = await rectOf(mixer);
  expect(workstationRect.width, `${testInfo.project.name}: Broadcast workstation collapsed`).toBeGreaterThanOrEqual(260);
  expect(mixerRect.width, `${testInfo.project.name}: audio mixer collapsed`).toBeGreaterThanOrEqual(240);
  expect(mixerRect.writingMode, `${testInfo.project.name}: mixer rendered vertically`).toBe('horizontal-tb');

  const strips = page.locator('.eam-approved-strip:visible');
  expect(await strips.count(), `${testInfo.project.name}: expected mixer source strips`).toBeGreaterThanOrEqual(3);
  for (let index = 0; index < await strips.count(); index += 1) {
    const stripRect = await rectOf(strips.nth(index));
    expect(stripRect.width, `${testInfo.project.name}: mixer strip ${index + 1} collapsed`).toBeGreaterThanOrEqual(100);
    expect(stripRect.writingMode, `${testInfo.project.name}: mixer strip ${index + 1} vertical`).toBe('horizontal-tb');
  }

  const actionButtons = page.locator('.eam-approved-actions button:visible, .eam-approved-master button:visible');
  for (let index = 0; index < await actionButtons.count(); index += 1) {
    const action = actionButtons.nth(index);
    const rect = await rectOf(action);
    expect(rect.width, `${testInfo.project.name}: mixer action ${index + 1} collapsed`).toBeGreaterThanOrEqual(28);
    expect(rect.height, `${testInfo.project.name}: mixer action ${index + 1} too short`).toBeGreaterThanOrEqual(28);
  }

  await assertNoHorizontalOverflow(page, `${testInfo.project.name} Broadcast`);
  await assertKeyboardFocusInsideViewport(page, `${testInfo.project.name} Broadcast`, 28);
});
