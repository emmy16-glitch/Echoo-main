import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveRadioMount, releaseRadioMount } from '../src/services/radioMountOwnership.js';

test('two simultaneous organizations cannot publish over the same global Icecast mount', () => {
  const mount = 'radio.example.test:8000/live';
  try {
    assert.equal(reserveRadioMount(mount, 'broadcast-a'), true);
    assert.equal(reserveRadioMount(mount, 'broadcast-a'), true);
    assert.equal(reserveRadioMount(mount, 'broadcast-b'), false);
    releaseRadioMount(mount, 'broadcast-b');
    assert.equal(reserveRadioMount(mount, 'broadcast-b'), false);
  } finally { releaseRadioMount(mount, 'broadcast-a'); }
  assert.equal(reserveRadioMount(mount, 'broadcast-b'), true);
  releaseRadioMount(mount, 'broadcast-b');
});

test('different mounts never block each other', () => {
  assert.equal(reserveRadioMount('host:8000/a', 'a'), true);
  assert.equal(reserveRadioMount('host:8000/b', 'b'), true);
  releaseRadioMount('host:8000/a', 'a');
  releaseRadioMount('host:8000/b', 'b');
});
