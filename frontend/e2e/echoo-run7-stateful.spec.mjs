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

const representativeProjects = new Set([
  'mobile-390',
  'tablet-1024',
  'desktop-1440',
  'firefox-1440',
  'webkit-390',
  'webkit-1440',
]);

const clickCreatorWorkspace = async (page, label) => {
  const button = page.locator('button').filter({ hasText: label }).first();
  await expect(button).toBeVisible();
  await button.click();
  await page.waitForTimeout(350);
};

test('Listener Stations survives repeated portrait/landscape/desktop reflow without state loss', async ({ page }, testInfo) => {
  test.skip(!representativeProjects.has(testInfo.project.name));
  await authenticate(page, 'listener');
  await page.goto('/listen/stations');
  await settle(page);

  const search = page.getByRole('textbox', { name: 'Search stations' }).first();
  await search.fill('Echoo');

  const states = [
    { width: 390, height: 844, label: 'portrait phone' },
    { width: 844, height: 390, label: 'landscape phone' },
    { width: 1024, height: 768, label: 'tablet' },
    { width: 430, height: 932, label: 'large portrait phone' },
    { width: 1440, height: 1000, label: 'desktop' },
    { width: 390, height: 844, label: 'portrait return' },
  ];

  for (const state of states) {
    await page.setViewportSize({ width: state.width, height: state.height });
    await page.waitForTimeout(180);
    await assertNoDocumentOverflow(page, `${testInfo.project.name} ${state.label}`);
    await expect(search).toHaveValue('Echoo');

    const rows = page.locator('.ls-top-row:visible');
    for (let index = 0; index < await rows.count(); index += 1) {
      const row = rows.nth(index);
      const name = row.locator('.ls-top-name');
      const follow = row.locator('.ls-top-follow');
      if (!(await name.count()) || !(await follow.count())) continue;
      const [nameBox, followBox, rowBox] = await Promise.all([name.boundingBox(), follow.boundingBox(), row.boundingBox()]);
      expect(nameBox?.width || 0, `${state.label}: station name collapsed`).toBeGreaterThanOrEqual(80);
      expect(rowBox?.height || 0, `${state.label}: station row became excessively tall`).toBeLessThanOrEqual(150);
      if (nameBox && followBox) {
        const horizontalOverlap = Math.max(0, Math.min(nameBox.x + nameBox.width, followBox.x + followBox.width) - Math.max(nameBox.x, followBox.x));
        const verticalOverlap = Math.max(0, Math.min(nameBox.y + nameBox.height, followBox.y + followBox.height) - Math.max(nameBox.y, followBox.y));
        expect(horizontalOverlap * verticalOverlap, `${state.label}: station title overlaps Follow control`).toBe(0);
      }
    }
  }
});

test('Broadcast Studio current parent layout survives mounted reflow and preserves audio mode', async ({ page }, testInfo) => {
  test.skip(!representativeProjects.has(testInfo.project.name));
  await authenticate(page, 'creator');
  await page.goto('/creator-studio');
  await settle(page);
  await clickCreatorWorkspace(page, 'Broadcast Studio');

  const raw = page.getByRole('button', { name: /raw audio/i }).first();
  if (await raw.count()) await raw.click();

  const states = [
    { width: 1440, height: 1000, label: 'desktop' },
    { width: 900, height: 720, label: 'small laptop' },
    { width: 430, height: 932, label: 'portrait phone' },
    { width: 932, height: 430, label: 'landscape phone' },
    { width: 1280, height: 900, label: 'desktop return' },
  ];

  for (const state of states) {
    await page.setViewportSize({ width: state.width, height: state.height });
    await page.waitForTimeout(180);
    await assertNoDocumentOverflow(page, `${testInfo.project.name} ${state.label}`);

    const layout = page.locator('.ebsx.setup-page .ebsx-setup-layout').first();
    if (await layout.count()) {
      const computed = await layout.evaluate((node) => {
        const style = getComputedStyle(node);
        return { display: style.display, columns: style.gridTemplateColumns, areas: style.gridTemplateAreas };
      });
      expect(computed.display, `${state.label}: setup parent regressed to display:contents`).toBe('grid');
      expect(computed.columns, `${state.label}: setup parent has no real grid columns`).not.toBe('none');
    }

    const main = page.locator('.ebsx.setup-page .ebsx-setup-main').first();
    const rail = page.locator('.ebsx.setup-page .ecbs-setup-rail').first();
    if (await main.count()) expect((await main.boundingBox())?.width || 0, `${state.label}: setup main collapsed`).toBeGreaterThan(240);
    if (await rail.count()) expect((await rail.boundingBox())?.width || 0, `${state.label}: setup rail collapsed`).toBeGreaterThan(240);

    const sources = page.locator('.ecbs-source:visible');
    for (let index = 0; index < await sources.count(); index += 1) {
      const source = sources.nth(index);
      const box = await source.boundingBox();
      expect(box?.width || 0, `${state.label}: source card collapsed`).toBeGreaterThanOrEqual(Math.min(150, state.width - 40));
      const writingMode = await source.evaluate((node) => getComputedStyle(node).writingMode);
      expect(writingMode, `${state.label}: source card switched to vertical writing`).not.toMatch(/^vertical/);
    }

    if (await raw.count()) await expect(raw).toHaveClass(/active/);
  }
});

test('Creator Collections dialogs are modal, keyboard-contained, Escape-closeable and restore focus', async ({ page }, testInfo) => {
  test.skip(!['desktop-1440', 'firefox-1440', 'webkit-1440'].includes(testInfo.project.name));
  await authenticate(page, 'creator');
  await page.goto('/creator-studio');
  await settle(page);
  await clickCreatorWorkspace(page, 'Collections');

  const create = page.getByRole('button', { name: /create collection/i }).first();
  await expect(create).toBeVisible();
  await create.focus();
  await create.click();

  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  const labelledBy = await dialog.getAttribute('aria-labelledby');
  expect(labelledBy, 'collection dialog must be labelled by its visible heading').toBeTruthy();

  const focusables = dialog.locator('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
  expect(await focusables.count()).toBeGreaterThan(1);
  await focusables.last().focus();
  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.ecc-modal')))).toBe(true);
  await focusables.first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.ecc-modal')))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(create).toBeFocused();

  const collection = page.getByRole('button', { name: /manage a deliberately long echoo title/i }).first();
  if (!(await collection.count())) return;
  await collection.click();
  const edit = page.getByRole('button', { name: /edit details/i });
  await edit.focus();
  await edit.click();
  const editDialog = page.getByRole('dialog');
  await expect(editDialog).toBeVisible();
  await expect(editDialog).toHaveAttribute('aria-modal', 'true');
  await page.keyboard.press('Escape');
  await expect(editDialog).toHaveCount(0);
  await expect(edit).toBeFocused();
});

test('History focus refresh does not multiply after repeated mounts', async ({ page }, testInfo) => {
  test.skip(!['desktop-1440', 'firefox-1440', 'webkit-1440'].includes(testInfo.project.name));
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
    await settle(page, 180);
    await page.goto('/listen/downloads');
    await settle(page, 120);
  }

  await page.goto('/listen/history');
  await settle(page, 250);
  historyRequests = 0;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(400);
  expect(historyRequests, 'one focus event should cause at most one History refresh after repeated mounts').toBeLessThanOrEqual(1);
});

test('history first-use info coachmark is dismissible and scoped to the position control', async ({ page }, testInfo) => {
  test.skip(!['mobile-390', 'desktop-1440', 'webkit-390'].includes(testInfo.project.name));
  await authenticate(page, 'listener');
  await page.goto('/listen/history');
  await settle(page);

  const historyTip = page.locator('#history-info-onboarding');
  await expect(historyTip).toBeVisible();
  const firstPositionToggle = page.locator('.lh-row-position-toggle').first();
  await expect(firstPositionToggle).toHaveAttribute('aria-describedby', 'history-info-onboarding');
  await historyTip.getByRole('button', { name: 'Dismiss history tip' }).click();
  await expect(historyTip).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('note', { name: /tap the info icon/i })).toHaveCount(0);
});

test('visible form controls on critical settings/broadcast surfaces have programmatic names', async ({ page }, testInfo) => {
  test.skip(!['desktop-1440', 'webkit-1440'].includes(testInfo.project.name));

  const auditControls = async (scope, label) => {
    const unnamed = await scope.evaluate((root, nextLabel) => {
      const isVisible = (node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const accessibleName = (node) => {
        const aria = node.getAttribute('aria-label') || '';
        if (aria.trim()) return aria.trim();
        const labelledBy = node.getAttribute('aria-labelledby');
        if (labelledBy) {
          const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
          if (text) return text;
        }
        if (node.id) {
          const label = document.querySelector(`label[for="${CSS.escape(node.id)}"]`);
          if (label?.textContent?.trim()) return label.textContent.trim();
        }
        const wrapping = node.closest('label');
        if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();
        return '';
      };
      return [...root.querySelectorAll('input:not([type="hidden"]), select, textarea')]
        .filter(isVisible)
        .filter((node) => !accessibleName(node))
        .map((node) => `${nextLabel}: ${node.tagName.toLowerCase()}.${node.className || ''}`);
    }, label);
    expect(unnamed, `${label}: visible controls without programmatic names`).toEqual([]);
  };

  await authenticate(page, 'listener');
  await page.goto('/listen/settings');
  await settle(page);
  await auditControls(page.locator('#echoo-main-content'), 'Listener Settings');

  await page.goto('/listen/stations');
  await settle(page);
  await auditControls(page.locator('#echoo-main-content'), 'Listener Stations');

  await page.evaluate(() => {
    localStorage.setItem('user', JSON.stringify({
      id: '507f1f77bcf86cd799439011',
      _id: '507f1f77bcf86cd799439011',
      username: 'echoocreator',
      displayName: 'Echoo Creator With A Long Display Name',
      userType: 'creator',
      roles: ['creator'],
      onboardingCompleted: true,
      profileCompleted: true,
      creatorProfile: { creatorType: 'individual', artistName: 'Echoo Creator' },
    }));
    localStorage.setItem('echooRole', 'creator');
    localStorage.setItem('accessToken', 'creator-token');
    localStorage.setItem('token', 'creator-token');
    localStorage.setItem('creatorSetup', JSON.stringify({ type: 'individual', name: 'Echoo Creator With A Long Display Name' }));
  });
  await page.goto('/creator-studio');
  await settle(page);
  await clickCreatorWorkspace(page, 'Broadcast Studio');
  await auditControls(page.locator('#echoo-main-content'), 'Creator Broadcast Studio');
});

test('Listener settings saves the haptic feedback player preference', async ({ page }, testInfo) => {
  test.skip(!['mobile-390', 'desktop-1440', 'webkit-390'].includes(testInfo.project.name));
  await authenticate(page, 'listener');
  await page.goto('/listen/settings');
  await settle(page);

  const playbackSpeed = page.getByLabel('Default playback speed');
  const audioQuality = page.getByLabel('Preferred audio quality');
  await expect(playbackSpeed).toHaveValue('1');
  await expect(audioQuality).toHaveValue('auto');
  await playbackSpeed.selectOption('1.5');
  await expect(playbackSpeed).toHaveValue('1.5');
  await audioQuality.selectOption('high');
  await expect(audioQuality).toHaveValue('high');

  const hapticSwitch = page.getByRole('switch', { name: 'Haptic feedback' });
  await expect(hapticSwitch).toHaveAttribute('aria-checked', 'true');
  await hapticSwitch.click();
  await expect(hapticSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('status')).toContainText('Haptic confirmation is turned off');
});
