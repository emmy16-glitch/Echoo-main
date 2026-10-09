import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const downloadService = read('./downloadService.js');
const downloadsPage = read('../Components/ListenerDownloads/ListenerDownloadsConnected.jsx');
const mobileDownloads = read('../../../mobile/src/services/localDownloads.ts');
const audioDetail = read('../Components/ListenerAudioDetail/ListenerAudioDetail.jsx');
const savedMomentsPage = read('../Components/ListenerSavedMoments/ListenerSavedMoments.jsx');

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(String(key)) ?? null; }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
  removeItem(key) { this.#values.delete(String(key)); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
let availableCacheUrl = '';
const testCache = {
  match: async (url) => String(url) === availableCacheUrl ? new Response('offline audio') : null,
};
const cacheStorage = { open: async () => testCache };
globalThis.caches = cacheStorage;
globalThis.window = {
  caches: cacheStorage,
  location: { origin: 'https://echoo.test' },
  dispatchEvent() {},
  setTimeout,
};
const downloadModule = await import('./downloadService.js');
const liveRoom = read('../Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx');

test('web Downloads verifies local bytes and refuses remote fallback for offline playback', () => {
  assert.match(downloadService, /getVerifiedAll:\s*async/);
  assert.match(downloadService, /hasStoredAudio\(item\.id\)/);
  assert.match(downloadService, /if \(localOnly\) throw new Error/);
  assert.match(downloadService, /saveFile: async/);
  assert.match(downloadsPage, /getPlayableUrl\(track\.id, \{ localOnly: true \}\)/);
  assert.match(downloadsPage, /getVerifiedAll\(\)/);
  assert.doesNotMatch(downloadsPage, /batch6Service\.getDownloads/);
  assert.doesNotMatch(downloadsPage, /25\s*GB|limitGb/);
});

test('actual browser download listing is account-scoped and prunes missing local bytes', async () => {
  const { default: service } = downloadModule;
  const savedTrack = { id: 'audio-1', title: 'Saved locally', cacheUrl: 'https://echoo.test/offline/audio-1' };
  availableCacheUrl = savedTrack.cacheUrl;
  localStorage.setItem('user', JSON.stringify({ id: 'account-a' }));
  localStorage.setItem('echooDownloads:account-a', JSON.stringify([savedTrack]));
  assert.deepEqual(await service.getVerifiedAll(), [savedTrack]);

  localStorage.setItem('user', JSON.stringify({ id: 'account-b' }));
  assert.deepEqual(await service.getVerifiedAll(), []);
  await assert.rejects(service.getPlayableUrl('audio-1', { localOnly: true }), /not stored on this device/);

  localStorage.setItem('user', JSON.stringify({ id: 'account-a' }));
  availableCacheUrl = '';
  assert.deepEqual(await service.getVerifiedAll(), []);
  assert.deepEqual(JSON.parse(localStorage.getItem('echooDownloads:account-a')), []);
});

test('mobile offline metadata and files are scoped to the signed-in account', () => {
  assert.match(mobileDownloads, /payload\.userId \|\| payload\.sub/);
  assert.match(mobileDownloads, /return `\$\{STORE_KEY\}:\$\{await getAccountScope\(\)\}`/);
  assert.match(mobileDownloads, /echoo-downloads\/\$\{encodeURIComponent\(accountId\)\}/);
  assert.match(mobileDownloads, /getInfoAsync\?\.\(download\.localUri\)/);
});

test('interrupted mobile downloads delete partial files and expose failure state', () => {
  assert.match(mobileDownloads, /deleteAsync\(destination, \{ idempotent: true \}\)/);
  assert.match(mobileDownloads, /setTrackStatus\(track\.id, 'failed', 0\)/);
  assert.match(mobileDownloads, /status: 'failed', progress: 0/);
});

test('recording moments use current playback time and Save All reports partial failures', () => {
  assert.match(audioDetail, /timestampMs: Math\.round\(moment\.seconds \* 1000\)/);
  assert.match(audioDetail, /saveCurrentMoment/);
  assert.match(audioDetail, /Download for offline/);
  assert.match(audioDetail, /Save file/);
  assert.match(audioDetail, /failedCount/);
  assert.match(audioDetail, /moment\.segmentId \? \{ transcriptSegmentId: moment\.segmentId \} : \{\}/);
});

test('live-room bookmarks use broadcast elapsed time rather than timestamp zero', () => {
  assert.match(liveRoom, /broadcastElapsedMs\(show\)/);
  assert.match(liveRoom, /savedMomentService\.create\(\{ broadcastId, timestampMs \}\)/);
  assert.doesNotMatch(liveRoom, /timestampMs:\s*0/);
});

test('saved recording moments reopen through the recording route with their precise seek time', () => {
  assert.match(savedMomentsPage, /navigate\(`\/listen\/audio\/\$\{encodeURIComponent\(audioId\)\}\?t=\$\{encodeURIComponent\(seconds\)\}`\)/);
});
