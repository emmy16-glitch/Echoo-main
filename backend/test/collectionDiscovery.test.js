import test from 'node:test';
import assert from 'node:assert/strict';
import Playlist from '../src/models/Playlist.js';
import { getPublicCollections } from '../src/controllers/collectionController.js';

test('public Collection discovery returns only published series on public Channels', async () => {
  const originalFind = Playlist.find;
  const filterObserved = [];
  const id = (suffix) => `507f1f77bcf86cd7994390${suffix}`;
  const publicStation = { _id: id('21'), name: 'Layers of Truth', isPublic: true };
  const privateStation = { _id: id('22'), name: 'Private Channel', isPublic: false };
  const rows = [
    { _id: id('91'), name: 'School of Doctrine', mode: 'series', owner: { _id: id('11') }, station: publicStation, tracks: [], isPublic: true },
    { _id: id('92'), name: 'Hidden Series', mode: 'series', owner: { _id: id('12') }, station: privateStation, tracks: [], isPublic: true },
  ];
  Playlist.find = (filter) => {
    filterObserved.push(filter);
    const query = {
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      populate() { return this; },
      then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); },
    };
    return query;
  };
  let status = 0;
  let body = null;
  const res = {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  };
  try {
    await getPublicCollections({ query: { page: '1', limit: '20' }, userId: null }, res, (error) => { throw error; });
    assert.equal(status, 200);
    assert.deepEqual(filterObserved, [{ mode: 'series', isDeleted: false, isPublic: true }]);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].title, 'School of Doctrine');
    assert.equal(body.data[0].isSaved, false);
    assert.deepEqual(body.data[0].recordings, []);
  } finally {
    Playlist.find = originalFind;
  }
});
