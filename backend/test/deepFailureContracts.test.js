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

test('creator authorization rejects listener credentials before controller logic', async () => {
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
  assert.match(routes, /const creatorOnly = authorize\('creator', 'admin'\)/);
  for (const fragment of [
    "router.post('/', authenticate, creatorOnly, createBroadcast)",
    "router.patch('/:broadcastId', authenticate, creatorOnly, updateBroadcast)",
    "router.delete('/:broadcastId', authenticate, creatorOnly, deleteBroadcast)",
    "router.post('/:broadcastId/discard-replay', authenticate, creatorOnly, discardReplay)",
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
  assert.match(routes, /searchReplayTranscripts as searchReplayTranscriptsWithAccess/);
  assert.match(routes, /router\.get\('\/search', searchReplayTranscriptsWithAccess\)/);
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
  assert.match(quality, /qualitySegments\.length === 0/);
  assert.match(quality, /silence/i);
  assert.match(quality, /qualityChunkId:\s*chunk\._id/);
  assert.match(quality, /qualitySegmentIndex:\s*index/);
  assert.match(quality, /existingQuality/);
  assert.match(quality, /qualityEnd\s*=\s*Math\.min\(chunk\.endMs/);
});

test('prerequisite waiting does not burn processing retry attempts', async () => {
  const processing = await source('src/services/broadcastProcessingService.js');
  assert.match(processing, /waiting:\s*true/);
  assert.match(processing, /const prerequisiteWait = Boolean\(error\?\.waiting\)/);
  assert.match(processing, /job\.attempts = Math\.max\(0, Number\(job\.attempts \|\| 0\) - 1\)/);
  assert.match(processing, /TranscriptSession\.countDocuments/);
  assert.match(processing, /failed without a durable quality recording path/);
});

test('recording completion acknowledgement retries and pending recording preserves recovery state', async () => {
  const recording = await frontendSource('src/services/broadcastRecordingService.js');
  const prompt = await frontendSource('src/Components/CreatorStudio/BroadcastRecordingPrompt.jsx');
  assert.match(recording, /QUALITY_CHUNK_COMPLETE_RETRIES/);
  assert.match(recording, /completeQualityChunks/);
  assert.match(recording, /qualityCompletionPending/);
  assert.match(recording, /retryPendingQualityCompletion/);
  assert.match(prompt, /retryPendingQualityCompletion/);
  assert.match(prompt, /discard-replay/);
});

test('protected downloads use one canonical authorization boundary from route to bytes', async () => {
  const routes = await source('src/routes/audioRoutes.js');
  const middleware = await source('src/middleware/audioDownloadAccess.js');
  const controller = await source('src/controllers/audioDownloadController.js');
  assert.match(routes, /requireAudioDownloadAccess/);
  assert.match(routes, /downloadAuthorizedAudio/);
  assert.match(middleware, /canAccessReplayAudio/);
  assert.match(controller, /req\.authorizedAudio/);
  assert.doesNotMatch(routes, /downloadAudio\)/);
});

test('CI executes the browser audit and syntax-checks new security controllers', async () => {
  const workflow = await fs.readFile(new URL('../../.github/workflows/echoo-check.yml', import.meta.url), 'utf8');
  assert.match(workflow, /frontend-e2e:/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /npm run test:e2e/);
  assert.match(workflow, /audioDownloadController\.js/);
  assert.match(workflow, /transcriptSearchController\.js/);
  assert.match(workflow, /broadcastProcessingController\.js/);
  assert.match(workflow, /audioDownloadAccess\.js/);
});
