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
  assert.ok(Broadcast.schema.path('creatorDisconnectedAt'));
  assert.ok(Broadcast.schema.path('creatorParticipantSid'));
});

test('creator publishes only the named post-master mix and exposes real health milestones', async () => {
  const publisher = await source('../../frontend/src/services/livekitPublisher.js');

  assert.match(publisher, /publishTrack\(mediaTrack/);
  assert.match(publisher, /name:\s*'echoo-studio-mix'/);
  assert.doesNotMatch(publisher, /createLocalAudioTrack|setMicrophoneEnabled/);
  assert.match(publisher, /\[Echoo Studio\] mixer ready/);
  assert.match(publisher, /\[Echoo LiveKit\] connected/);
  assert.match(publisher, /\[Echoo LiveKit\] track published/);
  assert.match(publisher, /localRecordingStart = ensureBroadcastRecording\(\{[\s\S]*mediaTrack/);
  assert.match(publisher, /LOCAL_RECORDING_START_BUDGET_MS = 750/);
  assert.match(publisher, /armBroadcastServerRecording\(id\)/);
  assert.doesNotMatch(publisher, /startWhisperFlowTranscription/);
});

test('End Broadcast gives the creator track a bounded drain window before stopping the server recorder', async () => {
  const lifecycle = await source('../src/controllers/broadcastLifecycleController.js');
  const readiness = await source('../src/services/broadcastAudioReadiness.js');

  assert.match(lifecycle, /waitForCreatorProgramAudioToStop\(broadcastId, req\.userId/);
  assert.match(lifecycle, /maxWaitMs:\s*2500/);
  assert.match(readiness, /creatorProgramAudioIsPresent/);
  assert.match(readiness, /while \(Date\.now\(\) < deadline\)/);
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
  assert.match(room, /description: item\?\.description \|\| ''/);
  const shell = await source('../../frontend/src/Components/ListenerV2/ListenerV2.jsx');
  assert.match(shell, /onStateChange=\{setLivePlayerState\}/);
  assert.match(room, /livePlayerState: liveState/);
  assert.doesNotMatch(room, /<LiveKitListenerPlayer/);
});


test('creator webhook recovery ignores stale participant and track removal events', async () => {
  const webhook = await source('../src/services/livekitWebhookService.js');

  assert.match(webhook, /clearCreatorProgramTrackIfCurrent/);
  assert.match(webhook, /programTrackSid:\s*sid/);
  assert.match(webhook, /event\.track\?\.sid/);
  assert.match(webhook, /findCreatorProgramAudio\([\s\S]{0,120}current\._id,[\s\S]{0,120}current\.creator/);
  assert.match(webhook, /healRecoveredProgramAudio/);
  assert.match(webhook, /scheduleCreatorDisconnect\([\s\S]{0,180}updated\.creatorDisconnectedAt/);
});

test('program-track loss uses the durable recovery lease even while creator transport remains connected', async () => {
  const webhook = await source('../src/services/livekitWebhookService.js');
  const readiness = await source('../src/services/broadcastAudioReadiness.js');
  const sweep = await source('../src/services/livekitOrphanSweep.js');

  assert.match(webhook, /creatorDisconnectedAt:\s*new Date\(\)/);
  assert.match(webhook, /track_unpublished[\s\S]{0,2600}scheduleCreatorDisconnect/);
  assert.match(webhook, /track_published[\s\S]{0,220}cancelCreatorDisconnect\(broadcastId\)/);
  assert.match(webhook, /findCreatorProgramAudio\(current\._id, current\.creator\)/);
  assert.match(readiness, /export async function findCreatorProgramAudio/);
  assert.match(sweep, /findCreatorProgramAudio\(fresh\._id, fresh\.creator\)/);
  assert.match(sweep, /healProgramAudioState/);
  assert.match(sweep, /ensureLiveKitServerRecording\(/);
  assert.match(sweep, /trackSid: doc\.programTrackSid/);
  assert.match(sweep, /doc\.mediaState = 'audio_live'/);
  assert.match(sweep, /fresh\.creatorDisconnectedAt = new Date\(\)/);
});


test('creator recovery is decoupled from the LiveKit room and keeps retrying for long shows', async () => {
  const publisher = await source('../../frontend/src/services/livekitPublisher.js');
  const webhook = await source('../src/services/livekitWebhookService.js');
  const lifecycle = await source('../src/controllers/broadcastLifecycleController.js');
  const envExample = await source('../.env.example');

  assert.match(publisher, /CREATOR_RECOVERY_WINDOW_MS = 90_000/);
  assert.match(publisher, /CREATOR_RECOVERY_SLOW_RETRY_MS = 30_000/);
  assert.match(publisher, /while \(isCurrent\(candidate\)\)/);
  assert.match(publisher, /candidate\.recoveryStartedAt = null/);
  assert.match(webhook, /LIVEKIT_CREATOR_RECOVERY_TTL_HOURS \|\| 24/);
  assert.match(webhook, /const disconnectedAt = current\.creatorDisconnectedAt \|\| new Date\(\)/);
  assert.match(webhook, /creatorDisconnectedAt: disconnectedAt/);
  assert.match(webhook, /event\.event === 'participant_joined'[\s\S]{0,1400}\{ mediaState: 'creator_connecting' \}/);
  assert.match(webhook, /mediaState: 'audio_live'[\s\S]{0,180}creatorDisconnectedAt: null/);
  assert.match(lifecycle, /broadcast\.creatorParticipantSid = publisher\.participantSid \|\| null/);
  assert.match(lifecycle, /broadcast\.status === 'live'[\s\S]{0,1800}broadcast\.creatorDisconnectedAt = null[\s\S]{0,500}broadcast\.programTrackSid/);
  assert.match(envExample, /LIVEKIT_CREATOR_RECOVERY_TTL_HOURS=24/);
});

test('creator webhook ignores obsolete participant sessions and long sessions prevent suspension', async () => {
  const webhook = await source('../src/services/livekitWebhookService.js');
  const workspace = await source('../../frontend/src/Components/CreatorStudio/CreatorLiveConnectedWorkspace.jsx');
  const keepAwake = await source('../../frontend/src/services/liveSessionKeepAwake.js');
  const desktopMain = await source('../../desktop/src/main.js');
  const desktopPreload = await source('../../desktop/src/preload.js');

  assert.match(webhook, /leavingParticipantSid/);
  assert.match(webhook, /currentParticipantSid/);
  assert.match(webhook, /leavingParticipantSid !== currentParticipantSid/);
  assert.match(webhook, /findCreatorProgramAudio\([\s\S]{0,160}current\._id,[\s\S]{0,160}current\.creator/);
  assert.match(webhook, /replacementProgram/);
  assert.match(webhook, /excludeParticipantSid: leavingParticipantSid/);
  assert.match(webhook, /creatorParticipantSid: joinedParticipantSid/);
  assert.match(webhook, /Joining restores transport only/);
  assert.match(webhook, /mediaState: \{ \$ne: 'audio_live' \}/);
  assert.match(webhook, /findCreatorProgramAudioByTrackSid/);
  assert.match(webhook, /currentProgramStillLive/);
  assert.match(webhook, /publishedTrackIsAuthoritative/);
  assert.match(webhook, /ignored stale creator track_published/);
  assert.match(webhook, /excludeTrackSid: String\(event\?\.track\?\.sid \|\| ''\)\.trim\(\)/);
  assert.match(webhook, /track_unpublished[\s\S]{0,1700}replacementProgram[\s\S]{0,900}healRecoveredProgramAudio/);
  assert.match(webhook, /track_published[\s\S]{0,1200}cancelCreatorDisconnect\(broadcastId\)/);
  assert.match(webhook, /scheduleCreatorDisconnect\([\s\S]{0,180}updated\.creatorDisconnectedAt/);
  assert.match(keepAwake, /navigator\.wakeLock\?\.request === 'function'/);
  assert.match(keepAwake, /navigator\.wakeLock\.request\('screen'\)/);
  assert.match(keepAwake, /visibilitychange/);
  assert.match(workspace, /startCreatorSessionKeepAwake/);
  assert.match(workspace, /keepAwake: Boolean\(currentLiveBroadcast\?\.id\)/);
  assert.match(desktopMain, /powerSaveBlocker\.start\('prevent-app-suspension'\)/);
  assert.match(desktopMain, /syncPowerSaveBlocker\(\)/);
  assert.match(desktopPreload, /keepAwake: state\?\.keepAwake === true/);
});

test('creator reconnect supervisor bounds LiveKit native recovery and replaces stale rooms', async () => {
  const publisher = await source('../../frontend/src/services/livekitPublisher.js');

  assert.match(publisher, /DefaultReconnectPolicy/);
  assert.match(publisher, /LIVEKIT_RECONNECT_DELAYS_MS/);
  assert.match(publisher, /RoomEvent\.SignalReconnecting/);
  assert.match(publisher, /RoomEvent\.Reconnecting[\s\S]{0,500}armReconnectDeadline\(room, candidate\)/);
  assert.match(publisher, /CREATOR_HARD_RECONNECT_DEADLINE_MS/);
  assert.match(publisher, /schedulePublisherRecovery\(candidate, 'reconnect_deadline_exceeded', true\)/);
  assert.match(publisher, /clearReconnectDeadline\(candidate\)/);
  assert.match(publisher, /roomCanCarryMedia\(activeRoom\)/);
});


test('transport disconnect cannot terminate a normal seven-hour broadcast', async () => {
  const webhook = await source('../src/services/livekitWebhookService.js');
  const sweep = await source('../src/services/livekitOrphanSweep.js');

  assert.match(webhook, /CREATOR_RECOVERY_TTL_MS/);
  assert.match(webhook, /creatorRecoveryHours\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.match(webhook, /endExpiredDisconnectedBroadcast/);
  assert.doesNotMatch(webhook, /CREATOR_DISCONNECT_GRACE_MS/);
  assert.match(sweep, /getCreatorRecoveryHours/);
  assert.match(sweep, /mediaState === 'audio_disconnected'/);
  assert.match(sweep, /creatorDisconnectedAt/);
  assert.match(sweep, /findCreatorProgramAudio\(fresh\._id, fresh\.creator\)/);
});
