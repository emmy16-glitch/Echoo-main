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
  roles: ['listener', 'creator'],
  onboardingCompleted: true,
  profileCompleted: true,
  creatorProfile: {
    creatorType: 'individual',
    category: 'Faith & Spirituality',
    artistName: 'Emmanuel',
    isApproved: true,
  },
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
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooActiveExperience', 'creator');
    localStorage.setItem('echooRecordingDevicePreferencesV1', JSON.stringify({
      decided: true,
      autoSave: true,
      format: 'mp3',
    }));
    localStorage.removeItem('echooRole');
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
  // Live recordings finalize from bounded chunks already received by the
  // backend. The browser must never upload the final WAV through /audio/upload.
  await page.route('**/api/broadcasts/*/recording-chunks/complete', (route) => fulfill(route, {
    replay: {
      status: 'ready',
      audioId: RECORDING_ID,
      format: 'mp3',
      mimeType: 'audio/mpeg',
    },
  }));
  await page.route(`**/api/audio/${RECORDING_ID}/download`, (route) => route.fulfill({
    status: 200,
    contentType: 'audio/mpeg',
    body: 'ID3echoo-test-mp3',
  }));
  await page.route('**/api/audio/upload', (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'GIANT_WAV_UPLOAD_REGRESSION', message: 'Live replay must not use /audio/upload.' } }),
  }));
  await page.route('**/api/**', (route) => route.fallback());
};

const announceRecording = (page, broadcastId = BROADCAST_ID) => page.evaluate(({ broadcast, id }) => {
  const sampleRate = 48000;
  const frames = 4800;
  const channels = 2;
  const bytesPerSample = 3;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const ascii = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  const pcm24 = (offset, value) => {
    const encoded = value < 0 ? value + 0x1000000 : value;
    bytes[offset] = encoded & 0xff;
    bytes[offset + 1] = (encoded >>> 8) & 0xff;
    bytes[offset + 2] = (encoded >>> 16) & 0xff;
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * frame) / sampleRate) * 0x4fffff);
    pcm24(offset, sample);
    pcm24(offset + 3, sample);
    offset += blockAlign;
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  let encodedBytes = 0;
  const writable = {
    async write(chunk) {
      encodedBytes += Number(chunk?.byteLength ?? chunk?.size ?? 0);
    },
    async close() {
      window.__echooE2eSavedMp3Bytes = encodedBytes;
    },
    async abort() {},
  };
  const deviceSaveReservation = Promise.resolve({
    mode: 'file-picker',
    format: 'mp3',
    filename: 'Echoo - e2e-recording.mp3',
    mimeType: 'audio/mpeg',
    handle: {
      async createWritable() {
        return writable;
      },
    },
  });

  window.dispatchEvent(new CustomEvent('echoo:broadcast-recording-ready', {
    detail: {
      broadcast: { ...broadcast, id, _id: id, status: 'completed' },
      recording: {
        blob,
        broadcastId: id,
        durationSeconds: 0.1,
        startedAt: new Date(Date.now() - 100).toISOString(),
        mimeType: 'audio/wav',
        recordingFormat: 'pcm-wav',
        lossless: true,
        sampleRate,
        bitDepth: 24,
        channels,
      },
      deviceSaveReservation,
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
  const deviceChoice = page.locator('.echoo-save-banner').filter({ hasText: 'Echoo server recording is ready' });
  await expect(deviceChoice).toBeVisible({ timeout: 12_000 });
  await expect(deviceChoice.getByRole('button', { name: 'Save MP3 to device' })).toBeVisible();
  await expect(deviceChoice.getByRole('button', { name: 'Save WAV to device' })).toBeVisible();
  await deviceChoice.getByRole('button', { name: 'Save MP3 to device' }).click();
  await expect.poll(() => page.evaluate(() => Number(window.__echooE2eSavedMp3Bytes || 0))).toBeGreaterThan(1000);
  await expect(deviceChoice).toHaveCount(0);
  await page.screenshot({ path: 'design-qa-evidence/broadcast-approved/recording-saved-1536x1024.png' });
  await expect(page.getByText('READY TO BROADCAST', { exact: true })).toBeVisible();

  await announceRecording(page, '507f1f77bcf86cd799439105');
  const secondChoice = page.locator('.echoo-save-banner').filter({ hasText: 'Echoo server recording is ready' });
  await expect(secondChoice).toBeVisible({ timeout: 12_000 });
  await secondChoice.getByRole('button', { name: 'Save WAV to device' }).click();
  await expect(secondChoice).toHaveCount(0);

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

test('a creator without a Channel receives a clear setup path without horizontal overflow', async ({ page }) => {
  await authenticate(page);
  await installBaseRoutes(page, []);
  await page.unroute('**/api/stations/mine/all**');
  await page.route('**/api/stations/mine/all**', (route) => fulfill(route, []));
  await page.goto('/creator-studio');

  await expect(page.getByRole('heading', { name: 'Create your Channel' })).toBeVisible();
  await expect(page.getByText('Your Channel is your public home on Echoo.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Channel' })).toBeVisible();
  await expect(page.getByText('One Channel, one public home', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

  if (await page.evaluate(() => window.innerWidth > 720)) {
    const card = await page.locator('.ec2-no-channel').boundingBox();
    expect(card?.height).toBeGreaterThanOrEqual(320);
    expect(card?.height).toBeLessThanOrEqual(390);
  }

  await page.getByRole('button', { name: 'Create Channel' }).click();
  await expect(page).toHaveURL(/\/creator-studio\/channels$/);
  await expect(page.getByRole('heading', { name: 'Channel', exact: true })).toBeVisible();
});
