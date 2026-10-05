import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { authorize } from '../src/middleware/auth.js';
import { isAudioAccessibleToUser } from '../src/services/audioAccess.js';

const source = (relativePath) => fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const frontendSource = (relativePath) => fs.readFile(new URL(`../../frontend/${relativePath}`, import.meta.url), 'utf8');
const desktopSource = (relativePath) => fs.readFile(new URL(`../../desktop/${relativePath}`, import.meta.url), 'utf8');

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

test('local PCM recovery preserves intentional stereo right-channel silence', async () => {
  const worklet = await frontendSource('public/echoo-pcm-capture-worklet.js');

  assert.match(worklet, /hasRightChannel/);
  assert.match(worklet, /const rightSample = hasRightChannel/);
  assert.doesNotMatch(worklet, /right\[frame\] \|\| left\[frame\]/);
});

test('recording completion retries and automatic save preserves recovery state', async () => {
  const recording = await frontendSource('src/services/broadcastRecordingService.js');
  const autosave = await frontendSource('src/services/recordingAutosave.js');
  const banner = await frontendSource('src/Components/RecordingSaveBanner.jsx');
  assert.match(recording, /QUALITY_CHUNK_COMPLETE_RETRIES/);
  assert.match(recording, /QUALITY_CHUNK_COMPLETE_TIMEOUT_MS/);
  assert.match(recording, /timeoutMs:\s*QUALITY_CHUNK_COMPLETE_TIMEOUT_MS/);
  assert.match(recording, /completeQualityChunks/);
  assert.match(recording, /qualityCompletionPending/);
  assert.match(recording, /retryBroadcastQualityCompletion/);
  // Background autosave finalizes the server-side replay (no giant client
  // upload): End Broadcast finalizes, banner shows finalizing/retry/recovery.
  assert.match(autosave, /retryBroadcastQualityCompletion/);
  assert.match(autosave, /finalizeServerReplay/);
  assert.match(autosave, /!recording\.serverRecordingPrimary/);
  assert.match(autosave, /uploadRecoveryMasterToServer\(recording,\s*\{/);
  assert.match(autosave, /status:\s*'progress'/);
  assert.match(recording, /onProgress/);
  assert.match(recording, /uploadedBytes/);
  assert.match(autosave, /uploadCompressedRecoveryMasterToServer\(recording, broadcast\)/);
  assert.match(recording, /export const uploadCompressedRecoveryMasterToServer/);
  assert.match(recording, /apiFetch\('\/audio\/upload'/);
  assert.match(autosave, /getRecordingDevicePreferences/);
  assert.match(autosave, /saveAutomaticLocalCopy\(\{/);
  assert.match(autosave, /format:\s*preferences\.format/);
  assert.match(autosave, /completeDeviceCopyChoice/);
  assert.doesNotMatch(autosave, /uploadAudioWithProgress/);
  assert.doesNotMatch(autosave, /new File\(\[recording\.blob/);
  assert.match(autosave, /rememberLocalMaster/);
  assert.match(banner, /beforeunload/);
  assert.match(banner, /Retry/);
  assert.match(banner, /kind: 'finalizing'|finishing your Echoo recording/);
  assert.match(banner, /Save MP3 to device/);
  assert.match(banner, /Save WAV to device/);
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
  assert.match(banner, /Retry Echoo save/);
  assert.match(recording, /OPUS_FALLBACK_MAX_BYTES/);
  assert.match(recording, /fallbackOverflowed/);
  assert.match(recording, /bounded Opus fallback stopped to protect live-stream memory/);
  assert.match(recording, /OPFS_MANIFESTS_KEY/);
  assert.match(recording, /readRecoveryManifests/);
  assert.match(recording, /persistRecoveryManifests/);
  assert.match(recording, /new Blob\(\[file\], \{ type: WAV_MIME_TYPE \}\)/);
  assert.match(recording, /new Blob\(\[patched\], \{ type: WAV_MIME_TYPE \}\)/);
  assert.doesNotMatch(recording, /STALE_OPFS_FILE_MS/);
  assert.match(banner, /master\?\.recording\?\.dispose/);
});

test('server replay finalization stays non-blocking and cloud archive streams long files', async () => {
  const replay = await source('src/services/broadcastReplayService.js');
  const archive = await source('src/services/audioArchiveService.js');

  assert.doesNotMatch(replay, /spawnSync/);
  assert.match(replay, /const runCommand =/);
  assert.match(replay, /await probeMp3DurationSeconds/);
  assert.match(archive, /fs\.createReadStream\(localPath\)/);
  assert.match(archive, /ContentLength:\s*stat\.size/);
  assert.doesNotMatch(archive, /readFile\(localPath\)/);
});

test('recording recovery stays safe without cluttering unrelated Studio pages', async () => {
  const banner = await frontendSource('src/Components/RecordingSaveBanner.jsx');
  const autosave = await frontendSource('src/services/recordingAutosave.js');
  const css = await frontendSource('src/Components/RecordingSaveBanner.css');

  assert.match(banner, /is-safe-recovery/);
  assert.match(banner, /Recovered recording is safe/);
  assert.match(banner, /startsWith\('\/creator-studio\/recordings'\)/);
  assert.match(autosave, /batch3Service\.getProcessing\(broadcastId\)/);
  assert.match(autosave, /serverBroadcast\?\.replayAudio/);
  assert.match(banner, /Retrying Echoo save · \$\{elapsed\}s/);
  assert.match(css, /grid-template-columns:\s*22px minmax\(0, 1fr\)/);
  assert.match(css, /echoo-save-banner-actions/);
  assert.match(css, /is-error\.is-safe-recovery/);
  assert.doesNotMatch(css, /white-space:\s*nowrap;[\s\S]{0,120}echoo-save-banner-body/);
});

test('completed broadcast upload recovery marks replay lifecycle ready', async () => {
  const controller = await source('src/controllers/audioController.js');
  assert.match(controller, /sourceBroadcast\.replayAudioId = audio\._id/);
  assert.match(controller, /sourceBroadcast\.replayStatus = 'ready'/);
  assert.match(controller, /replayAudioId: existingAudio\._id/);
  assert.match(controller, /replayStatus: 'ready'/);
});

test('creator recording downloads stream natively instead of buffering whole audio in page memory', async () => {
  const studioService = await frontendSource('src/services/studioService.js');
  const recordings = await frontendSource('src/Components/CreatorStudio/CreatorCollectionsWorkspace.jsx');
  const detail = await frontendSource('src/Components/CreatorStudio/CreatorAudioDetailModal.jsx');
  const trim = await frontendSource('src/Components/CreatorStudio/CreatorAudioTrimSection.jsx');
  const streamController = await source('src/controllers/audioStreamController.js');
  const archive = await source('src/services/audioArchiveService.js');

  const downloadStart = studioService.indexOf('downloadAudio: async');
  const uploadStart = studioService.indexOf('uploadAudio: async', downloadStart);
  const downloadBlock = studioService.slice(downloadStart, uploadStart);

  assert.match(downloadBlock, /getAudioStreamUrl\(audioId\)/);
  assert.match(downloadBlock, /anchor\.href = downloadUrl/);
  assert.match(downloadBlock, /mode:\s*"native-stream"/);
  assert.doesNotMatch(downloadBlock, /response\.blob\(\)/);
  assert.doesNotMatch(downloadBlock, /new Blob\(/);
  assert.doesNotMatch(downloadBlock, /getReader\(\)/);
  assert.doesNotMatch(downloadBlock, /const chunks = \[\]/);
  assert.doesNotMatch(studioService, /getCompatibilityPlaybackUrl/);

  assert.match(streamController, /downloadUrl:/);
  assert.match(streamController, /downloadRequested/);
  assert.match(streamController, /attachment; filename/);
  assert.match(streamController, /getCloudObject\(audio\.cloudKey,\s*\{[\s\S]*range:/);
  assert.match(archive, /Range:\s*cleanRange/);

  assert.match(recordings, /Download started/);
  assert.match(recordings, /Preparing download/);
  assert.doesNotMatch(recordings, /onProgress:\s*\(\{ loaded, total \}\)/);
  assert.match(detail, /Download started\. Check your browser downloads\./);
  assert.match(trim, /Download started\. Check your browser downloads\./);
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
  const banner = await frontendSource('src/Components/RecordingSaveBanner.jsx');
  const studioService = await frontendSource('src/services/studioService.js');
  const trimController = await source('src/controllers/audioController.js');
  const trimService = await source('src/services/audioTrimService.js');
  const clientTrimService = await frontendSource('src/services/audioTrimService.js');
  const audioRoutes = await source('src/routes/audioRoutes.js');
  const audioModel = await source('src/models/Audio.js');
  const routes = await source('src/routes/index.js');

  assert.doesNotMatch(trim, /studioService\.deleteAudio\(id\)/);
  assert.doesNotMatch(trim, /uploadAudioWithProgress/);
  assert.doesNotMatch(trim, /new File\(/);
  assert.match(trim, /trimSavedAudio\(id/);
  assert.match(trim, /Trimmed copy saved\. You can download it now; the original is unchanged\./);
  assert.match(trim, /Download trimmed version/);
  assert.match(trim, /studioService\.downloadAudio\(trimmedId/);
  assert.match(trim, /availableFormats/);
  assert.match(trim, />Export</);
  assert.match(modal, /Download original/);
  assert.match(trim, /prepareTrimWaveform\(id/);
  assert.match(trim, /studioService\.getAudioStreamUrl\(id\)/);
  assert.doesNotMatch(trim, /\/audio\/\$\{encodeURIComponent\(id\)\}\/download/);
  assert.doesNotMatch(trim, /response\.blob\(\)/);
  assert.doesNotMatch(clientTrimService, /decodeAudioData/);
  assert.doesNotMatch(clientTrimService, /arrayBuffer\(\)/);
  assert.match(clientTrimService, /\/waveform/);
  assert.match(modal, /createPortal/);
  assert.match(modal, /document\.body/);

  assert.match(trimController, /const copy = await Audio\.create/);
  assert.match(trimController, /sourcePreserved:\s*true/);
  assert.match(trimController, /sourceBroadcast:\s*null/);
  assert.doesNotMatch(trimController, /findOneAndUpdate\([\s\S]{0,1000}'lastTrim\.startSeconds'/);
  assert.match(trimService, /case '\.mp3': return \['-c:a', 'libmp3lame', '-b:a', '320k'/);
  assert.match(trimService, /FFMPEG_REQUIRED/);
  assert.match(trimService, /TRIM_PROBE_TIMEOUT/);
  assert.match(trimService, /child\.kill\('SIGKILL'\)/);
  assert.match(trimService, /generateAudioWaveform/);
  assert.match(trimService, /-f', 's16le'/);
  assert.match(trimService, /WAVEFORM_TIMEOUT/);
  assert.match(trimController, /waveformJobs/);
  assert.match(trimController, /buildAndCacheWaveform/);
  assert.match(audioRoutes, /'\/:id\/waveform'/);
  assert.match(audioModel, /select:\s*false/);
  assert.match(routes, /health\/recording/);
  assert.match(routes, /automaticServerMp3:\s*capability\.ok && livekitRecorder\.available/);
  assert.match(routes, /recoveryMp3Assembly:\s*capability\.ok/);

  assert.match(exportService, /Server MP3 is still being prepared/);
  assert.match(exportService, /saveAutomaticLocalCopy/);
  assert.match(exportService, /destination:\s*'browser-downloads'/);
  assert.match(exportService, /isWavMaster/);
  assert.match(exportService, /encodeLocalWavToMp3/);
  assert.match(exportService, /browser-user-gesture-required/);
  assert.match(exportService, /requiresSecondTap/);
  assert.match(exportService, /prepared-local-mp3/);
  assert.match(exportService, /unverifiedDownload/);
  assert.match(exportService, /server-mp3-fallback/);
  assert.match(banner, /MP3 ready · Tap to save/);
  assert.match(banner, /browsers cannot confirm the file was actually retained/);
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


test('long broadcast recording uses RF64 and never materializes multi-GB desktop files in one IPC message', async () => {
  const recording = await frontendSource('src/services/broadcastRecordingService.js');
  const transcode = await frontendSource('src/services/localRecordingTranscode.js');
  const exportService = await frontendSource('src/services/recordingExportService.js');
  const preload = await desktopSource('src/preload.js');
  const desktopMain = await desktopSource('src/main.js');

  assert.match(recording, /createRf64Header/);
  assert.match(recording, /MASTER_HEADER_BYTES = RF64_HEADER_BYTES/);
  assert.doesNotMatch(recording, /MAX_WAV_DATA_BYTES/);
  assert.match(transcode, /\['RIFF', 'RF64'\]/);
  assert.match(exportService, /bytes\.stream\(\)\.getReader\(\)/);
  assert.match(exportService, /appendRecordingChunk/);
  assert.match(preload, /echoo:recording-save-begin/);
  assert.match(preload, /echoo:recording-save-chunk/);
  assert.match(desktopMain, /MAX_RECORDING_IPC_CHUNK_BYTES/);
  assert.match(desktopMain, /echoo:recording-save-finish/);

  // A 7-8 hour PCM RF64 master is many gigabytes. Long sessions must inspect
  // browser quota and fall back to disk-backed Opus, never an unbounded RAM
  // buffer, while preserving the same crash-recovery registry.
  assert.match(recording, /LONG_SESSION_TARGET_SECONDS = 8 \* 60 \* 60/);
  assert.match(recording, /navigator\.storage\?\.estimate/);
  assert.match(recording, /LOSSLESS_LONG_SESSION_TARGET_BYTES/);
  assert.match(recording, /LOSSLESS_STORAGE_HEADROOM_LOW/);
  assert.match(recording, /OPUS_MIN_LONG_SESSION_BITRATE = 64000/);
  assert.match(recording, /COMPRESSED_STORAGE_RESERVE_BYTES/);
  assert.match(recording, /resolveLongSessionCompressedBitrate/);
  assert.match(recording, /maxSustainableBitrate/);
  assert.match(recording, /fullTargetExpected/);
  assert.match(recording, /audioBitsPerSecond: storagePolicy\.bitrate/);
  assert.match(recording, /Local storage is very low for an 8-hour recovery recording/);
  assert.match(recording, /openCompressedRecordingFile/);
  assert.match(recording, /mode: storage \? 'compressed-opfs' : 'compressed-fallback'/);
  assert.match(recording, /await recording\.writable\.write\(event\.data\)/);
  assert.match(recording, /queueCompressedCheckpoint/);
  assert.match(recording, /isCompressedRecoveryManifest/);
  assert.match(recording, /opfs-opus-recovered/);
  assert.match(recording, /audio\/mp4;codecs=mp4a\.40\.2/);
  assert.match(recording, /compressedExtensionForMime/);
  assert.match(recording, /if \(mime\.includes\('webm'\)\) return 'webm'/);
  assert.match(recording, /if \(mime\.includes\('ogg'\)\) return 'ogg'/);
  assert.ok(
    recording.indexOf("if (mime.includes('webm')) return 'webm'") <
      recording.indexOf("if (mime.includes('opus')) return 'ogg'"),
    'WebM/Opus must keep its WebM container instead of being mislabeled as Ogg'
  );
  assert.match(recording, /activeRecording = await startFallbackRecording/);
  assert.match(recording, /await recording\.writable\?\.close\(\)/);
  assert.match(recording, /recording\.endedAt = Date\.now\(\)/);
  assert.match(recording, /recoverPendingBroadcastRecording\(id\)/);
  assert.match(recording, /recoveredDuringFinalize = true/);
  assert.match(recording, /readRecoveryManifest\(id \? \{ broadcastId: id \} : undefined\)/);
  assert.doesNotMatch(
    recording,
    /flushRecordingForPageHide[\s\S]{0,450}activeRecording\?\.writable\?\.close\(\)/
  );

  const autosave = await frontendSource('src/services/recordingAutosave.js');
  assert.doesNotMatch(autosave, /storageMode\.startsWith\('opfs'\)/);
  assert.match(autosave, /storageMode === 'opfs-stream'/);
  assert.match(autosave, /recoveryMime\.includes\('mp4'\)/);
  assert.match(autosave, /recoveryMime\.includes\('aac'\)/);
});

test('creator transport loss remains live under a durable long-session recovery lease', async () => {
  const webhook = await source('src/services/livekitWebhookService.js');
  const sweep = await source('src/services/livekitOrphanSweep.js');

  assert.match(webhook, /creatorRecoveryHours/);
  assert.match(webhook, /LIVEKIT_CREATOR_RECOVERY_TTL_HOURS/);
  assert.match(webhook, /const disconnectedAt = current\.creatorDisconnectedAt \|\| new Date\(\)/);
  assert.match(webhook, /creatorDisconnectedAt: disconnectedAt/);
  assert.match(webhook, /creatorDisconnectedAt: null/);
  assert.match(sweep, /getOrphanSweepIntervalMs/);
  assert.match(sweep, /Number\.isFinite\(raw\)/);
  assert.match(sweep, /10 \* 60 \* 1000/);
  assert.match(sweep, /startOrphanSweep/);
  assert.match(sweep, /setInterval/);
  assert.match(sweep, /creator program-audio discovery failed/);
});


test('server recording and end-broadcast cleanup reject stale or unbounded provider work', async () => {
  const recording = await source('src/services/livekitServerRecording.js');
  const lifecycle = await source('src/controllers/broadcastLifecycleController.js');

  assert.match(recording, /PROVIDER_CONTROL_TIMEOUT_MS = 5_000/);
  assert.match(recording, /WRITE_CHAIN_DRAIN_TIMEOUT_MS = 3_000/);
  assert.match(recording, /stopEgressBounded/);
  assert.match(recording, /desiredTracks\.get\(id\) !== track[\s\S]{0,500}stale recorder start/);
  assert.match(recording, /reason: !lifecycleStillLive[\s\S]{0,100}'broadcast-ended'/);
  assert.match(recording, /Server recording PCM drain timed out during finalization/);

  assert.match(lifecycle, /const cleanupWithin = async/);
  assert.match(lifecycle, /Server recording cleanup[\s\S]{0,120}12_000/);
  assert.match(lifecycle, /Broadcast output cleanup[\s\S]{0,120}3_000/);
  assert.match(lifecycle, /LiveKit room cleanup[\s\S]{0,120}4_000/);
});


test('ending lifecycle is authoritative over reconnect webhooks and late recorder starts', async () => {
  const webhook = await source('src/services/livekitWebhookService.js');
  const recording = await source('src/services/livekitServerRecording.js');

  assert.doesNotMatch(webhook, /status: \{ \$in: \['starting', 'live', 'ending'\] \}/);
  assert.match(webhook, /status: \{ \$in: \['starting', 'live'\] \}/);
  assert.match(webhook, /const cleanupWithin = async/);
  assert.match(webhook, /Server recording cleanup[\s\S]{0,160}12_000/);
  assert.match(webhook, /LiveKit room cleanup[\s\S]{0,160}4_000/);

  assert.match(recording, /PROVIDER_START_TIMEOUT_MS = 15_000/);
  assert.match(recording, /select\('status serverRecording'\)/);
  assert.match(recording, /\['starting', 'live'\]\.includes\(lifecycleStatus\)/);
  assert.match(recording, /lifecycleAfterStart = await Broadcast\.findById\(id\)\.select\('status'\)/);
  assert.match(recording, /late recorder start/);
  assert.match(recording, /reason: !lifecycleStillLive[\s\S]{0,100}'broadcast-ended'/);
});
