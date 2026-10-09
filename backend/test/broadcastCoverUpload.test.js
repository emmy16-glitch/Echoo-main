import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { broadcastCoverSignatureMatches } from '../src/controllers/broadcastCoverController.js';

const read = (file) => readFile(new URL(file, import.meta.url), 'utf8');

test('Broadcast Cover upload accepts only supported image signatures', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = Buffer.from('RIFF0000WEBP');

  assert.equal(broadcastCoverSignatureMatches('image/jpeg', jpeg), true);
  assert.equal(broadcastCoverSignatureMatches('image/png', png), true);
  assert.equal(broadcastCoverSignatureMatches('image/webp', webp), true);
  assert.equal(broadcastCoverSignatureMatches('image/png', jpeg), false);
  assert.equal(broadcastCoverSignatureMatches('image/gif', Buffer.from('GIF89a')), false);
});

test('Broadcast Cover upload route is creator-protected and Go Live rejects a missing cover before starting', async () => {
  const routes = await read('../src/routes/broadcastRoutes.js');
  const lifecycle = await read('../src/controllers/broadcastLifecycleController.js');
  assert.match(routes, /router\.post\('\/covers',\s*authenticate,\s*requireCreator,\s*broadcastCoverUploadFile,\s*uploadBroadcastCover\)/);
  assert.match(lifecycle, /BROADCAST_COVER_REQUIRED[\s\S]*Upload a Broadcast Cover before going live/);
  assert.ok(lifecycle.indexOf('BROADCAST_COVER_REQUIRED') < lifecycle.indexOf('acquireCreatorBroadcastLease(req.userId, broadcastId)'));
});

test('Creator picker remains compact beside title and Listener room prioritizes the broadcast cover', async () => {
  const creator = await read('../../frontend/src/Components/CreatorStudio/CreatorLiveConnectedWorkspace.jsx');
  const css = await read('../../frontend/src/Components/CreatorStudio/CreatorBroadcastApproved.css');
  const listener = await read('../../frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx');
  assert.match(creator, /Title for this broadcast[\s\S]*?Broadcast Cover/);
  assert.match(creator, /uploadBroadcastCover\(file\)/);
  assert.doesNotMatch(creator, /Service flyer \(optional\)/i);
  assert.match(css, /\.ec2-broadcast-cover-picker img \{[^}]*width: 20px/);
  assert.match(listener, /item\?\.coverArt/);
});
