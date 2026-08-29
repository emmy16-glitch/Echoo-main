import assert from 'node:assert/strict';
import test from 'node:test';

import { buildStationLookupFilter } from '../src/controllers/stationController.js';

test('station public lookup accepts an existing slug', () => {
  assert.deepEqual(buildStationLookupFilter('Layers-of-Truth'), {
    slug: 'layers-of-truth',
  });
});

test('station public lookup remains backwards compatible with object IDs', () => {
  assert.deepEqual(buildStationLookupFilter('507f1f77bcf86cd799439011'), {
    _id: '507f1f77bcf86cd799439011',
  });
});

test('station public lookup rejects non URL-safe identifiers', () => {
  assert.equal(buildStationLookupFilter('../private'), null);
  assert.equal(buildStationLookupFilter(''), null);
});
