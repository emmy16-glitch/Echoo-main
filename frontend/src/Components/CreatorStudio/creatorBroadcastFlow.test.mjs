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
  assert.match(banner, /Retry Echoo server save/);
  assert.match(autosave, /SERVER_END_PENDING/);
  assert.match(autosave, /skipDeviceSave:\s*true/);
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
  const offAirAt = endBody.indexOf("markOffAir('Broadcast audio stopped. Finalizing your local master…')");
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
