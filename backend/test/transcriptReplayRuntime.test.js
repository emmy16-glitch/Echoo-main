import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import TranscriptSegment from '../src/models/TranscriptSegment.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');
const repositoryRoot = path.resolve(backendRoot, '..');
const read = (relativePath) => fs.readFile(path.join(repositoryRoot, relativePath), 'utf8');

test('transcript segments are idempotent per provider segment and ordered for replay', () => {
  const indexes = TranscriptSegment.schema.indexes();
  assert.ok(
    indexes.some(([fields, options]) =>
      fields.broadcastId === 1 &&
      fields.providerSegmentId === 1 &&
      options.unique === true
    ),
    'provider updates must replace one segment instead of duplicating partial text'
  );
  assert.ok(
    indexes.some(([fields]) =>
      fields.audioId === 1 && fields.sequence === 1 && fields.startMs === 1
    ),
    'replay transcript reads must have a timestamp ordering index'
  );
});

test('transcript routes require authentication and expose live plus replay reads', async () => {
  const routes = await read('backend/src/routes/transcriptRoutes.js');
  assert.match(routes, /router\.use\(authenticate\)/);
  assert.match(routes, /\/broadcast\/:broadcastId\/segments/);
  assert.match(routes, /\/broadcast\/:broadcastId\/finalize/);
  assert.match(routes, /\/audio\/:audioId/);
  assert.match(routes, /\/search/);
});

test('Whisper Flow is a parallel post-master branch and never a listener relay', async () => {
  const publisher = await read('frontend/src/services/livekitPublisher.js');
  const whisperFlow = await read('frontend/src/services/whisperFlowService.js');
  const gateway = await read('backend/src/services/transcriptionGateway.js');
  const listener = await read('frontend/src/Components/ListenerLiveExperience/LiveKitListenerPlayer.jsx');

  assert.match(publisher, /publishTrack\(mediaTrack/);
  assert.match(publisher, /startWhisperFlowTranscription/);
  assert.match(whisperFlow, /TARGET_SAMPLE_RATE = 16000/);
  assert.doesNotMatch(whisperFlow, /VITE_WHISPER_FLOW_URL|new WebSocket/);
  assert.match(whisperFlow, /transcription:pcm/);
  assert.match(gateway, /process\.env\.WHISPER_FLOW_URL/);
  assert.match(gateway, /persistTranscriptSegment/);
  assert.doesNotMatch(listener, /whisper|transcriptService/i);
});

test('completed recording upload links Broadcast, Audio and transcript atomically enough to recover', async () => {
  const controller = await read('backend/src/controllers/audioController.js');
  assert.match(controller, /sourceBroadcast\.replayAudio = audio\._id/);
  assert.match(controller, /TranscriptSegment\.updateMany/);
  assert.match(controller, /emit\('replay:ready'/);
  assert.match(controller, /Audio\.deleteOne\(\{ _id: audio\._id \}\)/);
});
