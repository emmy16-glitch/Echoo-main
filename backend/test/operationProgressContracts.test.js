import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  formatElapsedTime,
  formatTimeRemaining,
  transferProgressText,
  updateTransferEstimate,
} from '../../frontend/src/services/progressTiming.js';

const source = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), 'utf8');

test('transfer estimator clamps percent and produces a stable finite ETA only after useful samples', () => {
  const start = updateTransferEstimate(null, {
    loaded: 0,
    total: 1000,
    now: 1000,
  });
  assert.equal(start.percent, 0);
  assert.equal(start.etaSeconds, null);

  const middle = updateTransferEstimate(start, {
    loaded: 500,
    total: 1000,
    now: 3000,
  });
  assert.equal(middle.percent, 50);
  assert.ok(middle.bytesPerSecond > 0);
  assert.ok(Number.isFinite(middle.etaSeconds));
  assert.ok(middle.etaSeconds > 0);

  const complete = updateTransferEstimate(middle, {
    loaded: 1200,
    total: 1000,
    now: 5000,
  });
  assert.equal(complete.percent, 100);
  assert.equal(complete.etaSeconds, null);
});

test('timing copy remains human-readable and never invents an ETA without rate data', () => {
  assert.equal(formatElapsedTime(7), '7s');
  assert.equal(formatElapsedTime(75), '1m 15s');
  assert.equal(formatTimeRemaining(8), 'a few seconds left');
  assert.match(formatTimeRemaining(65), /about 2 min left/);

  const text = transferProgressText({
    loaded: 5 * 1024 * 1024,
    total: 10 * 1024 * 1024,
    percent: 50,
    elapsedSeconds: 5,
    bytesPerSecond: 0,
    etaSeconds: null,
  });
  assert.match(text, /5\.0 MB of 10\.0 MB/);
  assert.match(text, /50%/);
  assert.match(text, /estimating time left/);
});

test('Creator Broadcast shows elapsed stages and byte-based recording ETA', async () => {
  const workspace = await source('../../frontend/src/Components/CreatorStudio/CreatorLiveConnectedWorkspace.jsx');

  assert.match(workspace, /transferProgressText\(recordingProgress\)/);
  assert.match(workspace, /formatElapsedTime\(sessionOperation\.elapsedSeconds/);
  assert.match(workspace, /Preparing broadcast/);
  assert.match(workspace, /Opening live audio room/);
  assert.match(workspace, /Connecting audio to listeners/);
  assert.match(workspace, /Finalizing local recording master/);
  assert.match(workspace, /This stage has no trustworthy percentage/);
});

test('Recordings exposes timing for background saves, uploads, and downloads', async () => {
  const workspace = await source('../../frontend/src/Components/CreatorStudio/CreatorCollectionsWorkspace.jsx');

  assert.match(workspace, /RECORDING_UPLOAD_EVENT/);
  assert.match(workspace, /kind: 'recording-save'/);
  assert.match(workspace, /kind: 'manual-upload'/);
  assert.match(workspace, /kind: 'download'/);
  assert.match(workspace, /transferProgressText\(transferOperation\)/);
  assert.match(workspace, /Waiting for connection/);
});

test('manual Creator upload uses measurable XHR progress instead of a spinner-only state', async () => {
  const [studio, service] = await Promise.all([
    source('../../frontend/src/Components/CreatorStudio/CreatorStudio.jsx'),
    source('../../frontend/src/services/studioService.js'),
  ]);

  assert.match(service, /uploadAudioWithProgress/);
  assert.match(service, /xhr\.upload\.onprogress/);
  assert.match(studio, /uploadAudioWithProgress/);
  assert.match(studio, /transferProgressText\(uploadProgress\)/);
  assert.match(studio, /Uploading \$\{/);
  assert.match(studio, /Upload complete — verifying/);
});

test('recording downloads stream progress when response bodies are readable', async () => {
  const service = await source('../../frontend/src/services/studioService.js');

  assert.match(service, /response\.body\?\.getReader/);
  assert.match(service, /reader\.read\(\)/);
  assert.match(service, /onProgress\(\{ loaded: blob\.size/);
});
