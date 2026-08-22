import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import Audio from '../src/models/Audio.js';
import TranscriptSegment from '../src/models/TranscriptSegment.js';
import TranscriptSession from '../src/models/TranscriptSession.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFile(path.join(root, relativePath), 'utf8');

test('TranscriptSession records provider state, offsets, frame progress and bounded errors', () => {
  const paths = TranscriptSession.schema.paths;
  for (const field of [
    'broadcastId',
    'creatorId',
    'state',
    'status',
    'provider',
    'model',
    'offsetMs',
    'captureOffset',
    'lastReceivedFrame',
    'lastSentFrame',
    'lastAcknowledgedFrame',
    'retryCount',
    'bufferedFramesDropped',
    'errorLog',
  ]) {
    assert.ok(paths[field], `TranscriptSession.${field} is required`);
  }
});

test('transcript segments are session-aware, confidence-aware and indexed for cursor search', () => {
  const paths = TranscriptSegment.schema.paths;
  assert.ok(paths.sessionId);
  assert.ok(paths.confidence);
  assert.ok(paths.providerRevision);
  assert.ok(paths.status);
  const indexes = TranscriptSegment.schema.indexes();
  assert.ok(indexes.some(([fields]) => fields.broadcastId === 1 && fields.startMs === 1 && fields._id === 1));
  assert.ok(indexes.some(([fields]) => fields.text === 'text'));
});

test('the provider URL is server-only and PCM ingress is bounded and authenticated', async () => {
  const frontend = await read('frontend/src/services/whisperFlowService.js');
  const gateway = await read('backend/src/services/transcriptionGateway.js');
  const app = await read('backend/src/app.js');
  const transcriptController = await read('backend/src/controllers/transcriptController.js');
  assert.doesNotMatch(frontend, /VITE_WHISPER_FLOW_URL|new WebSocket/);
  assert.match(frontend, /transcription:attach/);
  assert.match(frontend, /transcription:pcm/);
  assert.match(gateway, /WHISPER_FLOW_URL/);
  assert.match(gateway, /WHISPER_FLOW_API_KEY/);
  assert.match(gateway, /value\.type === 'ack'/);
  assert.match(gateway, /type: 'flush'/);
  assert.match(gateway, /PCM_FRAME_BYTES/);
  assert.match(gateway, /MAX_PCM_FRAMES_PER_SECOND/);
  assert.match(gateway, /maxBufferBytes/);
  assert.match(gateway, /maxBufferFrames/);
  assert.match(app, /verifyAccessToken/);
  assert.match(app, /attachTranscriptionSession/);
  assert.match(transcriptController, /healthUrl\.pathname = '\/health\/ready'/);
  assert.doesNotMatch(frontend, /WHISPER_FLOW_API_KEY|WHISPER_FLOW_URL/);
});

test('creator disconnect flush failures are contained in the background path', async () => {
  const gateway = await read('backend/src/services/transcriptionGateway.js');
  assert.match(gateway, /background disconnect flush will retry/);
  assert.match(gateway, /flushTranscriptionSession\(runtime\.session\._id[^;]+\.catch/s);
});

test('broadcast end cleans LiveKit immediately and hands transcript work to the durable processor', async () => {
  const lifecycle = await read('backend/src/controllers/broadcastLifecycleController.js');
  const processing = await read('backend/src/services/broadcastProcessingService.js');
  const provider = await read('backend/src/providers/livekit.js');
  assert.match(lifecycle, /enqueueBroadcastProcessing/);
  assert.match(processing, /flushBroadcastTranscription/);
  assert.match(processing, /BroadcastProcessingJob/);
  assert.match(lifecycle, /LiveKitProvider\.stopIngress\(ingressId\)/);
  assert.match(provider, /IngressClient/);
});

test('LiveKit webhooks use the signed raw body and a creator disconnect grace period', async () => {
  const app = await read('backend/src/app.js');
  const webhook = await read('backend/src/services/livekitWebhookService.js');
  assert.ok(app.indexOf("'/api/webhooks/livekit'") < app.indexOf("express.json({ limit: '10mb' })"));
  assert.match(webhook, /WebhookReceiver/);
  assert.match(webhook, /participant_left/);
  assert.match(webhook, /creatorStillPresent/);
});

test('one replay per broadcast is indexed and failed linking is compensated', async () => {
  const indexes = Audio.schema.indexes();
  assert.ok(indexes.some(([fields, options]) => fields.sourceBroadcast === 1 && options.unique === true));
  const controller = await read('backend/src/controllers/audioController.js');
  assert.match(controller, /REPLAY_ALREADY_EXISTS/);
  assert.match(controller, /replayAudio: previousReplayAudio/);
  assert.match(controller, /audioId: previousReplayAudio/);
});
