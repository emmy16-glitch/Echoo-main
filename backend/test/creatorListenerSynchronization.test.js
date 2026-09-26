import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import Broadcast from '../src/models/Broadcast.js';

const source = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), 'utf8');

test('broadcast state stores authoritative media and transcript lifecycle values', () => {
  const mediaState = Broadcast.schema.path('mediaState');
  const transcriptState = Broadcast.schema.path('transcriptState');

  assert.deepEqual(mediaState.enumValues, [
    'waiting_for_creator',
    'creator_connecting',
    'audio_live',
    'audio_paused',
    'audio_disconnected',
  ]);
  assert.deepEqual(transcriptState.enumValues, [
    'disabled',
    'connecting',
    'connected',
    'reconnecting',
    'failed',
    'completed',
  ]);
  assert.ok(Broadcast.schema.path('programTrackSid'));
  assert.ok(Broadcast.schema.path('programTrackName'));
});

test('creator publishes only the named post-master mix and exposes real health milestones', async () => {
  const publisher = await source('../../frontend/src/services/livekitPublisher.js');

  assert.match(publisher, /publishTrack\(mediaTrack/);
  assert.match(publisher, /name:\s*'echoo-studio-mix'/);
  assert.doesNotMatch(publisher, /createLocalAudioTrack|setMicrophoneEnabled/);
  assert.match(publisher, /\[Echoo Studio\] mixer ready/);
  assert.match(publisher, /\[Echoo LiveKit\] connected/);
  assert.match(publisher, /\[Echoo LiveKit\] track published/);
  assert.match(publisher, /void ensureBroadcastRecording\(\{[\s\S]*mediaTrack/);
  assert.doesNotMatch(publisher, /startWhisperFlowTranscription/);
});

test('backend broadcasts media state and accepts only Echoo program-track webhooks', async () => {
  const lifecycle = await source('../src/controllers/broadcastLifecycleController.js');
  const webhook = await source('../src/services/livekitWebhookService.js');

  assert.match(lifecycle, /'broadcast:status'/);
  assert.match(lifecycle, /mediaState:\s*broadcast\.mediaState/);
  assert.match(lifecycle, /transcriptState:\s*broadcast\.transcriptState/);
  assert.match(webhook, /trackName === 'echoo-studio-mix'/);
  assert.match(webhook, /mediaState:\s*'audio_live'/);
  assert.match(webhook, /mediaState:\s*'audio_disconnected'/);
});

test('listener consumes real LiveKit states without receiving live transcript data', async () => {
  const player = await source('../../frontend/src/Components/ListenerLiveExperience/LiveKitListenerPlayer.jsx');
  const room = await source('../../frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx');
  const service = await source('../../frontend/src/services/batch3Service.js');

  for (const label of [
    'Waiting for creator',
    'Creator connecting',
    'Audio live',
    'Audio disconnected',
  ]) assert.match(player + room, new RegExp(label));

  // Guest and signed-in users may obtain different subscriber credentials,
  // but both must enter this one canonical LiveKit playback engine.
  assert.match(service, /getListenerCredentials/);
  assert.match(player, /batch3Service\.getListenerCredentials\(broadcastId, \{ guest \}\)/);
  assert.doesNotMatch(player, /batch3Service\.getGuestListenerToken/);
  assert.doesNotMatch(player, /batch3Service\.getListenerLiveKitToken/);

  assert.doesNotMatch(room, /transcript:segment/);
  assert.doesNotMatch(room, /transcript:finalized/);
  assert.doesNotMatch(room, /TranscriptPanel/);
  assert.match(room, /Live audio on Echoo/);
  assert.match(room, /onStateChange=\{handleLivePlayerState\}/);
});


test('creator webhook recovery ignores stale participant and track removal events', async () => {
  const webhook = await source('../src/services/livekitWebhookService.js');

  assert.match(webhook, /clearCreatorProgramTrackIfCurrent/);
  assert.match(webhook, /programTrackSid:\s*sid/);
  assert.match(webhook, /event\.track\?\.sid/);
  assert.match(webhook, /const replacementPresent = current[\s\S]*creatorStillPresent\(current\)\.catch\(\(\) => true\)/);
  assert.match(webhook, /scheduleCreatorDisconnect\(broadcastId/);
});


test('creator recovery and backend disconnect cleanup share the same 90 second window', async () => {
  const publisher = await source('../../frontend/src/services/livekitPublisher.js');
  const webhook = await source('../src/services/livekitWebhookService.js');
  const envExample = await source('../.env.example');

  assert.match(publisher, /CREATOR_RECOVERY_WINDOW_MS = 90_000/);
  assert.match(webhook, /LIVEKIT_CREATOR_DISCONNECT_GRACE_MS\) \|\| 90000/);
  assert.match(envExample, /LIVEKIT_CREATOR_DISCONNECT_GRACE_MS=90000/);
});
