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

test('browser device download is offered only after Echoo server finalization and never needs a giant upload', async () => {
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
  const finalizeCall = autosave.indexOf('finalizeServerReplay');
  const browserChoice = autosave.indexOf("status: 'device-choice'", finalizeCall);

  assert.ok(apiCompletion >= 0);
  assert.ok(readyAnnouncement >= 0);
  assert.ok(finalizeCall >= 0 && browserChoice > finalizeCall, 'browser MP3/WAV choice must appear after server replay finalization');
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

test('Broadcast accepts Channel ids returned as either id or _id', async () => {
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');

  assert.match(workspace, /const entityId = \(value\) => value\?\.id \|\| value\?\._id \|\| ''/);
  assert.match(workspace, /if \(!entityId\(station\)\)/);
  assert.match(workspace, /stationId: entityId\(station\)/);
  assert.doesNotMatch(workspace, /if \(!station\?\.id\)/);
});

test('Go Live reloads the Channel if background bootstrap has not populated it yet', async () => {
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');

  assert.match(workspace, /setMessage\('Syncing your Channel…'\)/);
  assert.match(workspace, /batch2Service\.getMyStations\(\{ timeoutMs: 10_000 \}\)/);
  assert.match(workspace, /station = refreshedStations\[0\] \|\| null/);
  assert.match(workspace, /prepareImmediateBroadcast\(liveMixerSnapshot, station\)/);
  assert.match(workspace, /Echoo is still reconnecting to your Channel/);
  assert.doesNotMatch(workspace, /setError\('Complete your Channel setup before going live\.'\)/);
});

test('Creator Studio renders immediately while bounded bootstrap retries in the background', async () => {
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');
  const api = await read('../../services/api.js');
  const batch2 = await read('../../services/batch2Service.js');
  const batch3 = await read('../../services/batch3Service.js');

  assert.match(workspace, /loadingElapsed/);
  assert.match(workspace, /bootstrapRetryRef/);
  assert.match(workspace, /Never replace the Broadcast workspace with a connection screen/);
  assert.match(workspace, /reconnecting in the background/);
  assert.doesNotMatch(workspace, /Studio connection needs another try/);
  assert.match(workspace, /getMyStations\(\{ timeoutMs: 10_000 \}\)/);
  assert.match(workspace, /getCreatorBroadcasts\(\{ timeoutMs: 10_000 \}\)/);
  assert.match(batch2, /getMyStations: async \(\{ timeoutMs = 10_000 \} = \{\}\)/);
  assert.match(batch3, /getCreatorBroadcasts: async \(\{ timeoutMs = 10_000 \} = \{\}\)/);
  assert.match(batch3, /LIVEKIT_CONTROL_TIMEOUT_MS = 12_000/);
  assert.match(batch3, /BROADCAST_START_TIMEOUT_MS = 20_000/);
  assert.match(batch3, /BROADCAST_END_TIMEOUT_MS = 35_000/);
  assert.match(api, /SESSION_REFRESH_TIMEOUT_MS = 10_000/);
  assert.match(api, /refresh-timeout/);
  assert.match(api, /REQUEST_TIMEOUT/);
  assert.match(api, /AbortController/);
});

test('End Broadcast defers browser file choice until the Echoo server MP3 is ready', async () => {
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
  assert.match(autosave, /window\.echooDesktop\?\.isDesktop !== true/);
  assert.match(autosave, /return null;/);
  assert.match(autosave, /status: 'device-choice'/);
  assert.match(exportService, /mode: 'file-picker'/);
});

test('local safety capture starts before publication while server recording arms after publication', async () => {
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');
  const publisher = await read('../../services/livekitPublisher.js');
  const batch3 = await read('../../services/batch3Service.js');
  const publishAt = workspace.indexOf('await startLiveKitPublishing');
  const liveAt = workspace.indexOf('setCurrentLiveBroadcast(liveBroadcast)');
  const confirmAt = workspace.indexOf('void batch3Service.confirmBroadcastLive');
  const localStartAt = publisher.indexOf('localRecordingStart = ensureBroadcastRecording');
  const connectAt = publisher.indexOf('const result = await connectAndPublish');
  const serverArmAt = publisher.indexOf('armBroadcastServerRecording(id)');
  const startAt = batch3.indexOf('startBroadcast: async');
  const confirmServiceAt = batch3.indexOf('confirmBroadcastLive: async');

  assert.ok(publishAt >= 0 && liveAt > publishAt);
  assert.ok(confirmAt > liveAt);
  assert.ok(localStartAt >= 0 && localStartAt < connectAt, 'local safety capture must begin before listener publication');
  assert.ok(serverArmAt > connectAt, 'server recorder handshake must arm after the LiveKit track exists');
  assert.match(publisher, /LOCAL_RECORDING_START_BUDGET_MS = 750/);
  assert.match(publisher, /Promise\.race\(\[/);
  assert.match(publisher, /discardBroadcastRecording\(id\)/);
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
  const retryBody = workspace.slice(retryAt, workspace.indexOf('const copyLiveLink', retryAt) > retryAt
    ? workspace.indexOf('const copyLiveLink', retryAt)
    : workspace.length);

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
  const offAirAt = endBody.indexOf("markOffAir('Broadcast ended. Echoo is securing your recording in the background.')");
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
  assert.match(endBody, /The recording upload\/save event takes over visible progress/);
  assert.match(publisher, /ROOM_DISCONNECT_DEADLINE_MS/);
  assert.match(publisher, /Promise\.race\(\[disconnect, deadline\]\)/);
  assert.match(workspace, /const backendEnd = batch3Service\.endBroadcastRealtime/);
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
  const credentialsAt = recovery.indexOf('const credentials = await withDeadline(');
  const clearRoomAt = recovery.indexOf('activeRoom = null');
  const detachAt = recovery.indexOf('await detachRoom(staleRoom');

  assert.ok(credentialsAt >= 0);
  assert.match(recovery, /candidate\.credentialProvider\?\.\(\)/);
  assert.ok(clearRoomAt > credentialsAt);
  assert.ok(detachAt > credentialsAt);
  assert.match(publisher, /RECOVERY_DISCONNECT_DEADLINE_MS = 1000/);
  assert.match(recovery, /deadlineMs: RECOVERY_DISCONNECT_DEADLINE_MS/);
});

test('creator recovery survives long offline periods and slows retries instead of giving up', async () => {
  const publisher = await read('../../services/livekitPublisher.js');

  assert.match(publisher, /CREATOR_RECOVERY_WINDOW_MS = 90_000/);
  assert.match(publisher, /CREATOR_RECOVERY_SLOW_RETRY_MS = 30_000/);
  assert.match(publisher, /while \(isCurrent\(candidate\)\)/);
  assert.match(publisher, /elapsed < CREATOR_RECOVERY_WINDOW_MS/);
  assert.match(publisher, /: CREATOR_RECOVERY_SLOW_RETRY_MS/);
  assert.match(publisher, /candidate\.recoveryStartedAt = null/);
  assert.match(publisher, /candidate\.recoveryAttempt = 0/);
  assert.doesNotMatch(
    publisher,
    /candidate\.recoveryAttempt < LIVE_RECOVERY_DELAYS_MS\.length/
  );
});


test('creator Monitor Mix uses a direct default headphone route and a sink-routed custom output', async () => {
  const mixer = await read('../../services/echooMixerService.js');

  assert.match(mixer, /monitorGainNode\.connect\(monitorBusNode\)/);
  assert.match(mixer, /monitorDirectOutputGainNode\.connect\(audioContext\.destination\)/);
  assert.match(mixer, /monitorElementOutputGainNode\.connect\(monitorDestinationNode\)/);
  assert.match(mixer, /soloMonitorGainNode\.connect\(monitorBusNode\)/);
  assert.match(mixer, /usesDedicatedMonitorOutput/);
  assert.match(mixer, /if \(usesDedicatedMonitorOutput\(\)\) \{?\s*await element\.play\(\)/);
  assert.match(mixer, /toneGain\.connect\(monitorBusNode\)/);
});

test('realtime audio keeps RED enabled and uses resilient creator bitrates', async () => {
  const quality = await read('../../services/realtimeAudioQuality.js');

  assert.match(quality, /broadcast_high:[\s\S]*?maxBitrate:\s*128000[\s\S]*?red:\s*true/);
  assert.match(quality, /studio:[\s\S]*?maxBitrate:\s*192000[\s\S]*?red:\s*true/);
  assert.match(quality, /studio_max:[\s\S]*?maxBitrate:\s*256000[\s\S]*?red:\s*true/);
  assert.match(quality, /audioPreset:\s*\{ maxBitrate: profile\.maxBitrate, priority: 'high' \}/);
});

test('live recording reuses PCM worklet buffers and throttles visual metering', async () => {
  const mixer = await read('../../services/echooMixerService.js');
  const worklet = await read('../../../public/echoo-pcm-capture-worklet.js');

  assert.match(mixer, /METER_REFRESH_INTERVAL_MS = 1000 \/ 30/);
  assert.match(mixer, /frameTime - lastMeterFrameAt < METER_REFRESH_INTERVAL_MS/);
  assert.match(mixer, /type: 'recycle', buffer: transferredBuffer/);
  assert.match(worklet, /const CHUNK_FRAMES = 16384/);
  assert.match(worklet, /this\.freeBuffers = \[\]/);
  assert.match(worklet, /this\.freeBuffers\.pop\(\) \|\| new Float32Array\(CHUNK_SAMPLES\)/);
  assert.match(worklet, /sampleCount/);
});

test('creator watchdog confirms repeated sender stalls before rebuilding the LiveKit room', async () => {
  const publisher = await read('../../services/livekitPublisher.js');
  const policy = await read('../../services/liveRecoveryPolicy.js');

  assert.match(policy, /CREATOR_TRANSPORT_STALL_CONFIRMATIONS = 3/);
  assert.match(publisher, /candidate\.transportStallSamples = Number\(candidate\.transportStallSamples \|\| 0\) \+ 1/);
  assert.match(publisher, /candidate\.transportStallSamples >= CREATOR_TRANSPORT_STALL_CONFIRMATIONS/);
  assert.match(publisher, /candidate\.transportStallSamples = 0/);
});

test('recording management uses a routed in-app page and saved trims stay downloadable', async () => {
  const studio = await read('./CreatorStudio.jsx');
  const recordings = await read('./CreatorCollectionsWorkspace.jsx');
  const detail = await read('./CreatorAudioDetailModal.jsx');
  const trim = await read('./CreatorAudioTrimSection.jsx');
  const service = await read('../../services/studioService.js');

  assert.match(studio, /onOpenRecording=/);
  assert.match(studio, /creator-studio\/recordings/);
  assert.match(recordings, /studioService\.getAudio\(recordingId\)/);
  assert.match(recordings, /variant="page"/);
  assert.match(recordings, /openRecording\(track\)/);
  assert.match(detail, /pageMode \? detailView : createPortal/);
  assert.match(detail, /Preparing playback…/);
  assert.match(service, /getAudio: async \(audioId\)/);

  assert.match(trim, /setSavedTrimmed\(trimmed\)/);
  assert.match(trim, /Download trimmed version/);
  assert.match(trim, /studioService\.downloadAudio\(trimmedId/);
  assert.match(trim, /Local safety master is large — loading the saved Echoo copy/);
  assert.doesNotMatch(trim, /onClose\?\.\(\);/);
});

test('interrupted recording recovery resumes missing server chunks after reload', async () => {
  const autosave = await read('../../services/recordingAutosave.js');
  const recording = await read('../../services/broadcastRecordingService.js');

  assert.match(autosave, /resumeRecoveredUpload/);
  assert.match(autosave, /uploadRecoveredTake\(recovered\)/);
  assert.match(autosave, /window\.addEventListener\('online', onlineRecoveryHandler/);
  assert.match(recording, /existingChunkIndices = new Set/);
  assert.match(recording, /const alreadyUploaded = Boolean\(recording\.existingChunkIndices/);
});


test('browser recovery is isolated by creator account and legacy takes are ownership-gated', async () => {
  const recording = await read('../../services/broadcastRecordingService.js');
  const autosave = await read('../../services/recordingAutosave.js');

  assert.match(recording, /ownerUserId: String\(recording\.ownerUserId \|\| currentSessionUserId\(\) \|\| ''\)/);
  assert.match(recording, /String\(manifest\.ownerUserId \|\| ''\) === currentUserId/);
  assert.match(recording, /manifests\.find\(\(manifest\) => !manifest\.ownerUserId\)/);
  assert.match(recording, /releaseRecoveredBroadcastRecording/);

  assert.match(autosave, /inaccessibleRecovery/);
  assert.match(autosave, /error\?\.status === 403/);
  assert.match(autosave, /error\?\.status === 404/);
  assert.match(autosave, /releaseRecoveredBroadcastRecording\(broadcastId\)/);
  assert.match(autosave, /forgetLocalMaster\('recovered'\)/);
});


test('long-session live UX repairs stale mixer output and recovers listener audio interaction', async () => {
  const mixer = await read('../../services/echooMixerService.js');
  const publisher = await read('../../services/livekitPublisher.js');
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');
  const listenerPlayer = await read('../ListenerLiveExperience/LiveKitListenerPlayer.jsx');
  const listenerRoom = await read('../ListenerLiveExperience/ListenerRealLiveRoom.jsx');

  assert.match(mixer, /ensureEchooMixerOutputTrack = async/);
  assert.match(mixer, /createMediaStreamDestination\(\)/);
  assert.match(mixer, /masterAnalyser\.connect\(replacementDestination\)/);
  assert.match(workspace, /await ensureEchooMixerOutputTrack\(\)/);
  assert.doesNotMatch(workspace, /getEchooMixerOutputTrack\(\)/);
  assert.match(mixer, /audioContext\.state !== 'running'/);
  assert.match(mixer, /scheduleUnexpectedVoiceInputRecovery\(channelId, recoveryDeviceId\)/);
  assert.match(mixer, /unexpectedVoiceRecovery = new Map\(\)/);
  assert.match(mixer, /deviceId: deviceId \|\| audioTrack\.getSettings\?\.\(\)\.deviceId \|\| ''/);
  assert.match(publisher, /CREATOR_CREDENTIAL_REFRESH_TIMEOUT_MS = 12_000/);
  assert.match(publisher, /CREATOR_MANUAL_RECOVERY_WAIT_MS = 15_000/);
  assert.match(publisher, /withDeadline\([\s\S]{0,280}credentialProvider/);
  assert.match(publisher, /Automatic live-audio recovery is still running in the background/);

  assert.match(listenerPlayer, /window\.addEventListener\('pointerdown', resumeFromGesture, true\)/);
  assert.match(listenerPlayer, /LISTENER_CREDENTIAL_TIMEOUT_MS = 12_000/);
  assert.match(listenerPlayer, /program_stream_paused_timeout/);
  assert.match(listenerPlayer, /void startAudio\(\)/);
  assert.match(listenerRoom, /listener-v2-room-chat-backdrop/);
  assert.match(listenerRoom, /aria-label="Close live chat"/);
  assert.match(listenerRoom, /document\.documentElement\.classList\.add\('listener-v2-chat-open'\)/);
});


test('end-broadcast recovery is bounded and cannot be revived by a stale reconnect', async () => {
  const publisher = await read('../../services/livekitPublisher.js');
  const recording = await read('../../services/broadcastRecordingService.js');
  const batch3 = await read('../../services/batch3Service.js');
  const exportService = await read('../../services/recordingExportService.js');
  const banner = await read('../../Components/RecordingSaveBanner.jsx');

  assert.match(publisher, /if \(!isCurrent\(candidate\) \|\| candidate\.stopping\)/);
  assert.match(publisher, /if \(!isCurrent\(candidate\) \|\| candidate\.stopping\) return false;[\s\S]{0,180}activeRoom = null/);
  assert.match(recording, /MEDIA_RECORDER_STOP_TIMEOUT_MS = 8_000/);
  assert.match(recording, /MediaRecorder stop event timed out/);
  assert.match(recording, /COMPRESSED_RECOVERY_UPLOAD_TIMEOUT_MS/);
  assert.match(batch3, /BROADCAST_END_TIMEOUT_MS = 35_000/);
  assert.match(batch3, /RECORDING_RECOVERY_TIMEOUT_MS = 35_000/);
  assert.match(batch3, /RECORDING_FINALIZE_TIMEOUT_MS = 120_000/);
  assert.match(batch3, /RECORDING_STATUS_TIMEOUT_MS = 15_000/);
  assert.match(exportService, /timeoutMs: 30_000/);
  assert.match(banner, /kind: 'uploading'/);
  assert.match(banner, /kind: 'device-saving'/);
  assert.match(banner, /kind: 'finalizing'/);
});


test('ending quickly cannot leak a late-starting local recorder or claim safety too early', async () => {
  const recording = await read('../../services/broadcastRecordingService.js');
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');

  assert.match(recording, /RECORDING_START_FINALIZE_TIMEOUT_MS = 8_000/);
  assert.match(recording, /const recordingStarts = new Map\(\)/);
  assert.match(recording, /starting\.finishRequested = true/);
  assert.match(recording, /startState\.finishRequested && activeRecording\?\.broadcastId === id/);
  assert.match(recording, /startState\.lateAnnouncementRequired/);
  assert.match(recording, /announceFinishedBroadcastRecording\(\{/);
  assert.match(workspace, /Broadcast ended\. Echoo is securing your recording in the background\./);
  assert.match(workspace, /stage: 'recording-attention'/);
  assert.match(workspace, /Recording needs attention/);
  assert.doesNotMatch(workspace, /Broadcast ended\. Your recording is safe and Echoo is finishing it in the background\./);
});


test('Broadcast workspace owns passive recording progress without duplicate global banners', async () => {
  const banner = await read('../RecordingSaveBanner.jsx');

  assert.match(banner, /normalizedPath === '\/creator-studio'/);
  assert.match(
    banner,
    /\['finalizing', 'uploading', 'device-saving', 'done'\]\.includes\(state\.kind\)/
  );
  assert.doesNotMatch(
    banner,
    /\['finalizing', 'uploading', 'device-saving', 'done', 'device-choice'\]/
  );
});
