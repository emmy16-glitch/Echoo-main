import assert from 'node:assert/strict';
import test from 'node:test';
import { progressPercentToFraction } from './historyProgress.js';

test('converts persisted 0–100 player progress into a history fraction', () => {
  assert.equal(progressPercentToFraction(25), 0.25);
  assert.equal(progressPercentToFraction('75'), 0.75);
  assert.equal(progressPercentToFraction(100), 1);
});

test('keeps malformed and out-of-range history progress safe', () => {
  assert.equal(progressPercentToFraction(-4), 0);
  assert.equal(progressPercentToFraction(400), 1);
  assert.equal(progressPercentToFraction('not-a-number'), 0);
});
