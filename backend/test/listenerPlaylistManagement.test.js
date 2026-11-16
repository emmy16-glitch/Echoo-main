import test from 'node:test';
import assert from 'node:assert/strict';
import Playlist from '../src/models/Playlist.js';
import { updatePlaylist, deletePlaylist, removeTrackFromPlaylist, reorderTracks } from '../src/controllers/playlistController.js';

test('listener playlist management enforces ownership and complete ordering', async (t) => {
  const original = Playlist.findOne;
  t.after(() => { Playlist.findOne = original; });
  const id = '111111111111111111111111';
  const owner = '222222222222222222222222';
  const other = '333333333333333333333333';
  const track = '444444444444444444444444';
  let saves = 0;
  const playlist = { owner, tracks: [{ trackId: track }], save: async () => { saves++; }, canEdit: (viewer) => viewer === owner };
  Playlist.findOne = async () => playlist;
  const invoke = async (controller, userId, body) => {
    let status, payload;
    await controller({ params: { id }, userId, body }, { status(code) { status = code; return this; }, json(value) { payload = value; } }, (error) => { throw error; });
    return { status, payload };
  };
  await t.test('another listener cannot rename or delete a playlist', async () => {
    assert.equal((await invoke(updatePlaylist, other, { name: 'Hijacked' })).status, 403);
    assert.equal((await invoke(deletePlaylist, other, {})).status, 403);
    assert.equal(saves, 0);
  });
  await t.test('another listener cannot remove or reorder its tracks', async () => {
    assert.equal((await invoke(removeTrackFromPlaylist, other, { trackId: track })).status, 403);
    assert.equal((await invoke(reorderTracks, other, { trackIds: [track] })).status, 403);
  });
  await t.test('reorder cannot silently drop existing tracks', async () => {
    const result = await invoke(reorderTracks, owner, { trackIds: [] });
    assert.equal(result.status, 400); assert.equal(result.payload.error.code, 'INVALID_PLAYLIST_ORDER');
    assert.equal(saves, 0);
  });
});
