import { expect, test } from 'playwright/test';

const CREATOR_ID = '507f1f77bcf86cd799439101';
const STATION_ID = '507f1f77bcf86cd799439102';
const BROADCAST_ID = '507f1f77bcf86cd799439103';
const RECORDING_ID = '507f1f77bcf86cd799439104';

const creator = {
  id: CREATOR_ID,
  username: 'emmanuel',
  displayName: 'Emmanuel',
  userType: 'creator',
  roles: ['creator'],
  onboardingCompleted: true,
  profileCompleted: true,
};

const station = {
  id: STATION_ID,
  _id: STATION_ID,
  slug: 'layers-of-truth',
  name: 'Layers of truth',
  description: 'Talk · Teach · Transform',
  category: 'Faith & Spirituality',
  isPublic: true,
  owner: creator,
};

const liveBroadcast = {
  id: BROADCAST_ID,
  _id: BROADCAST_ID,
  title: 'Layers of truth',
  description: 'A live conversation.',
  status: 'live',
  isLive: true,
  station,
  stationId: STATION_ID,
  creator,
  mediaState: 'audio_live',
  startedAt: new Date(Date.now() - 42_000).toISOString(),
};

const fulfill = (route, data) => route.fulfill({ json: { data } });

const authenticate = async (page) => {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('accessToken', 'creator-token');
    localStorage.setItem('token', 'creator-token');
    localStorage.setItem('refreshToken', 'creator-refresh-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('echooRole', 'creator');
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('creatorSetup', JSON.stringify({ type: 'individual', name: user.displayName }));
  }, { user: creator });
};

const installBaseRoutes = async (page, broadcasts) => {
  await page.route('**/api/auth/me', (route) => fulfill(route, { user: creator }));
  await page.route('**/api/settings', (route) => fulfill(route, {}));
  await page.route('**/api/studio/content**', (route) => fulfill(route, { tracks: [], pagination: {} }));
  await page.route('**/api/stations/mine/all**', (route) => fulfill(route, [station]));
  await page.route('**/api/broadcasts/mine/all**', (route) => fulfill(route, broadcasts));
  await page.route(`**/api/broadcasts/${BROADCAST_ID}/presence`, (route) => fulfill(route, {
    listenerCount: 0,
    peakListeners: 0,
    creatorConnected: true,
  }));
  await page.route('**/api/audio/upload', (route) => fulfill(route, {
    id: RECORDING_ID,
    _id: RECORDING_ID,
    title: liveBroadcast.title,
  }));
  await page.route('**/api/**', (route) => route.fallback());
};

const announceRecording = (page, broadcastId = BROADCAST_ID) => page.evaluate(({ broadcast, id }) => {
  const blob = new Blob([new Uint8Array(128)], { type: 'audio/wav' });
  window.dispatchEvent(new CustomEvent('echoo:broadcast-recording-ready', {
    detail: {
      broadcast: { ...broadcast, id, _id: id, status: 'completed' },
      recording: {
        blob,
        broadcastId: id,
        durationSeconds: 42,
        startedAt: new Date(Date.now() - 42_000).toISOString(),
        mimeType: 'audio/wav',
        recordingFormat: 'pcm-wav',
        lossless: true,
        sampleRate: 48000,
        bitDepth: 24,
        channels: 2,
      },
    },
  }));
}, { broadcast: liveBroadcast, id: broadcastId });

test('Creator broadcast moves through OFF AIR, LIVE, confirmation, ending, saved, and OFF AIR', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  await authenticate(page);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await installBaseRoutes(page, []);
  await page.goto('/creator-studio');
  await expect(page.getByText('READY TO BROADCAST', { exact: true })).toBeVisible();
  await expect(page.getByText("YOU'RE BROADCASTING NOW.", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'design-qa-evidence/broadcast-approved/off-air-1536x1024.png' });

  let broadcastEnded = false;
  await page.unroute('**/api/broadcasts/mine/all**');
  await page.route('**/api/broadcasts/mine/all**', (route) => fulfill(route, broadcastEnded ? [] : [liveBroadcast]));
  await page.reload();
  await expect(page.locator('.ec2-status-pill[aria-label="Live"]')).toHaveCount(1);
  await expect(page.locator('.ec2-live-ticker-track')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy live link' })).toBeVisible();
  await page.screenshot({ path: 'design-qa-evidence/broadcast-approved/live-1536x1024.png' });

  let endCalls = 0;
  let releaseEnd;
  await page.route(`**/api/broadcasts/${BROADCAST_ID}/end`, async (route) => {
    endCalls += 1;
    await new Promise((resolve) => { releaseEnd = resolve; });
    await fulfill(route, { ...liveBroadcast, status: 'completed', isLive: false });
  });

  await page.getByRole('button', { name: 'End broadcast' }).click();
  await expect(page.getByRole('alertdialog', { name: 'End broadcast?' })).toBeVisible();
  expect(endCalls).toBe(0);
  await page.screenshot({ path: 'design-qa-evidence/broadcast-approved/end-confirmation-1536x1024.png' });

  await page.getByRole('button', { name: 'Keep live' }).click();
  await expect(page.getByRole('alertdialog', { name: 'End broadcast?' })).toHaveCount(0);
  await expect(page.locator('.ec2-status-pill[aria-label="Live"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'End broadcast' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'End broadcast' }).click();
  await expect.poll(() => endCalls).toBe(1);
  await expect(page.locator('.ec2-live-ticker-track')).toHaveCount(0);
  await expect(page.getByText('READY TO BROADCAST', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'design-qa-evidence/broadcast-approved/ending-1536x1024.png' });
  broadcastEnded = true;
  releaseEnd();
  await expect(page.getByText('READY TO BROADCAST', { exact: true })).toBeVisible();

  await announceRecording(page);
  await expect(page.getByRole('dialog', { name: 'Recording saved!' })).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View recording' })).toBeVisible();
  await page.screenshot({ path: 'design-qa-evidence/broadcast-approved/recording-saved-1536x1024.png' });
  await expect(page.getByRole('dialog', { name: 'Recording saved!' })).toHaveCount(0, { timeout: 7_000 });
  await expect(page.getByText('READY TO BROADCAST', { exact: true })).toBeVisible();

  await announceRecording(page, '507f1f77bcf86cd799439105');
  await expect(page.getByRole('dialog', { name: 'Recording saved!' })).toBeVisible({ timeout: 12_000 });
  await page.getByRole('button', { name: 'View recording' }).click();
  await expect(page).toHaveURL(new RegExp(`/creator-studio/recordings/${RECORDING_ID}$`));
  await expect(page.getByRole('dialog', { name: 'Recording saved!' })).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});

test('broadcast hero and modal remain usable without horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page);
  await installBaseRoutes(page, [liveBroadcast]);
  await page.goto('/creator-studio');
  await expect(page.locator('.ec2-status-pill[aria-label="Live"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'End broadcast' }).click();
  await expect(page.getByRole('alertdialog', { name: 'End broadcast?' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
