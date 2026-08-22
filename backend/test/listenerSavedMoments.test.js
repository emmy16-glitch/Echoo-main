import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import SavedMoment from '../src/models/SavedMoment.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('saved listener moments are user-owned, source-linked and cursor indexed', () => {
  const paths = SavedMoment.schema.paths;
  assert.equal(paths.userId.options.required, true);
  assert.equal(paths.creatorId.options.required, true);
  assert.equal(paths.timestampMs.options.required, true);
  assert.ok(paths.audioId);
  assert.ok(paths.broadcastId);
  assert.ok(paths.stationId);
  assert.ok(paths.transcriptSegmentId);

  const indexes = SavedMoment.schema.indexes();
  assert.ok(indexes.some(([keys]) => keys.userId === 1 && keys.createdAt === -1 && keys._id === -1));
  assert.ok(indexes.some(([keys, options]) => keys.userId === 1 && keys.timestampMs === 1 && options.unique));
});

test('saved moment routes authenticate every operation and replay creation links live moments', async () => {
  const [routes, controller, audioController, routeIndex] = await Promise.all([
    source('../src/routes/savedMomentRoutes.js'),
    source('../src/controllers/savedMomentController.js'),
    source('../src/controllers/audioController.js'),
    source('../src/routes/index.js'),
  ]);
  assert.match(routes, /router\.use\(authenticate\)/);
  assert.match(controller, /userId: req\.userId/);
  assert.match(controller, /SEGMENT_MISMATCH/);
  assert.match(audioController, /SavedMoment\.updateMany/);
  assert.match(routeIndex, /\/saved-moments/);
});

test('global search exposes final public transcript matches with replay timestamps', async () => {
  const searchController = await source('../src/controllers/searchController.js');
  assert.match(searchController, /searchTypes\.includes\('transcripts'\)/);
  assert.match(searchController, /isFinal: true/);
  assert.match(searchController, /isHidden: \{ \$ne: true \}/);
  assert.match(searchController, /timestampMs: segment\.startMs/);
});
