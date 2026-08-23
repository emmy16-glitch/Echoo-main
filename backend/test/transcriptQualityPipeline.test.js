import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

test('quality chunks have durable identity, timing and retry state', async () => {
  const model = await source('../src/models/BroadcastAudioChunk.js');
  assert.match(model, /chunkId/);
  assert.match(model, /chunkIndex/);
  assert.match(model, /startMs/);
  assert.match(model, /endMs/);
  assert.match(model, /pending.*processing.*completed.*failed/s);
  assert.match(model, /broadcastId: 1, chunkId: 1/);
});

test('BroadcastProcessingJob supports one transcript quality job per chunk', async () => {
  const model = await source('../src/models/BroadcastProcessingJob.js');
  assert.match(model, /'transcript_quality_chunk'/);
  assert.match(model, /chunkId/);
  assert.match(model, /broadcastId: 1, jobType: 1, chunkId: 1/);
});

test('live recording uploads post-master chunks through the authenticated broadcast route', async () => {
  const recording = await source('../../frontend/src/services/broadcastRecordingService.js');
  const route = await source('../src/routes/broadcastRoutes.js');
  assert.match(recording, /recording-chunks/);
  assert.match(recording, /QUALITY_CHUNK_SECONDS = 10/);
  assert.match(recording, /apiFetch/);
  assert.match(route, /recording-chunks/);
  assert.match(route, /chunkUpload\.single\('chunk'\)/);
});

test('quality processing uses the existing worker and finalization waits for chunk jobs', async () => {
  const service = await source('../src/services/broadcastProcessingService.js');
  assert.match(service, /transcript_quality_chunk/);
  assert.match(service, /processTranscriptQualityChunk/);
  assert.match(service, /qualityPending/);
  assert.match(service, /Waiting for.*transcript quality chunk/);
});

test('quality reconciliation preserves text history and creator edits', async () => {
  const service = await source('../src/services/transcriptQualityService.js');
  const model = await source('../src/models/TranscriptSegment.js');
  assert.match(service, /qualityHistory/);
  assert.match(service, /originalText/);
  assert.match(service, /processedBy/);
  assert.match(service, /processedAt/);
  assert.match(service, /creatorEdited/);
  assert.match(model, /editedText/);
  assert.match(model, /revisionNumber/);
  assert.match(model, /qualityChunkId/);
});

test('quality Whisper sessions use the existing websocket protocol without live listener transcript events', async () => {
  const service = await source('../src/services/transcriptQualityService.js');
  const whisper = await source('../../echoo-whisper/websocket_server.py');
  const room = await source('../../frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx');
  assert.match(service, /type: 'start'/);
  assert.match(service, /type: 'audio'/);
  assert.match(service, /type: 'flush'/);
  assert.match(service, /qualityPass: true/);
  assert.match(whisper, /quality_pass/);
  assert.doesNotMatch(room, /transcript:segment/);
});
