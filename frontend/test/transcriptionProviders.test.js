import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { dedupeOverlap } from '../src/services/transcription/dedupe.js';
import { TranscriptUploadQueue } from '../src/services/transcription/uploadQueue.js';

const source = (relativePath) => fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Gemini overlap dedupe is punctuation/case insensitive but conservative', () => {
  assert.equal(
    dedupeOverlap('Welcome to Echoo, Lagos Nigeria.', 'LAGOS, Nigeria! We are live now.'),
    'We are live now.'
  );
  assert.equal(dedupeOverlap('very very', 'very important'), 'very important');
  assert.equal(
    dedupeOverlap('Pastor Chinedu is joining us', 'Chinedu is joining us from Abuja'),
    'from Abuja'
  );
});

test('bounded upload queue retries and keeps a newer in-flight revision', async () => {
  const uploaded = [];
  let releaseFirst;
  const first = new Promise((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  const queue = new TranscriptUploadQueue({
    maxItems: 3,
    retryBaseMs: 1,
    upload: async (segment) => {
      calls += 1;
      uploaded.push(segment.text);
      if (calls === 1) await first;
    },
  });

  queue.enqueue({ providerSegmentId: 'seg-1', providerRevision: 0, text: 'partial' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  queue.enqueue({ providerSegmentId: 'seg-1', providerRevision: 1, text: 'final' });
  releaseFirst();
  assert.equal(await queue.flush({ timeoutMs: 500 }), true);
  assert.deepEqual(uploaded, ['partial', 'final']);
});

test('Parakeet worker uses the verified stateful streaming API', async () => {
  const worker = await source('src/workers/parakeet.worker.js');
  assert.match(worker, /createStreamingTranscriber/);
  assert.match(worker, /transcriber\.processChunk\(audio\)/);
  assert.match(worker, /transcriber\.finalize\(\)/);
  assert.doesNotMatch(worker, /pushAudioChunk/);
});

test('LiveKit publishes first and transcription remains an isolated side-car', async () => {
  const publisher = await source('src/services/livekitPublisher.js');
  const publishIndex = publisher.indexOf('publishTrack(mediaTrack');
  const transcriptionIndex = publisher.indexOf('startEchooTranscription({');
  assert.ok(publishIndex >= 0, 'post-master track should publish to LiveKit');
  assert.ok(transcriptionIndex > publishIndex, 'transcription must start only after LiveKit publish');
  assert.match(publisher, /realtime transcription is unavailable; live audio continues/);
  assert.doesNotMatch(publisher, /startWhisperFlowTranscription/);
});

test('Gemini provider rotates before the service limit with overlap replay', async () => {
  const provider = await source('src/services/transcription/GeminiLiveProvider.js');
  assert.match(provider, /this\.rotateMs = 560000/);
  assert.match(provider, /this\.overlapMs = 5000/);
  assert.match(provider, /const next = await this\.openSession\(nextIndex\)/);
  assert.match(provider, /for \(const chunk of this\.overlapAudio\)/);
  assert.match(provider, /oldSession\.close\(\)/);
  assert.match(provider, /this\.scheduleRotation\(\)/);
});

test('Parakeet is preloaded from the creator publishing bundle and not globally from main', async () => {
  const orchestrator = await source('src/services/transcription/orchestrator.js');
  const main = await source('src/main.jsx');
  assert.match(orchestrator, /requestIdleCallback/);
  assert.match(orchestrator, /preloadCreatorTranscription/);
  assert.doesNotMatch(main, /parakeet|preloadCreatorTranscription/i);
});
