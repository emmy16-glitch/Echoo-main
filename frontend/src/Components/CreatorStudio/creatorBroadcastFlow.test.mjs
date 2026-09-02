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

test('Recording Saved is gated by real backend completion and real upload success', async () => {
  const service = await read('../../services/batch3Service.js');
  const prompt = await read('./BroadcastRecordingPrompt.jsx');
  const realtimeStart = service.indexOf('endBroadcastRealtime: async');
  const finalizeStart = service.indexOf('finalizeBroadcastRecording: async');
  const realtimeSection = service.slice(realtimeStart, finalizeStart);
  const finalizeSection = service.slice(finalizeStart, service.indexOf('getProcessing:', finalizeStart));
  const apiCompletion = realtimeSection.indexOf("/end`");
  const readyAnnouncement = finalizeSection.indexOf('announceFinishedBroadcastRecording');
  const uploadCompletion = prompt.indexOf('await studioService.uploadAudio');
  const savedState = prompt.indexOf('setSaved(true)', uploadCompletion);

  assert.ok(apiCompletion >= 0);
  assert.ok(readyAnnouncement >= 0);
  assert.ok(uploadCompletion >= 0 && savedState > uploadCompletion);
  assert.match(prompt, /Recording saved!/);
  assert.match(prompt, /aria-label="Close"/);
  assert.match(prompt, /SAVED_AUTO_DISMISS_MS = 5000/);
  assert.match(prompt, /View recording/);
  assert.match(prompt, /dismissSavedRecording/);
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

test('End makes the listener path OFF AIR before recording finalization', async () => {
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');
  const endAt = workspace.indexOf('const endBroadcast = async');
  const endBody = workspace.slice(endAt, workspace.indexOf('const copyLiveLink', endAt));
  const unpublishAt = endBody.indexOf('await stopLiveKitPublishing()');
  const offAirAt = endBody.indexOf("markOffAir('Broadcast audio stopped. Saving your recording…')");
  const finalizeAt = endBody.indexOf('finalizeBroadcastRecording');

  assert.ok(unpublishAt >= 0 && offAirAt > unpublishAt && finalizeAt > offAirAt);
  assert.match(endBody, /const backendEnd = batch3Service\.endBroadcastRealtime/);
  assert.match(endBody, /\[Echoo Perf\] end-broadcast realtime stopped/);
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
  assert.match(shell, /padding-top: 22px !important/);
  assert.match(heroCss, /animation: ec2-live-ticker 48s linear infinite/);
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
