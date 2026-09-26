import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

test('OFF AIR and LIVE share one hero contract with one live badge and a live-only ticker', async () => {
  const source = await read('./CreatorLiveConnectedWorkspace.jsx');

  assert.match(source, /READY TO BROADCAST/);
  assert.match(source, /OFF AIR/);
  assert.match(source, /heroState === 'live' \?/);
  assert.match(source, /YOU&apos;RE BROADCASTING NOW\./);
  assert.equal((source.match(/<i \/> LIVE<\/span>/g) || []).length, 1);
  assert.match(source, /heroState === 'ending' \?/);
});

test('End Broadcast opens an app dialog and only the confirmed action calls the service once', async () => {
  const source = await read('./CreatorLiveConnectedWorkspace.jsx');
  const requestStart = source.indexOf('const requestEndBroadcast');
  const requestEnd = source.indexOf('const endBroadcast', requestStart);
  const requestBody = source.slice(requestStart, requestEnd);

  assert.doesNotMatch(source, /window\.confirm\s*\(/);
  assert.match(requestBody, /setConfirmEndOpen\(true\)/);
  assert.doesNotMatch(requestBody, /batch3Service\.endBroadcast/);
  assert.equal((source.match(/batch3Service\.endBroadcastRealtime\(/g) || []).length, 1);
  assert.match(source, /endingRequestRef\.current/);
  assert.match(source, /Keep live/);
  assert.match(source, /closeEndConfirmation/);
  assert.match(source, /Ending broadcast…/);
  assert.match(source, /aria-modal="true"/);
});

test('device recording is available before server finalization and never needs a giant upload', async () => {
  const service = await read('../../services/batch3Service.js');
  const autosave = await read('../../services/recordingAutosave.js');
  const exportService = await read('../../services/recordingExportService.js');
  const banner = await read('../RecordingSaveBanner.jsx');
  const realtimeStart = service.indexOf('endBroadcastRealtime: async');
  const finalizeStart = service.indexOf('finalizeBroadcastRecording: async');
  const realtimeSection = service.slice(realtimeStart, finalizeStart);
  const finalizeSection = service.slice(finalizeStart, service.indexOf('getProcessing:', finalizeStart));
  const apiCompletion = realtimeSection.indexOf("/end`");
  const readyAnnouncement = finalizeSection.indexOf('announceFinishedBroadcastRecording');
  const localCopy = autosave.indexOf('localCopy = await saveAutomaticLocalCopy');
  const finalizeCall = autosave.indexOf('finalizeServerReplay');
  const doneEmit = autosave.indexOf("status: 'done'", finalizeCall);

  assert.ok(apiCompletion >= 0);
  assert.ok(readyAnnouncement >= 0);
  assert.ok(localCopy >= 0 && localCopy < finalizeCall, 'device copy must run before server replay finalization');
  assert.ok(finalizeCall >= 0 && doneEmit > finalizeCall);
  assert.match(exportService, /encodeLocalWavToMp3/);
  assert.match(exportService, /source: 'local-wav-encode'/);
  assert.match(exportService, /navigator\.share/);
  assert.match(exportService, /showSaveFilePicker/);
  assert.doesNotMatch(autosave, /uploadAudioWithProgress/);
  assert.doesNotMatch(autosave, /new File\(\[recording\.blob/);
  assert.match(banner, /Save MP3 to device/);
  assert.match(banner, /Save WAV to device/);
  assert.match(banner, /Retry Echoo save/);
  assert.match(autosave, /SERVER_END_PENDING/);
  assert.match(autosave, /skipDeviceSave:\s*true/);
});

test('recording progress distinguishes local device save from Echoo server recovery', async () => {
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');
  const studio = await read('./CreatorStudio.jsx');
  const autosave = await read('../../services/recordingAutosave.js');
  const recording = await read('../../services/broadcastRecordingService.js');

  for (const source of [workspace, studio]) {
    assert.match(source, /status === 'device-saving'/);
    assert.match(source, /status === 'device-progress'/);
    assert.match(source, /status === 'finalizing'/);
    assert.match(source, /stage: 'preparing'/);
  }
  assert.match(workspace, /Recording ready locally · finishing on Echoo/);
  assert.match(autosave, /isLosslessWavRecovery/);
  assert.match(autosave, /return \['mp3', 'wav'\]/);
  assert.match(autosave, /status:\s*'progress'/);
  assert.match(recording, /uploadedBytes/);
  assert.match(recording, /onProgress/);
});

test('Creator Studio keeps Broadcast navigation callbacks stable so bootstrap does not refetch on ordinary renders', async () => {
  const studio = await read('./CreatorStudio.jsx');

  assert.match(studio, /const navigateStudio = useCallback\(/);
  assert.match(studio, /const clearPreparedBroadcast = useCallback\(/);
  assert.match(studio, /\[location\.pathname, routerNavigate\]/);
});

test('Creator Studio bootstrap has a visible timer, a hard timeout, and a Retry state', async () => {
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');
  const api = await read('../../services/api.js');
  const batch2 = await read('../../services/batch2Service.js');
  const batch3 = await read('../../services/batch3Service.js');

  assert.match(workspace, /loadingElapsed/);
  assert.match(workspace, /Echoo will stop waiting at 10 seconds/);
  assert.match(workspace, /Retry Studio/);
  assert.match(workspace, /getMyStations\(\{ timeoutMs: 10_000 \}\)/);
  assert.match(workspace, /getCreatorBroadcasts\(\{ timeoutMs: 10_000 \}\)/);
  assert.match(batch2, /getMyStations: async \(\{ timeoutMs = 10_000 \} = \{\}\)/);
  assert.match(batch3, /getCreatorBroadcasts: async \(\{ timeoutMs = 10_000 \} = \{\}\)/);
  assert.match(api, /REQUEST_TIMEOUT/);
  assert.match(api, /AbortController/);
});

test('End Broadcast defaults to an immediate MP3 device reservation on web', async () => {
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');
  const preferences = await read('../../services/recordingDevicePreferences.js');
  const autosave = await read('../../services/recordingAutosave.js');
  const exportService = await read('../../services/recordingExportService.js');

  assert.match(preferences, /decided: true/);
  assert.match(preferences, /autoSave: true/);
  assert.match(preferences, /format: 'mp3'/);
  const endAt = workspace.indexOf('const endBroadcast = async');
  const stopAt = workspace.indexOf('await stopLiveKitPublishing()', endAt);
  const reservationAt = workspace.indexOf('prepareEndBroadcastDeviceSave', endAt);
  assert.ok(reservationAt > endAt && reservationAt < stopAt);
  assert.match(autosave, /saveAutomaticLocalCopy\(\{/);
  assert.match(exportService, /mode: 'file-picker'/);
  assert.match(exportService, /destination: 'preauthorized-file-picker'/);
});

test('LIVE is set by the published program track, with confirmation and recording out of band', async () => {
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');
  const publisher = await read('../../services/livekitPublisher.js');
  const batch3 = await read('../../services/batch3Service.js');
  const publishAt = workspace.indexOf('await startLiveKitPublishing');
  const liveAt = workspace.indexOf('setCurrentLiveBroadcast(liveBroadcast)');
  const confirmAt = workspace.indexOf('void batch3Service.confirmBroadcastLive');
  const recorderAt = publisher.indexOf('void ensureBroadcastRecording');
  const startAt = batch3.indexOf('startBroadcast: async');
  const confirmServiceAt = batch3.indexOf('confirmBroadcastLive: async');

  assert.ok(publishAt >= 0 && liveAt > publishAt);
  assert.ok(confirmAt > liveAt);
  assert.ok(recorderAt >= 0);
  assert.doesNotMatch(publisher, /startWhisperFlowTranscription|stopWhisperFlowTranscription/);
  assert.doesNotMatch(batch3.slice(startAt, confirmServiceAt), /checkLiveKitReadiness\s*\(/);
});

test('a stale ending broadcast returns the creator to OFF AIR while recovery continues in the background', async () => {
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');

  assert.match(workspace, /item\.status === 'live'\n\s*\) \|\| null/);
  assert.match(workspace, /const endingBroadcast = realBroadcasts\.find/);
  assert.match(workspace, /setCurrentLiveBroadcast\(null\)/);
  assert.match(workspace, /batch3Service\.recoverBroadcast\(endingBroadcast\.id\)/);
  assert.match(workspace, /Broadcast ended\. Your recording is being prepared in the background\./);
  assert.doesNotMatch(
    workspace,
    /item\.status === 'live' \|\| item\.status === 'ending'/
  );
});

test('a database-live broadcast can rebuild its publisher after a page reload', async () => {
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');
  const retryAt = workspace.indexOf('const retryAudioConnection = async');
  const retryBody = workspace.slice(retryAt, workspace.indexOf('if (loading)', retryAt));

  assert.match(retryBody, /getLiveKitPublishingState\(\)/);
  assert.match(retryBody, /retryLiveKitPublishingRecovery\(\)/);
  assert.match(retryBody, /getValidAudioSourceIds\(liveMixerSnapshot\)/);
  assert.match(retryBody, /batch3Service\.getLiveKitToken\(broadcastId\)/);
  assert.match(retryBody, /await startLiveKitPublishing\(\{/);
  assert.match(retryBody, /Your browser audio was disconnected/);
  assert.match(workspace, /!connectionHealthy && \(/);
  assert.match(workspace, /Reconnect live audio/);
});

test('End stops listener audio and local recovery master before waiting for server cleanup', async () => {
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');
  const publisher = await read('../../services/livekitPublisher.js');
  const batch3 = await read('../../services/batch3Service.js');
  const endAt = workspace.indexOf('const endBroadcast = async');
  const endBody = workspace.slice(endAt, workspace.indexOf('const copyLiveLink', endAt));
  const backendStartAt = endBody.indexOf('const backendEnd = batch3Service.endBroadcastRealtime');
  const unpublishAt = endBody.indexOf('await stopLiveKitPublishing()');
  const offAirAt = endBody.indexOf("markOffAir('Broadcast ended. Your recording is safe and Echoo is finishing it in the background.')");
  const localFinalizeAt = endBody.indexOf('const localRecording = batch3Service.finalizeBroadcastRecording');
  const awaitLocalAt = endBody.indexOf('const recordingResult = await localRecording');
  const announceAt = endBody.indexOf('batch3Service.announceFinalizedBroadcastRecording');
  const awaitBackendAt = endBody.indexOf('const backendOutcome = await backendEnd');

  assert.ok(backendStartAt >= 0);
  assert.ok(unpublishAt > backendStartAt);
  assert.ok(offAirAt > unpublishAt);
  assert.ok(localFinalizeAt > offAirAt && localFinalizeAt < awaitLocalAt);
  assert.ok(announceAt > awaitLocalAt && announceAt < awaitBackendAt);
  assert.match(endBody, /\{ announce: false \}/);
  assert.match(batch3, /announceFinalizedBroadcastRecording/);
  assert.match(endBody, /The upload event takes over the visible progress from here/);
  assert.match(publisher, /ROOM_DISCONNECT_DEADLINE_MS/);
  assert.match(publisher, /Promise\.race\(\[disconnect, deadline\]\)/);
});

test('OFF AIR reset clears session state while the stereo workstation remains canonical', async () => {
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');
  const shell = await read('./CreatorStudioShellArchitecture.css');
  const heroCss = await read('./CreatorBroadcastApproved.css');
  const mixer = await read('./CreatorAudioMixer.jsx');
  const resetStart = workspace.indexOf('const markOffAir');
  const resetEnd = workspace.indexOf('useEffect', resetStart);
  const resetBody = workspace.slice(resetStart, resetEnd);

  assert.match(resetBody, /setCurrentLiveBroadcast\(null\)/);
  assert.match(resetBody, /setElapsed\(0\)/);
  assert.match(resetBody, /listenerCount: 0/);
  assert.match(resetBody, /setLinkCopied\(false\)/);
  assert.doesNotMatch(resetBody, /resetEchooMixer/);
  assert.match(workspace, /window\.setTimeout\(\(\) => setMessage\(''\), 3000\)/);
  assert.match(shell, /padding-top: 18px !important/);
  assert.match(heroCss, /animation: ec2-live-ticker 36s linear infinite/);
  assert.match(heroCss, /\.ec2-off-air-details > p \{\s*grid-column: 1 \/ -1;/);

  for (const label of ['HOST', 'GUEST 1', 'GUEST 2', 'MASTER OUTPUT']) {
    assert.match(mixer, new RegExp(label));
  }
  assert.doesNotMatch(mixer, /FaEllipsis|FiMoreVertical/);
});

test('image cropping is layered above the high-priority Collection editor', async () => {
  const cropCss = await read('../Common/ImageCropProvider.css');
  const collectionCss = await read('./CreatorCollectionWorkspace.css');
  const cropIndex = Number(cropCss.match(/\.echoo-crop-overlay\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1]);
  const collectionIndex = Number(collectionCss.match(/\.creator-collections-modal\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1]);

  assert.ok(cropIndex > collectionIndex);
});


test('creator recovery refreshes credentials before replacing the existing LiveKit room', async () => {
  const publisher = await read('../../services/livekitPublisher.js');
  const start = publisher.indexOf('async function runPublisherRecovery');
  const end = publisher.indexOf('async function schedulePublisherRecovery', start);
  const recovery = publisher.slice(start, end);
  const credentialsAt = recovery.indexOf('const credentials = await candidate.credentialProvider?.()');
  const clearRoomAt = recovery.indexOf('activeRoom = null');
  const detachAt = recovery.indexOf('await detachRoom(staleRoom');

  assert.ok(credentialsAt >= 0);
  assert.ok(clearRoomAt > credentialsAt);
  assert.ok(detachAt > credentialsAt);
  assert.match(publisher, /RECOVERY_DISCONNECT_DEADLINE_MS = 1000/);
  assert.match(recovery, /deadlineMs: RECOVERY_DISCONNECT_DEADLINE_MS/);
});

test('creator recovery continues through the backend disconnect grace window', async () => {
  const publisher = await read('../../services/livekitPublisher.js');

  assert.match(publisher, /CREATOR_RECOVERY_WINDOW_MS = 90_000/);
  assert.match(publisher, /candidate\.recoveryStartedAt \|\|= Date\.now\(\)/);
  assert.match(publisher, /Date\.now\(\) - candidate\.recoveryStartedAt < CREATOR_RECOVERY_WINDOW_MS/);
  assert.match(publisher, /Math\.min\(attempt, LIVE_RECOVERY_DELAYS_MS\.length - 1\)/);
  assert.doesNotMatch(
    publisher,
    /candidate\.recoveryAttempt < LIVE_RECOVERY_DELAYS_MS\.length/
  );
});
