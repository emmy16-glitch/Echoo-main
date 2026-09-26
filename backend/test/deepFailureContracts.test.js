import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { authorize } from '../src/middleware/auth.js';
import { isAudioAccessibleToUser } from '../src/services/audioAccess.js';

const source = (relativePath) => fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const frontendSource = (relativePath) => fs.readFile(new URL(`../../frontend/${relativePath}`, import.meta.url), 'utf8');

const runMiddleware = (middleware, req) => new Promise((resolve) => {
  const response = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; resolve({ next: false, status: this.statusCode, payload }); },
  };
  middleware(req, response, () => resolve({ next: true, status: response.statusCode, payload: response.payload }));
});

test('canonical public audio requires all publication fields to agree', () => {
  const base = {
    artist: 'creator-1',
    isDeleted: false,
    isPublic: true,
    visibility: 'public',
    publicationStatus: 'published',
  };

  assert.equal(isAudioAccessibleToUser(base, null), true);
  assert.equal(isAudioAccessibleToUser({ ...base, isPublic: false }, null), false);
  assert.equal(isAudioAccessibleToUser({ ...base, visibility: 'private' }, null), false);
  assert.equal(isAudioAccessibleToUser({ ...base, visibility: 'followers' }, null), false);
  assert.equal(isAudioAccessibleToUser({ ...base, publicationStatus: 'draft' }, null), false);
  assert.equal(isAudioAccessibleToUser({ ...base, isDeleted: true }, null), false);
  assert.equal(isAudioAccessibleToUser({ ...base, visibility: 'private', publicationStatus: 'draft' }, 'creator-1'), true);
});

test('shared role authorization rejects listener credentials before controller logic', async () => {
  const creatorOnly = authorize('creator', 'admin');
  const listenerResult = await runMiddleware(creatorOnly, {
    user: { id: 'listener-1' },
    userRoles: ['listener'],
  });
  assert.equal(listenerResult.next, false);
  assert.equal(listenerResult.status, 403);
  assert.equal(listenerResult.payload?.error?.code, 'INSUFFICIENT_ROLE');

  const creatorResult = await runMiddleware(creatorOnly, {
    user: { id: 'creator-1' },
    userRoles: ['listener', 'creator'],
  });
  assert.equal(creatorResult.next, true);
});

test('broadcast mutation routes are creator-only while listener media token stays listener-accessible', async () => {
  const routes = await source('src/routes/broadcastRoutes.js');
  assert.match(routes, /const requireCreator = \(req, res, next\) =>/);
  assert.match(routes, /req\.user\?\.userType === 'creator'/);
  assert.match(routes, /req\.userRoles\?\.includes\('creator'\)/);
  for (const fragment of [
    "router.post('/', authenticate, requireCreator, createBroadcast)",
    "router.patch('/:broadcastId', authenticate, requireCreator, updateBroadcast)",
    "router.delete('/:broadcastId', authenticate, requireCreator, deleteBroadcast)",
    "router.post('/:broadcastId/discard-replay', authenticate, requireCreator, discardReplay)",
  ]) assert.ok(routes.includes(fragment), `missing creator-only route contract: ${fragment}`);
  assert.match(routes, /'\/:broadcastId\/listener-token'[\s\S]*authenticate,[\s\S]*livekitTokenLimiter,[\s\S]*getListenerLiveKitToken/);
});

test('live transcript settings cannot be re-enabled for listeners by a stale client', async () => {
  const routes = await source('src/routes/transcriptRoutes.js');
  assert.match(routes, /showToListeners:\s*false/);
  assert.match(routes, /enforcePrivateLiveTranscript/);
  assert.match(routes, /router\.patch\('\/broadcast\/:broadcastId\/settings', enforcePrivateLiveTranscript, updateCaptionSettings\)/);
});

test('global transcript search is permission-aware and excludes hidden rows', async () => {
  const routes = await source('src/routes/transcriptRoutes.js');
  const controller = await source('src/controllers/transcriptSearchController.js');
  assert.match(routes, /searchReplayTranscriptsSecure/);
  assert.match(routes, /router\.get\('\/search', searchReplayTranscriptsSecure\)/);
  assert.match(controller, /isHidden:\s*false/);
  assert.match(controller, /assetVisibility\?\.transcript/);
  assert.match(controller, /StationFollow/);
  assert.match(controller, /Follow/);
});

test('transcript publication cannot become broader than its replay', async () => {
  const controller = await source('src/controllers/broadcastProcessingController.js');
  assert.match(controller, /VISIBILITY_RANK/);
  assert.match(controller, /TRANSCRIPT_VISIBILITY_TOO_BROAD/);
  assert.match(controller, /replay\.publicationStatus !== 'published'/);
  assert.match(controller, /REPLAY_NOT_PUBLISHED/);
});

test('silent quality chunks are valid and quality reconciliation is restart-idempotent', async () => {
  const quality = await source('src/services/transcriptQualityService.js');
  assert.match(quality, /segments\.length[\s\S]*silent:\s*true/);
  assert.match(quality, /qualityChunkId:\s*chunk\._id/);
  assert.match(quality, /qualitySegmentIndex:\s*index/);
  assert.match(quality, /existingQuality/);
  assert.match(quality, /const qualityEnd\s*=\s*Math\.min\([\s\S]*?chunk\.endMs/);
});

test('prerequisite waiting does not burn processing retry attempts', async () => {
  const processing = await source('src/services/broadcastProcessingService.js');
  assert.match(processing, /waiting:\s*true/);
  assert.match(processing, /const prerequisiteWait = Boolean\(error\?\.waiting\)/);
  assert.match(processing, /job\.attempts = Math\.max\(0, Number\(job\.attempts \|\| 0\) - 1\)/);
  assert.match(processing, /TranscriptSession\.countDocuments/);
  assert.match(processing, /failed without a durable quality recording path/);
});

test('recording completion retries and automatic save preserves recovery state', async () => {
  const recording = await frontendSource('src/services/broadcastRecordingService.js');
  const autosave = await frontendSource('src/services/recordingAutosave.js');
  const banner = await frontendSource('src/Components/RecordingSaveBanner.jsx');
  assert.match(recording, /QUALITY_CHUNK_COMPLETE_RETRIES/);
  assert.match(recording, /completeQualityChunks/);
  assert.match(recording, /qualityCompletionPending/);
  assert.match(recording, /retryBroadcastQualityCompletion/);
  // Background autosave finalizes the server-side replay (no giant client
  // upload): End Broadcast finalizes, banner shows finalizing/retry/recovery.
  assert.match(autosave, /retryBroadcastQualityCompletion/);
  assert.match(autosave, /finalizeServerReplay/);
  assert.match(autosave, /getRecordingDevicePreferences/);
  assert.match(autosave, /saveAutomaticLocalCopy\(\{/);
  assert.match(autosave, /format:\s*preferences\.format/);
  assert.match(autosave, /completeDeviceCopyChoice/);
  assert.doesNotMatch(autosave, /uploadAudioWithProgress/);
  assert.doesNotMatch(autosave, /new File\(\[recording\.blob/);
  assert.match(autosave, /rememberLocalMaster/);
  assert.match(banner, /beforeunload/);
  assert.match(banner, /Retry/);
  assert.match(banner, /kind: 'finalizing'|finishing Echoo server copy/);
  assert.match(banner, /MP3 · Recommended/);
  assert.match(banner, /WAV · Lossless/);
  assert.match(banner, /keep this tab open/);
  assert.match(banner, /Upload/);
  assert.match(banner, /Discard/);
  assert.match(autosave, /DEVICE_COPY_FAILED/);
  assert.match(autosave, /SERVER_END_PENDING/);
  assert.match(autosave, /skipDeviceSave:\s*true/);
  assert.match(autosave, /batch3Service\.recoverBroadcast/);
  assert.match(autosave, /rememberPendingMaster/);
  assert.match(autosave, /pending\.serverReady === true/);
  assert.match(autosave, /automaticLocalCopies\.add\(String\(key\)\)/);
  assert.match(banner, /formats\.map\(\(format\) =>/);
  assert.match(banner, /Save \$\{format\.toUpperCase\(\)\} to device/);
  assert.match(banner, /Retry Echoo server save/);
  assert.match(recording, /OPFS_MANIFESTS_KEY/);
  assert.match(recording, /readRecoveryManifests/);
  assert.match(recording, /persistRecoveryManifests/);
  assert.doesNotMatch(recording, /STALE_OPFS_FILE_MS/);
  assert.match(banner, /master\?\.recording\?\.dispose/);
});

test('protected downloads use one canonical authorization boundary from local or cloud bytes', async () => {
  const routes = await source('src/routes/audioRoutes.js');
  const middleware = await source('src/middleware/audioDownloadAccess.js');
  const controller = await source('src/controllers/audioDownloadController.js');
  assert.match(routes, /requireAudioDownloadAccess/);
  assert.match(routes, /downloadAuthorizedAudio/);
  assert.match(middleware, /canAccessReplayAudio/);
  assert.match(middleware, /storage cloudKey cloudUrl/);
  assert.match(controller, /req\.audioAccessRecord/);
  assert.match(controller, /audio\.storage === 'cloud'/);
  assert.match(controller, /getCloudObject\(audio\.cloudKey\)/);
  assert.doesNotMatch(routes, /downloadAudio\)/);
});

test('CI executes the browser audit and syntax-checks new security controllers', async () => {
  const workflow = await fs.readFile(new URL('../../.github/workflows/echoo-check.yml', import.meta.url), 'utf8');
  assert.match(workflow, /frontend-e2e:/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /npx playwright test/);
  assert.match(workflow, /audioDownloadController\.js/);
  assert.match(workflow, /transcriptSearchController\.js/);
  assert.match(workflow, /broadcastProcessingController\.js/);
  assert.match(workflow, /audioDownloadAccess\.js/);
});


test('recording management keeps trim copies safe and prevents cramped or mislabeled exports', async () => {
  const trim = await frontendSource('src/Components/CreatorStudio/CreatorAudioTrimSection.jsx');
  const modal = await frontendSource('src/Components/CreatorStudio/CreatorAudioDetailModal.jsx');
  const modalCss = await frontendSource('src/Components/CreatorStudio/CreatorAudioDetailModal.css');
  const recordingsCss = await frontendSource('src/Components/CreatorStudio/CreatorCollectionsWorkspace.css');
  const exportService = await frontendSource('src/services/recordingExportService.js');
  const studioService = await frontendSource('src/services/studioService.js');
  const trimController = await source('src/controllers/audioController.js');
  const trimService = await source('src/services/audioTrimService.js');
  const routes = await source('src/routes/index.js');

  assert.doesNotMatch(trim, /studioService\.deleteAudio\(id\)/);
  assert.doesNotMatch(trim, /uploadAudioWithProgress/);
  assert.doesNotMatch(trim, /new File\(/);
  assert.match(trim, /trimSavedAudio\(id/);
  assert.match(trim, /Trimmed copy saved to Recordings\. The original is unchanged\./);
  assert.match(trim, /availableFormats/);
  assert.match(trim, /Export to this device/);
  assert.match(modal, /Download stored file/);
  assert.match(modal, /createPortal/);
  assert.match(modal, /document\.body/);

  assert.match(trimController, /const copy = await Audio\.create/);
  assert.match(trimController, /sourcePreserved:\s*true/);
  assert.match(trimController, /sourceBroadcast:\s*null/);
  assert.doesNotMatch(trimController, /findOneAndUpdate\([\s\S]{0,1000}'lastTrim\.startSeconds'/);
  assert.match(trimService, /case '\.mp3': return \['-c:a', 'copy'\]/);
  assert.match(trimService, /FFMPEG_REQUIRED/);
  assert.match(routes, /health\/recording/);

  assert.match(exportService, /Server MP3 is still being prepared/);
  assert.match(exportService, /saveAutomaticLocalCopy/);
  assert.match(exportService, /destination:\s*'browser-downloads'/);
  assert.match(exportService, /isWavMaster/);
  assert.match(exportService, /encodeLocalWavToMp3/);
  assert.match(exportService, /browser-user-gesture-required/);
  assert.match(exportService, /server-mp3-fallback/);
  assert.match(exportService, /localMime\.includes\('webm'\)/);
  assert.match(exportService, /suggestedName:\s*filename/);
  assert.doesNotMatch(exportService, /suggestedName:\s*suggestedInLibrary/);
  assert.match(studioService, /const originalStem = original/);
  assert.match(studioService, /canonical server copy may have been transcoded/);
  assert.match(studioService, /mimeType: blob\.type \|\| metadata\?\.mimeType/);

  assert.doesNotMatch(
    modalCss,
    /grid-template-columns:\s*minmax\(190px,\s*1fr\)\s*repeat\(2,\s*minmax\(120px,\s*150px\)\)\s*auto/
  );
  assert.match(modalCss, /\.creator-audio-trim\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.18fr\)\s*minmax\(290px,\s*\.82fr\)/);
  assert.match(modalCss, /\.creator-audio-device-formats\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(recordingsCss, /\.recordings-row\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/);
});
