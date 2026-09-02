import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('recording artwork uses the owner-scoped cover API and canonical replay fallback', async () => {
  const [service, modal, broadcasts] = await Promise.all([
    source('./recordingArtworkService.js'),
    source('../Components/CreatorStudio/CreatorAudioDetailModal.jsx'),
    source('./batch2Service.js'),
  ]);

  assert.match(service, /apiFetch\(`\/audio\/\$\{encodeURIComponent\(audioId\)\}\/cover`/);
  assert.match(service, /formData\.append\('cover', coverFile\)/);
  assert.match(modal, /response\?\.data\?\.coverArt/);
  assert.match(modal, /setRecordingArtwork\(nextArtwork\)/);
  assert.match(broadcasts, /replayAudio\?\.coverArt \|\| eventArtwork \|\| normalizedStation\?\.brandCover/);
});
