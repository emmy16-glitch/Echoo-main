import assert from 'node:assert/strict';
import test from 'node:test';

import {
  copyTextToClipboard,
  getPublicStationPath,
  getPublicStationUrl,
} from './stationPublicUrl.js';

test('builds the permanent listener route from the existing station slug', () => {
  const station = { id: 'station-id', slug: 'layers-of-truth', isPublic: true };
  assert.equal(getPublicStationPath(station), '/listen/stations/layers-of-truth');
  assert.equal(
    getPublicStationUrl(station, { browserOrigin: 'https://echoo.example.com' }),
    'https://echoo.example.com/listen/stations/layers-of-truth'
  );
});

test('prefers a configured canonical origin and rejects unsafe origins', () => {
  const station = { slug: 'layers-of-truth' };
  assert.equal(
    getPublicStationUrl(station, {
      configuredOrigin: 'https://app.echoo.example.com/some/path',
      browserOrigin: 'http://localhost:5173',
    }),
    'https://app.echoo.example.com/listen/stations/layers-of-truth'
  );
  assert.equal(
    getPublicStationUrl(station, {
      configuredOrigin: 'javascript:alert(1)',
      browserOrigin: 'http://localhost:5173',
    }),
    'http://localhost:5173/listen/stations/layers-of-truth'
  );
});

test('does not expose a private station and retains the ID fallback', () => {
  assert.equal(getPublicStationPath({ slug: 'private', isPublic: false }), '');
  assert.equal(getPublicStationPath({ id: 'legacy-id' }), '/listen/stations/legacy-id');
});

test('copies through the Clipboard API when available', async () => {
  let copied = '';
  await copyTextToClipboard('https://echoo.example.com/listen/stations/demo', {
    navigatorRef: { clipboard: { writeText: async (value) => { copied = value; } } },
    documentRef: null,
  });
  assert.equal(copied, 'https://echoo.example.com/listen/stations/demo');
});

test('falls back to a temporary textarea when the Clipboard API is unavailable', async () => {
  let selected = false;
  let removed = false;
  const textArea = {
    value: '',
    style: {},
    setAttribute() {},
    select() { selected = true; },
  };
  const documentRef = {
    body: {
      appendChild(node) { assert.equal(node, textArea); },
      removeChild(node) { assert.equal(node, textArea); removed = true; },
    },
    createElement(tagName) { assert.equal(tagName, 'textarea'); return textArea; },
    execCommand(command) { assert.equal(command, 'copy'); return true; },
  };

  await copyTextToClipboard('fallback-link', { navigatorRef: {}, documentRef });
  assert.equal(textArea.value, 'fallback-link');
  assert.equal(selected, true);
  assert.equal(removed, true);
});
