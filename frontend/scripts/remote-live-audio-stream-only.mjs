import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = String(process.env.ECHOO_REMOTE_ORIGIN || '').replace(/\/$/, '');
if (!/^https:\/\//.test(origin)) {
  throw new Error('Set ECHOO_REMOTE_ORIGIN to the public HTTPS Echoo origin.');
}

const password = `Echoo!${Date.now()}Aa9`;
const unique = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const username = `live_audio_${unique}`.slice(0, 30);
const email = `${username}@example.test`;
const channelName = `Live Audio QA ${unique}`;
const evidence = {
  origin,
  account: username,
  timing: {},
  audio: {},
  recovery: [],
  browserErrors: [],
};

let token = '';
let refreshToken = '';
let user = null;
let stationId = '';
let broadcastId = '';
let audioId = '';
let browser;
let creatorContext;
let listenerContext;

const api = async (path, { method = 'GET', body, auth = true } = {}) => {
  const headers = { Accept: 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = { raw }; }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || raw || response.statusText;
    const error = new Error(`${method} ${path} failed (${response.status}): ${message}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
};

const updateUser = (payload) => {
  const next = payload?.data?.user;
  if (next) user = next;
  return payload;
};

const observePage = (page, label) => {
  page.on('pageerror', (error) => evidence.browserErrors.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.browserErrors.push(`${label} console: ${message.text()}`);
  });
};

const installCreatorIdentityAndAudio = async (context) => {
  await context.addInitScript(({ accessToken, refresh, account }) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('token', accessToken);
    localStorage.setItem('refreshToken', refresh);
    localStorage.setItem('user', JSON.stringify(account));
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooActiveExperience', 'creator');
    localStorage.setItem('creatorSetup', 'true');
    window.__echooQaRecordingEvents = [];
    window.__echooQaFilePickerCalls = [];
    window.showSaveFilePicker = async (options = {}) => {
      window.__echooQaFilePickerCalls.push({
        suggestedName: options?.suggestedName || '',
        types: options?.types || [],
      });
      return {
        name: options?.suggestedName || 'echoo-recording.mp3',
        async createWritable() {
          return {
            async write() {},
            async close() {},
          };
        },
      };
    };
    window.addEventListener('echoo:recording-upload', (event) => {
      const detail = event?.detail || {};
      window.__echooQaRecordingEvents.push({
        status: detail.status || '',
        key: detail.key || '',
        audioId: detail.audioId || '',
        localCopy: detail.localCopy || null,
        message: detail.message || '',
      });
    });

    const installFakeCapture = () => {
      if (!navigator.mediaDevices || window.__echooQaAudioInstalled) return;
      window.__echooQaAudioInstalled = true;
      let stream = null;

      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => {
          if (stream?.getAudioTracks?.()[0]?.readyState === 'live') return stream;
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          const context = new AudioContextClass({ sampleRate: 48_000, latencyHint: 'interactive' });
          await context.resume();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const destination = context.createMediaStreamDestination();
          oscillator.type = 'sine';
          oscillator.frequency.value = 440;
          gain.gain.value = 0.18;
          oscillator.connect(gain);
          gain.connect(destination);
          oscillator.start();
          window.__echooQaAudio = { context, oscillator, gain, destination };
          stream = destination.stream;
          return stream;
        },
      });

      Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
        configurable: true,
        value: async () => [{
          deviceId: 'echoo-qa-microphone',
          groupId: 'echoo-qa-group',
          kind: 'audioinput',
          label: 'Echoo QA 440 Hz source',
          toJSON() { return this; },
        }],
      });
    };

    installFakeCapture();
  }, { accessToken: token, refresh: refreshToken, account: user });
};

const sampleRemoteAudio = async (page, durationMs = 1300) => page.evaluate(async (sampleDuration) => {
  const element = document.querySelector('.echoo-livekit-audio-host audio');
  const stream = element?.srcObject;
  const track = stream?.getAudioTracks?.()[0];
  if (!element || !stream || !track) {
    return { found: false, reason: 'No attached remote audio track' };
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass({ sampleRate: 48_000, latencyHint: 'interactive' });
  await context.resume();
  const analyser = context.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.15;
  const source = context.createMediaStreamSource(stream);
  source.connect(analyser);
  const timeData = new Float32Array(analyser.fftSize);
  const frequencyData = new Float32Array(analyser.frequencyBinCount);
  const samples = [];
  let strongestDb = -Infinity;
  let peakHz = 0;
  const deadline = performance.now() + sampleDuration;

  while (performance.now() < deadline) {
    analyser.getFloatTimeDomainData(timeData);
    let sum = 0;
    for (const value of timeData) sum += value * value;
    samples.push(Math.sqrt(sum / timeData.length));

    analyser.getFloatFrequencyData(frequencyData);
    for (let index = 1; index < frequencyData.length; index += 1) {
      if (frequencyData[index] > strongestDb) {
        strongestDb = frequencyData[index];
        peakHz = index * context.sampleRate / analyser.fftSize;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  source.disconnect();
  await context.close();
  const averageRms = samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length);
  return {
    found: true,
    averageRms,
    maxRms: Math.max(...samples),
    peakHz,
    strongestDb,
    sampleCount: samples.length,
    elementPaused: element.paused,
    trackReadyState: track.readyState,
    trackMuted: track.muted,
    attachedElements: document.querySelectorAll('.echoo-livekit-audio-host audio').length,
  };
}, durationMs);

const waitForAudibleProgram = async (page, timeoutMs = 35_000) => {
  await page.waitForFunction(() => {
    const element = document.querySelector('.echoo-livekit-audio-host audio');
    const meter = document.querySelector('[aria-label="Live audio level"]');
    const track = element?.srcObject?.getAudioTracks?.()[0];
    return Boolean(
      element &&
      track?.readyState === 'live' &&
      !track.muted &&
      !element.paused &&
      Number(meter?.getAttribute('aria-valuenow') || 0) > 0
    );
  }, null, { timeout: timeoutMs });
};

const waitForRemoteSignal = async (page, timeoutMs = 45_000) => {
  const deadline = Date.now() + timeoutMs;
  let lastSample = { found: false, reason: 'Audio was not sampled.' };
  while (Date.now() < deadline) {
    await waitForAudibleProgram(page, Math.min(10_000, Math.max(1_000, deadline - Date.now()))).catch(() => {});
    lastSample = await sampleRemoteAudio(page, 650).catch((error) => ({
      found: false,
      reason: error?.message || String(error),
    }));
    if (
      lastSample.found &&
      lastSample.trackReadyState === 'live' &&
      !lastSample.trackMuted &&
      !lastSample.elementPaused &&
      lastSample.averageRms > 0.005 &&
      lastSample.peakHz >= 400 &&
      lastSample.peakHz <= 480
    ) {
      return lastSample;
    }
    await page.waitForTimeout(750);
  }
  return lastSample;
};

const waitForFinalBroadcastStatus = async (id, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await api(`/broadcasts/${id}`);
    if (['ended', 'processing', 'completed'].includes(latest.data?.status)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return latest;
};

try {
  const registration = await api('/auth/register', {
    method: 'POST',
    auth: false,
    body: { username, email, password, displayName: 'Echoo Live Audio QA' },
  });
  token = registration.data.accessToken;
  refreshToken = registration.data.refreshToken;
  user = registration.data.user;
  assert.ok(token && (user?.id || user?._id), 'Registration did not provide an authenticated test identity.');

  updateUser(await api('/onboarding/skip-profile', { method: 'POST', body: {} }));
  updateUser(await api('/onboarding/activate-creator', { method: 'POST', body: {} }));
  updateUser(await api('/onboarding/choose-creator-type', {
    method: 'POST',
    body: { creatorType: 'individual', artistName: 'Echoo Live Audio QA' },
  }));
  updateUser(await api('/onboarding/content-info', {
    method: 'POST',
    body: {
      category: 'Technology',
      contentDescription: 'Automated end-to-end real-time audio verification.',
      genres: [],
    },
  }));
  updateUser(await api('/onboarding/complete', { method: 'POST', body: {} }));

  const station = await api('/stations', {
    method: 'POST',
    body: {
      name: channelName,
      description: 'Temporary Channel for Echoo public live-audio QA.',
      category: 'Technology',
      isPublic: true,
      brandingMode: 'generated',
      brandingVariant: 0,
    },
  });
  stationId = station.data.id || station.data._id;
  assert.ok(stationId, 'Channel creation did not return an id.');

  browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  });

  creatorContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await installCreatorIdentityAndAudio(creatorContext);
  const creatorPage = await creatorContext.newPage();
  observePage(creatorPage, 'creator');
  const localDownloads = [];
  creatorPage.on('download', (download) => {
    localDownloads.push(download.suggestedFilename());
  });

  const studioStarted = Date.now();
  await creatorPage.goto(`${origin}/creator-studio`, { waitUntil: 'domcontentloaded' });
  await creatorPage.getByRole('region', { name: 'Broadcast workstation' }).waitFor({ timeout: 15_000 });
  evidence.timing.creatorStudioReadyMs = Date.now() - studioStarted;
  assert.ok(
    evidence.timing.creatorStudioReadyMs <= 15_000,
    `Creator Studio took too long to become usable: ${evidence.timing.creatorStudioReadyMs}ms`
  );
  await creatorPage.locator('select[aria-label="HOST input"]').selectOption('__echoo_default_input__');
  await creatorPage.waitForFunction(() => Number(document.querySelector('[aria-label="HOST left level"]')?.getAttribute('aria-valuenow') || 0) > 0, null, { timeout: 15_000 });

  const goLiveStarted = Date.now();
  await creatorPage.getByRole('button', { name: 'Go Live', exact: true }).click();
  await creatorPage.locator('.ec2-status-pill[aria-label="Live"]').waitFor({ timeout: 45_000 });
  await creatorPage.getByText('Connected', { exact: true }).waitFor({ timeout: 25_000 });
  evidence.timing.creatorTimeToLiveMs = Date.now() - goLiveStarted;

  const broadcasts = await api('/broadcasts/mine/all');
  const liveBroadcast = broadcasts.data.find((item) => item.status === 'live' || item.status === 'starting');
  broadcastId = liveBroadcast?.id || liveBroadcast?._id || '';
  assert.ok(broadcastId, 'The creator is live in the UI but no live API broadcast exists.');
  evidence.broadcastId = broadcastId;
  evidence.broadcastTitle = liveBroadcast?.title || channelName;
  evidence.listenUrl = `${origin}/listen/live/${broadcastId}`;

  listenerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const listenerPage = await listenerContext.newPage();
  observePage(listenerPage, 'listener');
  const listenStarted = Date.now();
  // Start from the PUBLIC guest Live catalog. This catches the station-id vs
  // broadcast-id regression that direct deep-link QA would miss.
  await listenerPage.goto(`${origin}/listen/live`, { waitUntil: 'domcontentloaded' });
  const guestCard = listenerPage.getByText(evidence.broadcastTitle, { exact: true }).first();
  await guestCard.waitFor({ timeout: 30_000 });
  await guestCard.click();
  await listenerPage.waitForURL(
    (url) => url.pathname === `/listen/live/${broadcastId}`,
    { timeout: 15_000 }
  );
  evidence.guestCatalogResolvedBroadcastId = listenerPage.url().endsWith(`/${broadcastId}`);

  const tapToHear = listenerPage.getByRole('button', { name: /Tap to hear/i }).first();
  if (await tapToHear.isVisible({ timeout: 2_500 }).catch(() => false)) await tapToHear.click();
  const play = listenerPage.getByRole('button', { name: 'Play', exact: true });
  if (await play.isVisible({ timeout: 2_500 }).catch(() => false)) await play.click();

  await waitForAudibleProgram(listenerPage);
  evidence.timing.listenerTimeToAudioMs = Date.now() - listenStarted;
  evidence.audio.initial = await waitForRemoteSignal(listenerPage);
  assert.equal(evidence.audio.initial.found, true);
  assert.equal(evidence.audio.initial.trackReadyState, 'live');
  assert.equal(evidence.audio.initial.trackMuted, false);
  assert.equal(evidence.audio.initial.elementPaused, false);
  assert.equal(evidence.audio.initial.attachedElements, 1, 'Listener should have one canonical program audio element.');
  assert.ok(evidence.audio.initial.averageRms > 0.005, `Remote audio RMS was too low: ${evidence.audio.initial.averageRms}`);
  assert.ok(evidence.audio.initial.peakHz >= 400 && evidence.audio.initial.peakHz <= 480, `Expected the shared 440 Hz source, received ${evidence.audio.initial.peakHz} Hz.`);

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    const startedAt = Date.now();
    await listenerContext.setOffline(true);
    await listenerPage.waitForTimeout(2_500);
    await listenerContext.setOffline(false);
    const sample = await waitForRemoteSignal(listenerPage, 45_000);
    assert.ok(sample.averageRms > 0.005, `Audio did not recover after network cycle ${cycle}.`);
    assert.ok(sample.peakHz >= 400 && sample.peakHz <= 480, `Source changed after recovery cycle ${cycle}.`);
    evidence.recovery.push({
      cycle,
      offlineMs: 2_500,
      recoveredInMs: Date.now() - startedAt - 2_500,
      averageRms: sample.averageRms,
      peakHz: sample.peakHz,
    });
  }

  const presence = await api(`/broadcasts/${broadcastId}/presence`, { auth: false });
  evidence.presence = presence.data;
  assert.equal(Boolean(presence.data?.creatorConnected), true, 'Provider presence did not see the creator publisher.');

  await creatorPage.getByRole('button', { name: 'End broadcast', exact: true }).click();
  const endConfirmedAt = Date.now();
  await creatorPage.locator('.ec2-confirm-end').click();
  await creatorPage.waitForFunction(() => (window.__echooQaFilePickerCalls || []).length > 0, null, { timeout: 5_000 });
  evidence.deviceSaveReservation = await creatorPage.evaluate(() => window.__echooQaFilePickerCalls || []);
  assert.match(
    String(evidence.deviceSaveReservation[0]?.suggestedName || ''),
    /\.mp3$/i,
    'End Broadcast should immediately reserve an MP3 device destination.'
  );
  await creatorPage.locator('.ec2-status-pill[aria-label="Off air"]').waitFor({ timeout: 20_000 });
  evidence.timing.endBroadcastToOffAirMs = Date.now() - endConfirmedAt;
  assert.ok(
    evidence.timing.endBroadcastToOffAirMs <= 20_000,
    `End Broadcast took too long to return OFF AIR: ${evidence.timing.endBroadcastToOffAirMs}ms`
  );
  const ended = await waitForFinalBroadcastStatus(broadcastId);
  assert.ok(['ended', 'processing', 'completed'].includes(ended.data?.status), `Unexpected final status: ${ended.data?.status}`);
  evidence.finalStatus = ended.data.status;

  evidence.recording = { skipped: true, reason: 'stream-only QA; server recording is validated separately on a persistent backend' };
  evidence.ok = true;
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\\n`);
} catch (error) {
  evidence.ok = false;
  evidence.failure = error?.stack || error?.message || String(error);
  process.stderr.write(`${JSON.stringify(evidence, null, 2)}\n`);
  throw error;
} finally {
  await listenerContext?.close().catch(() => {});
  await creatorContext?.close().catch(() => {});
  await browser?.close().catch(() => {});

  if (audioId) await api(`/audio/${audioId}`, { method: 'DELETE' }).catch(() => {});
  if (broadcastId) {
    await api(`/broadcasts/${broadcastId}/end`, { method: 'POST', body: {} }).catch(() => {});
    await api(`/broadcasts/${broadcastId}`, { method: 'DELETE' }).catch(() => {});
  }
  if (stationId) await api(`/stations/${stationId}`, { method: 'DELETE' }).catch(() => {});
  if (token) await api('/settings/account', { method: 'DELETE', body: { password } }).catch(() => {});
}
