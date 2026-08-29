import assert from 'node:assert/strict';
import test from 'node:test';

import {
  audienceCeiling,
  buildChannelRows,
  filterAndSortChannels,
} from './creatorChannelsModel.js';

const stations = [
  { id: 'mine', ownerId: 'me', name: 'Mine', isPublic: true },
  { id: 'one', ownerId: 'creator-one', name: 'Faith Talks', category: 'Education', tags: ['Faith'], isPublic: true, createdAt: '2026-01-01' },
  { id: 'private', ownerId: 'creator-two', name: 'Hidden', isPublic: false },
  { id: 'two', ownerId: 'creator-two', name: 'Music Live', category: 'Music', isPublic: true, createdAt: '2026-02-01' },
];

const live = [
  { id: 'broadcast-one', stationId: 'one', status: 'live', title: 'Teaching truth', eventArtwork: '/event.jpg', coverArt: '/station.jpg', listenerCount: 12, captionSettings: { language: 'en' } },
  { id: 'broadcast-two', stationId: 'two', status: 'live', title: 'Praise night', listenerCount: 90, captionSettings: { language: 'yo' } },
];

test('builds one public discovery row per other creator from canonical live broadcasts', () => {
  const rows = buildChannelRows({ stations, liveBroadcasts: live, currentUserId: 'me', ownedStationIds: ['mine'] });
  assert.deepEqual(rows.map((row) => row.id), ['one', 'two']);
  assert.equal(rows[0].isLive, true);
  assert.equal(rows[0].description, 'Teaching truth');
  assert.equal(rows[0].artwork, '/event.jpg');
  assert.equal(rows[0].languageCode, 'en');
});

test('excludes canonical owned station IDs when a public payload omits owner metadata', () => {
  const rows = buildChannelRows({
    stations: [{ id: 'mine', name: 'Mine', isPublic: true }],
    liveBroadcasts: [{ id: 'broadcast', stationId: 'mine', status: 'live' }],
    currentUserId: 'me',
    ownedStationIds: ['mine'],
  });
  assert.deepEqual(rows, []);
});

test('searches metadata and applies real category, language, audience and status filters', () => {
  const rows = buildChannelRows({ stations, liveBroadcasts: live, currentUserId: 'me' });
  assert.deepEqual(filterAndSortChannels(rows, { query: 'faith' }).map((row) => row.id), ['one']);
  assert.deepEqual(filterAndSortChannels(rows, { category: 'Music' }).map((row) => row.id), ['two']);
  assert.deepEqual(filterAndSortChannels(rows, { language: 'yo' }).map((row) => row.id), ['two']);
  assert.deepEqual(filterAndSortChannels(rows, { minimumAudience: 50 }).map((row) => row.id), ['two']);
});

test('sorts by listener count or recency and derives a sensible audience ceiling', () => {
  const rows = buildChannelRows({ stations, liveBroadcasts: live, currentUserId: 'me' });
  assert.deepEqual(filterAndSortChannels(rows, { sort: 'listeners' }).map((row) => row.id), ['two', 'one']);
  assert.deepEqual(filterAndSortChannels(rows, { sort: 'newest' }).map((row) => row.id), ['two', 'one']);
  assert.equal(audienceCeiling(rows), 90);
});
