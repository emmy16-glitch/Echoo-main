import { expect, test } from 'playwright/test';

const creator = {
  id: '507f1f77bcf86cd799439099',
  _id: '507f1f77bcf86cd799439099',
  username: 'echoocreator',
  displayName: 'Echoo Creator',
  email: 'creator@example.test',
  userType: 'creator',
  roles: ['listener', 'creator'],
  onboardingCompleted: true,
  profileCompleted: true,
  creatorProfile: {
    creatorType: 'individual',
    category: 'Technology',
    artistName: 'Echoo Creator',
    isApproved: true,
  },
};

const station = {
  id: '507f1f77bcf86cd799439001',
  _id: '507f1f77bcf86cd799439001',
  slug: 'my-station',
  name: 'My Station',
  description: 'My Station live conversations',
  category: 'Technology',
  isPublic: true,
  isLive: true,
  listenerCount: 500,
  owner: creator,
};

const fulfill = (route, data) => route.fulfill({ json: { data } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((user) => {
    localStorage.setItem('accessToken', 'creator-token');
    localStorage.setItem('token', 'creator-token');
    localStorage.setItem('refreshToken', 'creator-refresh-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooActiveExperience', 'creator');
    localStorage.removeItem('echooRole');
  }, creator);

  await page.route('**/api/auth/me', (route) => fulfill(route, { user: creator }));
  await page.route('**/api/stations/mine/all**', (route) => fulfill(route, [station]));
  await page.route('**/api/broadcasts/mine/all**', (route) => fulfill(route, []));
  await page.route('**/api/studio/**', (route) => fulfill(route, {}));
  await page.route('**/api/**', (route) => route.fallback());
});

test('Channel is the canonical creator station surface', async ({ page }) => {
  await page.goto('/creator-studio/channels');

  await expect(page.getByRole('heading', { name: 'Channel', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Channel', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'My Station', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Channel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View as Listener' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy Channel link' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('echooRole'))).toBeNull();
});

test('Creator navigation moves between Broadcast and Channel without losing account or route state', async ({ page }) => {
  await page.goto('/creator-studio/channels');
  await expect(page.getByRole('heading', { name: 'Channel', level: 1 })).toBeVisible();

  const shellGeometry = async () => page.evaluate(() => {
    const sidebarElement = document.querySelector('.studio-sidebar');
    const topbarElement = document.querySelector('.studio-topbar-final');
    const viewElement = document.querySelector('.studio-view');
    if (!sidebarElement || !topbarElement || !viewElement) throw new Error('Creator shell did not finish rendering.');
    const sidebar = sidebarElement.getBoundingClientRect();
    const topbar = topbarElement.getBoundingClientRect();
    const view = viewElement.getBoundingClientRect();
    return {
      sidebarWidth: Math.round(sidebar.width),
      topbarHeight: Math.round(topbar.height),
      viewLeft: Math.round(view.left),
      viewPaddingLeft: Math.round(parseFloat(getComputedStyle(viewElement).paddingLeft) || 0),
    };
  });
  const channelGeometry = await shellGeometry();

  await page.getByRole('button', { name: 'Broadcast', exact: true }).click();
  await expect(page).toHaveURL(/\/creator-studio$/);
  await expect(page.getByRole('region', { name: 'Broadcast workstation' })).toBeVisible();
  expect(await shellGeometry()).toEqual(channelGeometry);

  await page.getByRole('button', { name: 'Channel', exact: true }).click();
  await expect(page).toHaveURL(/\/creator-studio\/channels$/);
  await expect(page.getByRole('heading', { name: 'Channel', level: 1 })).toBeVisible();
  expect(await shellGeometry()).toEqual(channelGeometry);

  await expect.poll(() => page.evaluate(() => ({
    token: localStorage.getItem('accessToken'),
    experience: localStorage.getItem('echooActiveExperience'),
    userId: JSON.parse(localStorage.getItem('user') || '{}').id,
  }))).toEqual({
    token: 'creator-token',
    experience: 'creator',
    userId: creator.id,
  });
});

test('Channel remains usable without horizontal overflow on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/creator-studio/channels');

  await expect(page.getByRole('heading', { name: 'Channel', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy Channel link' })).toBeVisible();
  const mobileShell = await page.evaluate(() => {
    const navigation = document.querySelector('.studio-navigation');
    const items = Array.from(document.querySelectorAll('.studio-navigation .studio-nav-item'));
    const topbar = document.querySelector('.studio-topbar-final');
    const toolbar = document.querySelector('.echoo-account-toolbar');
    const box = (node) => node?.getBoundingClientRect();
    const topbarBox = box(topbar);
    const toolbarBox = box(toolbar);
    return {
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      navigationScrolls: navigation.scrollWidth > navigation.clientWidth,
      itemWidths: items.map((item) => Math.round(box(item)?.width || 0)),
      labelsVisible: items.every((item) => getComputedStyle(item.querySelector('.studio-nav-label')).display !== 'none'),
      topbarContained: Boolean(
        topbarBox && toolbarBox &&
        toolbarBox.left >= topbarBox.left - 1 &&
        toolbarBox.right <= topbarBox.right + 1
      ),
    };
  });
  expect(mobileShell.pageOverflow).toBe(false);
  expect(mobileShell.navigationScrolls).toBe(true);
  expect(mobileShell.itemWidths.every((width) => width >= 78)).toBe(true);
  expect(mobileShell.labelsVisible).toBe(true);
  expect(mobileShell.topbarContained).toBe(true);
});

test('completed Channel cards describe a saved replay, not an active recording', async ({ page }) => {
  await page.route('**/api/broadcasts/mine/all**', (route) => fulfill(route, [{
    id: '507f1f77bcf86cd799439088',
    title: 'Finished Sunday show',
    status: 'completed',
    station: station.id,
    replayAudio: { id: '507f1f77bcf86cd799439077' },
    startTime: '2026-09-21T08:00:00.000Z',
    duration: 240,
  }]));
  await page.goto('/creator-studio/channels');

  await expect(page.getByText('REPLAY', { exact: true })).toBeVisible();
  await expect(page.getByText('Replay ready', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open replay' })).toBeVisible();
  await expect(page.getByText('RECORDING', { exact: true })).toHaveCount(0);
});

test('Channel popup stays compact, centered, and fully reachable across phone and short desktop viewports', async ({ page }) => {
  await page.goto('/creator-studio/channels');
  await page.getByRole('button', { name: 'Edit Channel' }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit Channel' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 640 },
    { width: 834, height: 720 },
    { width: 1440, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    const layout = await page.evaluate(() => {
      const modal = document.querySelector('.est-form')?.getBoundingClientRect();
      const backdrop = document.querySelector('.est-modal-backdrop')?.getBoundingClientRect();
      const actions = document.querySelector('.est-form-actions')?.getBoundingClientRect();
      const nav = document.querySelector('.studio-sidebar');
      return {
        modal: modal && { left: modal.left, top: modal.top, right: modal.right, bottom: modal.bottom, width: modal.width, height: modal.height },
        backdrop: backdrop && { left: backdrop.left, top: backdrop.top, right: backdrop.right, bottom: backdrop.bottom },
        actions: actions && { top: actions.top, bottom: actions.bottom },
        modalZ: Number(getComputedStyle(document.querySelector('.est-modal-backdrop')).zIndex),
        navZ: nav ? Number(getComputedStyle(nav).zIndex) || 0 : 0,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    expect(layout.overflow).toBe(false);
    expect(layout.backdrop).toEqual({ left: 0, top: 0, right: viewport.width, bottom: viewport.height });
    expect(layout.modal.left).toBeGreaterThanOrEqual(6);
    expect(layout.modal.top).toBeGreaterThanOrEqual(6);
    expect(layout.modal.right).toBeLessThanOrEqual(viewport.width - 6);
    expect(layout.modal.bottom).toBeLessThanOrEqual(viewport.height - 6);
    expect(layout.modal.width).toBeLessThanOrEqual(620);
    expect(layout.modal.height).toBeLessThanOrEqual(640);
    expect(layout.actions.top).toBeGreaterThanOrEqual(layout.modal.top);
    expect(layout.actions.bottom).toBeLessThanOrEqual(layout.modal.bottom + 1);
    expect(layout.modalZ).toBeGreaterThan(layout.navZ);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
