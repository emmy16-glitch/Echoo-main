import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), 'utf8');

test('Creator workstation reconciles recording autosave completion instead of leaving a stale warning', async () => {
  const workspace = await source('../../frontend/src/Components/CreatorStudio/CreatorLiveConnectedWorkspace.jsx');

  assert.match(workspace, /RECORDING_UPLOAD_EVENT\s*=\s*'echoo:recording-upload'/);
  assert.match(workspace, /status === 'done'/);
  assert.match(workspace, /current === RECORDING_FINALIZATION_WARNING \? '' : current/);
  assert.match(workspace, /Recording saved safely to Recordings\./);
  assert.match(workspace, /status === 'error'/);
});

test('Creator mix preview explains that it is private and does not start a broadcast', async () => {
  const mixer = await source('../../frontend/src/Components/CreatorStudio/CreatorAudioMixer.jsx');

  assert.match(mixer, /Preview listener mix/);
  assert.match(mixer, /Stop preview/);
  assert.match(mixer, /Private preview — only you can hear it\. This does not start a broadcast\./);
  assert.match(mixer, /aria-pressed=\{Boolean\(testingAudio && monitoring\.enabled\)\}/);
});

test('Creator content API exposes source broadcast audio lifecycle and Channel metadata', async () => {
  const controller = await source('../src/controllers/studioController.js');

  assert.match(controller, /path:\s*'sourceBroadcast'/);
  assert.match(controller, /select:\s*'title status assetStatus assetVisibility endedAt station'/);
  assert.match(controller, /path:\s*'station'/);
  assert.match(controller, /stationName:\s*track\.sourceBroadcast\?\.station\?\.name/);
  assert.match(controller, /sourceBroadcast:\s*track\.sourceBroadcast/);
});

test('Recordings UI separates server save health from audience visibility', async () => {
  const [workspace, css] = await Promise.all([
    source('../../frontend/src/Components/CreatorStudio/CreatorCollectionsWorkspace.jsx'),
    source('../../frontend/src/Components/CreatorStudio/CreatorCollectionsWorkspace.css'),
  ]);

  assert.match(workspace, />Save status</);
  assert.match(workspace, />Visibility</);
  assert.match(workspace, /recordingSaveState/);
  assert.match(workspace, /Server copy ready/);
  assert.match(workspace, /Needs attention/);
  assert.match(workspace, /Echoo keeps the local safety master until the server copy is confirmed/);
  assert.match(workspace, /recovered live broadcast recording/i);
  assert.match(css, /grid-template-columns:repeat\(3,1fr\)/);
  assert.match(css, /recordings-save-state\.is-processing/);
  assert.match(css, /recordings-save-state\.is-attention/);
});
