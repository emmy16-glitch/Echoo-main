import { expect, test } from 'playwright/test';

const CREATOR_ID = '507f1f77bcf86cd799439201';
const STATION_ID = '507f1f77bcf86cd799439202';
const BROADCAST_ID = '507f1f77bcf86cd799439203';

const creator = {
  id: CREATOR_ID,
  username: 'responsive_creator',
  displayName: 'Responsive Creator With An Intentionally Long Account Name',
  userType: 'creator',
  roles: ['listener', 'creator'],
  onboardingCompleted: true,
  profileCompleted: true,
  creatorProfile: { creatorType: 'individual', artistName: 'Responsive Creator', isApproved: true },
};

const station = {
  id: STATION_ID,
  _id: STATION_ID,
  slug: 'long-responsive-channel',
  name: 'The Intentionally Very Long Echoo Channel Name For Responsive Verification',
  description: 'A deterministic responsive test fixture.',
  category: 'Independent Music, Culture, Conversation and Community',
  isPublic: true,
  owner: creator,
};

const liveBroadcast = {
  id: BROADCAST_ID,
  _id: BROADCAST_ID,
  title: station.name,
  description: station.description,
  status: 'live',
  isLive: true,
  station,
  stationId: STATION_ID,
  creator,
  mediaState: 'audio_live',
  startedAt: new Date(Date.now() - 68_000).toISOString(),
};

const viewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

const fulfill = (route, data) => route.fulfill({ json: { data } });

const authenticate = async (page) => {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('accessToken', 'responsive-creator-token');
    localStorage.setItem('token', 'responsive-creator-token');
    localStorage.setItem('refreshToken', 'responsive-creator-refresh-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooActiveExperience', 'creator');
    localStorage.setItem('creatorSetup', JSON.stringify({ type: 'individual', name: user.displayName }));
  }, { user: creator });
};

const installRoutes = async (page, getBroadcasts) => {
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  await page.route('**/api/auth/me', (route) => fulfill(route, { user: creator }));
  await page.route('**/api/settings', (route) => fulfill(route, {}));
  await page.route('**/api/studio/content**', (route) => fulfill(route, { tracks: [], pagination: {} }));
  await page.route('**/api/stations/mine/all**', (route) => fulfill(route, [station]));
  await page.route('**/api/broadcasts/mine/all**', (route) => fulfill(route, getBroadcasts()));
  await page.route(`**/api/broadcasts/${BROADCAST_ID}/presence`, (route) => fulfill(route, {
    listenerCount: 1284,
    peakListeners: 1452,
    creatorConnected: true,
  }));
  await page.route('**/api/**', (route) => route.fallback());
};

const layoutSnapshot = (page) => page.evaluate(() => {
  const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect() || null;
  const cards = [...document.querySelectorAll('.eam-approved-strip')].map((node) => node.getBoundingClientRect());
  const rowTops = [];
  cards.forEach((card) => {
    const row = rowTops.find((entry) => Math.abs(entry.top - card.top) <= 2);
    if (row) row.count += 1;
    else rowTops.push({ top: card.top, count: 1 });
  });
  const navLabel = [...document.querySelectorAll('.studio-nav-label')]
    .find((node) => node.textContent.trim() === 'Schedule Events');
  const navTextRange = navLabel ? document.createRange() : null;
  navTextRange?.selectNodeContents(navLabel);
  const navTextRect = navTextRange?.getBoundingClientRect();
  const sidebarRect = document.querySelector('.studio-sidebar')?.getBoundingClientRect();
  const controlHeights = [...document.querySelectorAll('.eam-approved-actions button, .eam-approved-select')]
    .map((node) => node.getBoundingClientRect().height);
  const addAudio = rect('.eam-approved-add-audio');
  const goLive = rect('.eam-approved-go-live');
  return {
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    columns: Math.max(...rowTops.map((row) => row.count)),
    cardWidths: cards.map((card) => card.width),
    cardHeights: cards.map((card) => card.height),
    cardTops: cards.map((card) => card.top),
    gridBottom: rect('.eam-approved-grid')?.bottom,
    lowerTop: rect('.eam-approved-lower')?.top,
    hero: rect('.ec2-hero'),
    topbar: rect('.studio-topbar-final'),
    sidebar: rect('.studio-sidebar'),
    meter: rect('.eam-approved-stereo-meter'),
    fader: rect('.eam-approved-fader'),
    minControlHeight: Math.min(...controlHeights),
    scheduleClipped: Boolean(
      navTextRect && sidebarRect &&
      (navTextRect.left < sidebarRect.left || navTextRect.right > sidebarRect.right - 6)
    ),
    addAudio,
    goLive,
  };
});

test('Broadcast workstation compacts cleanly across the complete viewport matrix', async ({ page }) => {
  test.setTimeout(120_000);
  let broadcasts = [];
  await authenticate(page);
  await installRoutes(page, () => broadcasts);
  await page.setViewportSize(viewports[0]);
  await page.goto('/creator-studio');
  await expect(page.getByText('READY TO BROADCAST', { exact: true })).toBeVisible();

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const layout = await layoutSnapshot(page);
    const label = `${viewport.width}x${viewport.height}`;

    expect(layout.overflow, `${label} has no document-level horizontal overflow`).toBe(false);
    if (viewport.width >= 600) {
      expect(layout.cardWidths.every((width) => width <= 326), `${label} cards remain naturally capped`).toBe(true);
    }
    expect(layout.cardHeights.every((height) => height >= 289 && height <= 326), `${label} cards stay compact`).toBe(true);
    expect(layout.meter?.height, `${label} keeps the vertical meter`).toBeGreaterThanOrEqual(105);
    expect(layout.fader?.width, `${label} keeps a usable fader hit area`).toBeGreaterThanOrEqual(39);
    if (viewport.width >= 761) {
      expect(layout.scheduleClipped, `${label} keeps Schedule Events readable`).toBe(false);
    }

    if (viewport.width < 600) {
      expect(layout.columns, `${label} uses one strip column`).toBe(1);
      expect(layout.minControlHeight, `${label} keeps touch controls at least 44px`).toBeGreaterThanOrEqual(44);
      expect(layout.topbar?.height, `${label} keeps mobile chrome compact`).toBeLessThanOrEqual(102);
      expect(layout.cardTops.every((top, index) => index === 0 || top > layout.cardTops[index - 1]), `${label} keeps strips in reading order`).toBe(true);
      expect(layout.lowerTop - layout.gridBottom, `${label} keeps the lower controls connected to the mixer`).toBeLessThanOrEqual(16);
    } else if (viewport.width <= 1024) {
      expect(layout.columns, `${label} uses two strip columns`).toBe(2);
      expect(layout.topbar?.height, `${label} uses the compact desktop header`).toBe(66);
    } else {
      expect(layout.columns, `${label} uses four strip columns`).toBe(4);
      expect(layout.topbar?.height, `${label} uses the compact desktop header`).toBe(66);
      expect(layout.hero?.height, `${label} keeps the off-air hero compact`).toBeLessThanOrEqual(126);
      expect(layout.addAudio?.left, `${label} keeps Add audio on the left`).toBeLessThan(layout.goLive?.left);
    }

    if (viewport.width === 1280 && viewport.height === 720) {
      expect(layout.goLive?.bottom, '1280x720 keeps Go Live in the initial viewport').toBeLessThanOrEqual(720);
    }

    if (viewport.width === 390 || viewport.width === 1440) {
      await page.screenshot({
        path: `design-qa-evidence/broadcast-responsive/off-air-${viewport.width}x${viewport.height}.png`,
        fullPage: true,
      });
    }
  }

  broadcasts = [liveBroadcast];
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await expect(page.locator('.ec2-status-pill[aria-label="Live"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);

    if (viewport.width < 600) {
      await expect(page.locator('.ec2-live-ticker')).toBeHidden();
      await expect(page.getByText("You're broadcasting now.", { exact: true })).toBeVisible();
    } else {
      await expect(page.locator('.ec2-live-ticker')).toBeVisible();
      const heroHeight = await page.locator('.ec2-hero').evaluate((node) => node.getBoundingClientRect().height);
      expect(heroHeight).toBeLessThanOrEqual(126);
    }

    await page.screenshot({
      path: `design-qa-evidence/broadcast-responsive/live-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });
  }
});
