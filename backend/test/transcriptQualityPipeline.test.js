import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), 'utf8');

test('Whisper has distinct live-draft, inline-fallback, and dedicated durable quality modes', async () => {
  const [worker, websocket, model] = await Promise.all([
    source('../../echoo-whisper/whisper_worker.py'),
    source('../../echoo-whisper/websocket_server.py'),
    source('../../echoo-whisper/model_loader.py'),
  ]);

  assert.match(worker, /quality_pass: bool = False/);
  assert.match(worker, /quality_enabled: bool \| None = None/);
  assert.match(worker, /asyncio\.create_task\(self\._run_quality_after\(previous, chunk\)\)/);
  assert.match(worker, /self\.quality_model\.transcribe_quality/);
  assert.match(worker, /self\.model\.transcribe_quality/);
  assert.doesNotMatch(worker, /self\.model\.transcribe\([^\n]+True\)/);
  assert.match(worker, /if self\.quality_pass:[\s\S]*self\.quality_enabled = False/);
  assert.match(worker, /not self\.quality_pass[\s\S]*self\.partial_interval_ms/);
  assert.match(websocket, /quality_pass = bool\(start\.get\("qualityPass", False\)\)/);
  assert.match(websocket, /inline_quality = bool\(start\.get\("inlineQuality", True\)\) and not quality_pass/);
  assert.match(websocket, /selected_model = quality_model_runtime if quality_pass else model_runtime/);
  assert.match(websocket, /quality_enabled=inline_quality/);
  assert.match(model, /def transcribe_quality/);
  assert.match(model, /WHISPER_QUALITY_BEAM_SIZE/);
  assert.match(model, /vad_filter=True/);
});

test('quality verification emits one canonical final sequence and ordered inline fallback', async () => {
  const worker = await source('../../echoo-whisper/whisper_worker.py');

  assert.match(worker, /QualityChunk\(/);
  assert.match(worker, /await self\._schedule_quality_pass\(chunk\)/);
  assert.match(worker, /if previous is not None:[\s\S]*await asyncio\.gather\(previous/);
  assert.match(worker, /"status": "final"/);
  assert.match(worker, /"qualityPass": quality/);
  assert.match(worker, /elif result\.text:[\s\S]*"status": "partial"/);
});

test('durable quality chunk handshake disables duplicate inline quality only when it really started', async () => {
  const [gateway, recording] = await Promise.all([
    source('../src/services/transcriptionGateway.js'),
    source('../../frontend/src/services/broadcastRecordingService.js'),
  ]);

  assert.match(gateway, /qualityChunkingStartedAt qualityChunkingCompletedAt/);
  assert.match(gateway, /durableQualityActive = Boolean/);
  assert.match(gateway, /inlineQuality: !durableQualityActive/);
  assert.match(gateway, /inlineQuality: runtime\.inlineQuality !== false/);
  assert.match(recording, /QUALITY_CHUNK_START_RETRIES = 3/);
  assert.match(recording, /recording\.qualityChunkStarted = true/);
  assert.match(recording, /qualityBuffers\.push\(samples\)[\s\S]*if \(recording\.qualityChunkStarted\) void flushQualityChunk/);
  assert.match(recording, /!recording\.qualityChunkStarted \|\| recording\.qualityChunkDisabled/);
  assert.match(recording, /qualityChunkCount: recording\.qualityChunkIndex/);
});

test('durable quality chunk ingestion is idempotent, private, and retry-aligned', async () => {
  const [controller, model, jobModel] = await Promise.all([
    source('../src/controllers/broadcastChunkController.js'),
    source('../src/models/BroadcastAudioChunk.js'),
    source('../src/models/BroadcastProcessingJob.js'),
  ]);

  assert.match(controller, /QUALITY_JOB_MAX_ATTEMPTS = 8/);
  assert.match(controller, /validWavUpload/);
  assert.match(controller, /ensureQualityJob\(broadcastId, existing\)/);
  assert.match(controller, /maxAttempts: Number\(chunk\.maxAttempts\) \|\| QUALITY_JOB_MAX_ATTEMPTS/);
  assert.match(controller, /BroadcastAudioChunk\.deleteOne\(\{ _id: createdChunkId, status: 'pending' \}\)/);
  assert.match(model, /delete ret\.filePath/);
  assert.match(model, /delete ret\.creatorId/);
  assert.match(jobModel, /transcript_quality_chunk/);
  assert.match(jobModel, /broadcastId: 1, jobType: 1, chunkId: 1/);
});

test('quality provider failures are retryable and reconciliation cannot keep reusing a claimed draft row', async () => {
  const quality = await source('../src/services/transcriptQualityService.js');

  assert.match(quality, /const asRetryable/);
  assert.match(quality, /Whisper quality provider did not become ready in time/);
  assert.match(quality, /Whisper quality provider closed before completion/);
  assert.match(quality, /qualityPass: true/);
  assert.match(quality, /inlineQuality: false/);
  assert.match(quality, /!candidate\.qualityChunkId/);
  assert.match(quality, /!claimedDraftIds\.has\(String\(candidate\._id\)\)/);
  assert.match(quality, /isHidden: true/);
  assert.match(quality, /candidate\.correctedAt \|\| candidate\.editedText/);
});

test('creator end-live hands buffered PCM to backend and finalizes recording before mixer teardown', async () => {
  const [whisperClient, broadcastService, workspace] = await Promise.all([
    source('../../frontend/src/services/whisperFlowService.js'),
    source('../../frontend/src/services/batch3Service.js'),
    source('../../frontend/src/Components/CreatorStudio/CreatorLiveConnectedWorkspace.jsx'),
  ]);

  assert.match(whisperClient, /await drainForBackgroundHandoff\(session\)/);
  assert.match(broadcastService, /await stopWhisperFlowTranscription\(\{ finalize: false \}\)/);
  assert.match(broadcastService, /const recording = await finishBroadcastRecording\(broadcastId\)/);
  assert.match(broadcastService, /recordingReady = true/);
  assert.doesNotMatch(broadcastService, /void \(async \(\) => \{[\s\S]*finishBroadcastRecording/);

  const endCall = workspace.indexOf('await batch3Service.endBroadcast');
  const mixerStop = workspace.indexOf('stopLiveKitPublishing', endCall);
  assert.ok(endCall >= 0 && mixerStop > endCall, 'mixer teardown must happen after the synchronized end service returns');
});

test('transcript review waits for the entire durable chunk handoff and then notifies once', async () => {
  const processing = await source('../src/services/broadcastProcessingService.js');

  const completionStart = processing.indexOf('const completeTranscript');
  const improvementStart = processing.indexOf('const improveTranscript');
  const notification = processing.indexOf("type: 'transcript_ready'");

  assert.ok(completionStart >= 0 && improvementStart > completionStart);
  assert.ok(notification > improvementStart, 'ready notification must be owned by the improvement/quality gate');
  assert.match(processing, /broadcast\.qualityChunkingStartedAt && !broadcast\.qualityChunkingCompletedAt/);
  assert.match(processing, /completionJob\?\.status !== 'completed'/);
  assert.match(processing, /'assetStatus\.transcript': 'ready_for_review'/);
});

test('long-form quality chunk traffic uses the centralized API limiter instead of the obsolete 100-per-15m ceiling', async () => {
  const [app, limiter] = await Promise.all([
    source('../src/app.js'),
    source('../src/middleware/rateLimiter.js'),
  ]);

  assert.match(app, /import \{ defaultLimiter \} from '\.\/middleware\/rateLimiter\.js'/);
  assert.match(app, /app\.use\('\/api', defaultLimiter\)/);
  assert.doesNotMatch(app, /15 \* 60 \* 1000[\s\S]{0,200}max:\s*100/);
  assert.match(limiter, /export const defaultLimiter/);
  assert.match(limiter, /limit: 600/);
});

test('raw and enhanced modes still converge on one audience, recording and transcription program feed', async () => {
  const [engine, mixer, publisher, creatorMixer] = await Promise.all([
    source('../../frontend/src/services/echooAudioProcessingEngine.js'),
    source('../../frontend/src/services/echooMixerService.js'),
    source('../../frontend/src/services/livekitPublisher.js'),
    source('../../frontend/src/Components/CreatorStudio/CreatorAudioMixer.jsx'),
  ]);

  assert.match(engine, /inputNode\.connect\(rawGain\)/);
  assert.match(engine, /inputNode\.connect\(enhancedGain\)/);
  assert.match(mixer, /masterAnalyser\.connect\(destinationNode\)/);
  assert.match(publisher, /name:\s*'echoo-studio-mix'/);
  assert.match(publisher, /ensureBroadcastRecording\(\{[\s\S]*mediaTrack/);
  assert.match(publisher, /startWhisperFlowTranscription\(\{[\s\S]*mediaTrack/);
  assert.match(creatorMixer, /Raw Audio/);
  assert.match(creatorMixer, /Enhanced Audio/);
});

test('creator review hides superseded quality drafts and listener live still receives no transcript', async () => {
  const [review, listenerRoom] = await Promise.all([
    source('../../frontend/src/Components/CreatorStudio/CreatorBroadcastProcessing.jsx'),
    source('../../frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx'),
  ]);
  assert.match(review, /filter\(\(segment\) => !segment\.isHidden\)/);
  assert.doesNotMatch(listenerRoom, /transcript:segment/);
  assert.doesNotMatch(listenerRoom, /transcript:finalized/);
});
