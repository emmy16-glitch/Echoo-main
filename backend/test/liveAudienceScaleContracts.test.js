import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), 'utf8');

test('large live audience uses selective single-track subscription and jittered recovery', async () => {
  const listener = await read('../../frontend/src/Components/ListenerLiveExperience/LiveKitListenerPlayer.jsx');
  const provider = await read('../src/providers/livekit.js');

  assert.match(listener, /autoSubscribe:\s*false/);
  assert.match(listener, /publication\.setSubscribed\(true\)/);
  assert.match(listener, /isEchooProgramPublication/);
  assert.match(listener, /reconnectJitterRef = useRef\(Math\.random\(\)\)/);
  assert.match(listener, /jitterWindow/);

  assert.match(provider, /maxParticipants:\s*5000/);
  assert.match(provider, /canPublish:\s*false/);
  assert.match(provider, /canSubscribe:\s*true/);
  assert.match(provider, /hidden:\s*true/);
});

test('Socket.IO presence is coalesced and does not broadcast per-listener join/leave events', async () => {
  const app = await read('../src/app.js');
  const listenerRoom = await read('../../frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx');

  assert.match(app, /socketBroadcastInflight/);
  assert.match(app, /resolveBroadcastPresence\(key\)/);
  assert.match(app, /SOCKET_PRESENCE_COALESCE_MS/);
  assert.doesNotMatch(app, /emit\('listener_joined'/);
  assert.doesNotMatch(app, /emit\('listener_left'/);

  assert.match(listenerRoom, /const onPresence = \(payload\) =>/);
  assert.match(listenerRoom, /connectedSocket\.on\('presence:changed', onPresence\)/);
  assert.doesNotMatch(listenerRoom, /connectedSocket\.on\('presence:changed', refreshPresence\)/);
  assert.doesNotMatch(listenerRoom, /Promise\.all\(\[loadChat\(\), refreshPresence\(\)\]\)/);
  assert.match(listenerRoom, /if \(!chatOpen \|\| previewMode \|\| isGuest\) return/);
  assert.match(listenerRoom, /25_000 \+ Math\.round\(Math\.random\(\) \* 20_000\)/);
  assert.doesNotMatch(listenerRoom, /loadChat\(\{ silent: true \}\)/);
});

test('audience join bursts coalesce token/card database reads and keep shared-NAT headroom', async () => {
  const controller = await read('../src/controllers/broadcastController.js');
  const limiter = await read('../src/middleware/rateLimiter.js');

  assert.match(controller, /LIVE_ACCESS_CACHE_MS/);
  assert.match(controller, /liveAccessInflight/);
  assert.match(controller, /getLiveAccessBroadcast\(broadcastId\)/);
  assert.match(controller, /PUBLIC_BROADCAST_CACHE_MS/);
  assert.match(controller, /publicBroadcastInflight/);
  assert.match(controller, /getPublicBroadcastCard\(broadcastId\)/);

  assert.match(limiter, /defaultLimiter = limiter\(\{[\s\S]*?limit:\s*3000/);
  assert.match(limiter, /livekitTokenLimiter = limiter\(\{[\s\S]*?limit:\s*2000/);
});

test('browser raw PCM fallback is forbidden while the show is live', async () => {
  const frontend = await read('../../frontend/src/services/broadcastRecordingService.js');
  const backend = await read('../src/controllers/broadcastChunkController.js');

  assert.match(backend, /mode:\s*'browser-recovery-deferred'/);
  assert.match(backend, /WebRTC-only/);
  assert.match(frontend, /data\?\.data\?\.mode === 'browser-fallback'/);
  assert.match(frontend, /serverFallbackDeferred = true/);
  assert.match(frontend, /!recording\.qualityChunkStarted\) return/);
  assert.match(frontend, /recovery is deferred until off air/);
});

test('PC browser save destination is requested from the End Broadcast gesture before async shutdown', async () => {
  const workspace = await read('../../frontend/src/Components/CreatorStudio/CreatorLiveConnectedWorkspace.jsx');
  const autosave = await read('../../frontend/src/services/recordingAutosave.js');
  const exportService = await read('../../frontend/src/services/recordingExportService.js');

  const endAt = workspace.indexOf('const endBroadcast = async');
  const endBody = workspace.slice(endAt, workspace.indexOf('const copyLiveLink', endAt));
  const reserveAt = endBody.indexOf('prepareEndBroadcastDeviceSave');
  const backendAt = endBody.indexOf('batch3Service.endBroadcastRealtime');
  const stopAt = endBody.indexOf('await stopLiveKitPublishing()');

  assert.ok(reserveAt >= 0 && reserveAt < backendAt && reserveAt < stopAt);
  assert.match(endBody, /deviceSaveReservation/);
  assert.match(autosave, /prepareAutomaticLocalCopyDestination/);
  assert.match(autosave, /reservation:\s*deviceSaveReservation/);
  assert.match(exportService, /prepareAutomaticLocalCopyDestination/);
  assert.match(exportService, /mode:\s*'file-picker'/);
  assert.match(exportService, /destination:\s*'preauthorized-file-picker'/);
  assert.match(exportService, /onChunk:\s*\(chunk\) => writable\.write\(chunk\)/);
});


test('server recorder fails closed across backend restarts instead of accepting a partial replay tail', async () => {
  const recorder = await read('../src/services/livekitServerRecording.js');

  assert.match(recorder, /const ownedEgressIds = new Map\(\)/);
  assert.match(recorder, /server-process-restarted/);
  assert.match(recorder, /Interrupted server recording requires browser recovery/);
  assert.match(recorder, /!currentProcessExpectsTrack/);
  assert.match(recorder, /!currentProcessOwnsEgress/);
  assert.match(recorder, /expectedTracks\.set\(id, track\)[\s\S]*?startTrackRecordingEgress/);
  assert.doesNotMatch(
    recorder,
    /expectedTracks\.set\(id, track\);\s*\n\s*const current = await Broadcast\.findById/
  );
});
