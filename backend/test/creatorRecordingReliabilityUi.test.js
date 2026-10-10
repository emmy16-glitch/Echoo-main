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

test('Recordings UI separates save health from audience visibility', async () => {
  const [workspace, css, scheduleCss, runtimeCss] = await Promise.all([
    source('../../frontend/src/Components/CreatorStudio/CreatorCollectionsWorkspace.jsx'),
    source('../../frontend/src/Components/CreatorStudio/CreatorCollectionsWorkspace.css'),
    source('../../frontend/src/Components/CreatorStudio/CreatorScheduleEventsWorkspace.css'),
    source('../../frontend/src/Components/CreatorStudio/CreatorStudioRuntimeFixes.css'),
  ]);

  assert.match(workspace, />Save status</);
  assert.match(workspace, />Visibility</);
  assert.match(workspace, /recordingSaveState/);
  assert.match(workspace, /Recording ready/);
  assert.match(workspace, /Needs attention/);
  assert.doesNotMatch(workspace, /Echoo keeps a protected recovery copy until the recording is safely finished/);
  assert.match(workspace, /recovered live broadcast recording/i);
  assert.match(css, /grid-template-columns:repeat\(3,1fr\)/);
  assert.match(css, /recordings-save-state\.is-processing/);
  assert.match(css, /recordings-save-state\.is-attention/);

  // Row-level action menus must raise their owning row above later siblings.
  // Without this, the next row's Play / Download / More buttons paint over
  // the open menu, as seen in the recordings screenshot regression.
  assert.match(css, /recordings-row:has\(\.recordings-more-menu\)\s*\{[^}]*z-index:\s*120/s);
  assert.match(css, /recordings-more-menu\s*\{[^}]*z-index:\s*900/s);
  assert.match(scheduleCss, /schedule-row:has\(\.schedule-menu\)\s*\{[^}]*z-index:\s*120/s);
  assert.match(scheduleCss, /schedule-menu\s*\{[^}]*z-index:\s*900/s);

  // Existing Creator Audio and Channel row menus already use the same
  // active-row stacking pattern; keep that protection in place.
  assert.match(runtimeCss, /article:has\(\.eca-more-menu\)[\s\S]*z-index:\s*80/);
  assert.match(runtimeCss, /est-station-row:has\(\.est-more-menu\)[\s\S]*z-index:\s*120/);
});
