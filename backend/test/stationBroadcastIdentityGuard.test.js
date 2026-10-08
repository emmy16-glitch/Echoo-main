import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

test('backend creates and updates a broadcast title independently of its linked station name', async () => {
  const stationController = await read('../src/controllers/stationController.js');
  const broadcastController = await read('../src/controllers/broadcastController.js');
  const liveStudio = await read('../src/controllers/liveStudioController.js');

  assert.match(stationController, /name:\s*cleanName,\s*slug/);
  assert.match(stationController, /if \(name !== undefined\) \{/);
  assert.match(stationController, /station\.name = cleanName/);
  assert.match(broadcastController, /title:\s*String\(title\)\.trim\(\)/);
  assert.match(broadcastController, /station:\s*station\._id/);
  assert.match(liveStudio, /if \(title\) broadcast\.title = title/);
  assert.doesNotMatch(broadcastController, /station\.name\s*=\s*(?:title|broadcast\.title)/);
  assert.doesNotMatch(liveStudio, /station\.name\s*=\s*(?:title|broadcast\.title)/);
});

test('Creator Studio does not auto-fill broadcast metadata from permanent Channel fields', async () => {
  const workspace = await read('../../frontend/src/Components/CreatorStudio/CreatorLiveConnectedWorkspace.jsx');
  const channelEditor = await read('../../frontend/src/Components/CreatorStudio/CreatorStationsWorkspace.jsx');
  const onboarding = await read('../../frontend/src/Components/CreatorSetup/CreatorSetup.jsx');
  assert.match(workspace, /htmlFor="ec2-broadcast-title"/);
  assert.match(workspace, /Title for this livestream only/);
  assert.match(workspace, /title:\s*title\.trim\(\) \|\| 'Live broadcast'/);
  assert.doesNotMatch(workspace, /setTitle\([^\n;]*\?\.name/);
  assert.doesNotMatch(workspace, /setTitle\(selectedStation\.name/);
  assert.doesNotMatch(workspace, /title:\s*title\.trim\(\) \|\| station\.name/);
  assert.match(channelEditor, /permanent Channel name/);
  assert.match(onboarding, /not the title of one livestream/);
});

test('Listener live cards use the permanent station name as primary and the broadcast title as secondary', async () => {
  const listener = await read('../../frontend/src/Components/ListenerV2/ListenerV2.jsx');
  const live = await read('../../frontend/src/Components/ListenerLive/ListenerLiveConnected.jsx');
  const mobile = await read('../../mobile/app/(tabs)/live.tsx');

  assert.match(listener, /const titleOf = \(item\) => item\?\.title \|\| 'Live broadcast'/);
  assert.match(listener, /const stationNameOf = \(item\) => item\?\.station\?\.name/);
  assert.match(listener, /<strong>\{station\}<\/strong>\s*\{!duplicateStation && <span>\{broadcastTitle\}<\/span>\}/);
  assert.match(live, /<h3>\{stationNameOf\(broadcast\)\}<\/h3>/);
  assert.match(mobile, /title=\{item\.stationName \|\| 'Echoo Station'\}/);
  assert.match(mobile, /subtitle=\{item\.title\}/);
});

test('specific legacy station repair is opt-in and preserves all accounts and broadcasts', async () => {
  const repair = await read('../scripts/repairLayersOfTruthStationName.js');
  assert.match(repair, /STATION_ID = '6a8b855ee44947dd85312d64'/);
  assert.match(repair, /EXPECTED_OWNER = '6a8aa169e44947dd85312d5c'/);
  assert.match(repair, /ORIGINAL_NAME = 'Tuesday Bible Study - 06th Oct, 2026'/);
  assert.match(repair, /CORRECT_NAME = 'Layers of Truth'/);
  assert.match(repair, /const apply = args\.includes\('--apply'\)/);
  assert.match(repair, /if \(apply\) \{/);
  assert.match(repair, /confirmedDatabase !== db/);
  assert.match(repair, /modifiedCount !== 1/);
  assert.doesNotMatch(repair, /deleteMany|User\.collection\.update|Broadcast\.collection\.update/);
});
