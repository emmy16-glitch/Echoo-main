import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (file) => readFile(new URL(file, import.meta.url), 'utf8');

test('Go Live requires its uploaded Broadcast Cover and never borrows permanent Channel artwork', async () => {
  const studio = await read('../../frontend/src/Components/CreatorStudio/CreatorLiveConnectedWorkspace.jsx');
  assert.match(studio, /coverArt: serviceArtwork \|\| null/);
  assert.doesNotMatch(studio, /coverArt: station\.coverArt \|\| station\.logo/);
  assert.match(studio, /id="ec2-broadcast-cover"/);
  assert.match(studio, /Add a Broadcast Cover before going live/);
  assert.match(studio, /image\/jpeg.*image\/png.*image\/webp/);
});

test('listener web and mobile prioritize service art and preserve station-only profile heroes', async () => {
  const listener = await read('../../frontend/src/Components/ListenerV2/ListenerV2.jsx');
  const mobile = await read('../../mobile/src/services/echooApi.ts');
  const studio = await read('../../frontend/src/services/batch2Service.js');
  const batch3 = await read('../../frontend/src/services/batch3Service.js');
  const profile = await read('../../frontend/src/services/profileService.js');
  assert.match(listener, /const stationArtwork = \(station\) => buildMediaUrl/);
  assert.match(listener, /const broadcastArtwork = \(item\) => buildMediaUrl\(\s*item\?\.eventArtwork/);
  assert.match(mobile, /const rawCover = broadcast\?\.eventArtwork \|\| broadcast\?\.coverArt/);
  assert.match(studio, /const coverArt = eventArtwork \|\| replayAudio\?\.coverArt \|\| normalizedStation\?\.brandCover/);
  assert.match(batch3, /const artwork = eventArtwork \|\| broadcast\.coverArt \|\| stationBrand/);
  assert.match(profile, /const artwork = broadcast\.eventArtwork \|\| broadcast\.coverArt/);
});

test('published recording replay inherits broadcast flyer, independent of Channel branding', async () => {
  const replay = await read('../src/services/broadcastReplayService.js');
  const collection = await read('../src/controllers/collectionController.js');
  assert.match(replay, /broadcast\.coverArt \? \{ coverArt: broadcast\.coverArt, coverArtMode: 'uploaded' \}/);
  assert.match(collection, /coverArt: plain\.coverArt \|\| tracks\[0\]\?\.coverArt \|\| null/);
});
