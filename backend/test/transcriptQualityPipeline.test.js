import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), 'utf8');

test('Whisper runs a second quality pass over finalized post-master PCM while live', async () => {
  const [worker, websocket, model] = await Promise.all([
    source('../../echoo-whisper/whisper_worker.py'),
    source('../../echoo-whisper/websocket_server.py'),
    source('../../echoo-whisper/model_loader.py'),
  ]);

  assert.match(worker, /quality_model/);
  assert.match(worker, /asyncio\.create_task\(self\._run_quality_pass\(chunk\)\)/);
  assert.match(worker, /self\.quality_model\.transcribe_quality/);
  assert.match(worker, /await asyncio\.gather\(\*list\(self\._quality_tasks\)/);
  assert.match(worker, /quality transcript chunk failed; keeping fast transcript/);
  assert.match(websocket, /quality_model=quality_model_runtime/);
  assert.match(websocket, /"qualityPasses": session\.quality_passes/);
  assert.match(model, /def transcribe_quality/);
  assert.match(model, /WHISPER_QUALITY_BEAM_SIZE/);
  assert.match(model, /vad_filter=True/);
});

test('quality verification emits one canonical final segment instead of duplicating final sequences', async () => {
  const worker = await source('../../echoo-whisper/whisper_worker.py');

  const finalBranch = worker.slice(worker.indexOf('if final:'));
  assert.match(finalBranch, /QualityChunk\(/);
  assert.match(finalBranch, /await self\._schedule_quality_pass\(chunk\)/);
  assert.match(worker, /"status": "final"/);
  assert.match(worker, /"qualityPass": quality/);
  assert.match(worker, /elif result\.text:[\s\S]*"status": "partial"/);
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
  const mixerStop = workspace.indexOf('await stopEchooMixer', endCall);
  assert.ok(endCall >= 0 && mixerStop > endCall, 'mixer teardown must happen after the synchronized end service returns');
});

test('creator notification happens after transcript completion quality gate', async () => {
  const processing = await source('../src/services/broadcastProcessingService.js');

  const completionStart = processing.indexOf('const completeTranscript');
  const improvementStart = processing.indexOf('const improveTranscript');
  const notification = processing.indexOf("type: 'transcript_ready'");

  assert.ok(completionStart >= 0 && improvementStart > completionStart);
  assert.ok(notification > improvementStart, 'ready notification must be owned by the improvement/quality gate');
  assert.match(processing, /completionJob\?\.status !== 'completed'/);
  assert.match(processing, /'assetStatus\.transcript': 'ready_for_review'/);
});

test('raw and enhanced modes still converge on one audience/recording/transcription program feed', async () => {
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
  assert.match(publisher, /startBroadcastRecording\(\{[\s\S]*mediaTrack/);
  assert.match(publisher, /startWhisperFlowTranscription\(\{[\s\S]*mediaTrack/);
  assert.match(creatorMixer, /Raw Audio/);
  assert.match(creatorMixer, /Enhanced Audio/);
});
