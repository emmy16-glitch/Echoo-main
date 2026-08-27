import assert from 'node:assert/strict';
import test from 'node:test';

import { CREATOR_RENAME_UNDO_WINDOW_MS } from './playerFeedback.js';

test('creator rename Undo duration is a shared positive millisecond value', () => {
  assert.equal(CREATOR_RENAME_UNDO_WINDOW_MS, 8_000);
  assert.ok(Number.isInteger(CREATOR_RENAME_UNDO_WINDOW_MS));
  assert.ok(CREATOR_RENAME_UNDO_WINDOW_MS > 0);
});
