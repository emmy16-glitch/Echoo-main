import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Broadcast from '../src/models/Broadcast.js';
import Audio from '../src/models/Audio.js';
import TranscriptSegment from '../src/models/TranscriptSegment.js';
import BroadcastProcessingJob from '../src/models/BroadcastProcessingJob.js';

const source = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

test('broadcast assets have independent processing and visibility lifecycles', () => {
  assert.deepEqual(Broadcast.schema.path('assetStatus.transcript').enumValues, [
    'disabled', 'processing', 'ready_for_review', 'editing', 'published', 'failed',
  ]);
  assert.deepEqual(Broadcast.schema.path('assetVisibility.audio').enumValues, ['public', 'followers', 'private']);
  assert.deepEqual(Audio.schema.path('publicationStatus').enumValues, ['draft', 'published']);
  assert.ok(TranscriptSegment.schema.path('originalText'));
  assert.ok(TranscriptSegment.schema.path('editHistory'));
  assert.deepEqual(BroadcastProcessingJob.schema.path('status').enumValues, ['queued', 'processing', 'completed', 'failed']);
});

test('draft transcript events are creator-only and listener live has no transcript subscriptions', async () => {
  const persistence = await source('../src/services/transcriptPersistenceService.js');
  const app = await source('../src/app.js');
  const listener = await source('../../frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx');
  assert.match(persistence, /broadcast:\$\{broadcastObjectId\}:creator/);
  assert.match(app, /socket\.join\(`\$\{room\}:creator`\)/);
  assert.doesNotMatch(listener, /transcript:segment|transcript:finalized|TranscriptPanel/);
});

test('replay and transcript publishing are explicit independent creator actions', async () => {
  const controller = await source('../src/controllers/broadcastProcessingController.js');
  const routes = await source('../src/routes/broadcastRoutes.js');
  assert.match(controller, /publishReplay/);
  assert.match(controller, /publishTranscript/);
  assert.match(controller, /publicationStatus: 'published'/);
  assert.match(routes, /publish-replay/);
  assert.match(routes, /transcript\/publish/);
});

test('background retries cannot regress creator-published assets', async () => {
  const worker = await source('../src/services/broadcastProcessingService.js');
  assert.match(worker, /assetStatus\.transcript': \{ \$ne: 'published' \}/);
  assert.match(worker, /terminalValue = field === 'assetStatus\.transcript' \? 'published' : 'ready'/);
});
