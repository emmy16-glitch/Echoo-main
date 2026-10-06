import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('creator setup stays inside React Router after channel creation', async () => {
  const creator = await source('../../frontend/src/Components/CreatorSetup/CreatorSetup.jsx');
  assert.match(creator, /useNavigate/);
  assert.doesNotMatch(creator, /assignAppRoute\('\/creator-studio'\)/);
  assert.match(creator, /navigate\('\/creator-studio', \{ replace: true \}\)/);
});

test('Render static build emits common creator and listener entrypoints', async () => {
  const script = await source('../../frontend/scripts/write-static-spa-entrypoints.mjs');
  for (const route of [
    "'creator-studio'",
    "'creator-studio/channels'",
    "'creator-studio/recordings'",
    "'listen'",
    "'listen/library'",
    "'listen/settings'",
  ]) {
    assert.ok(script.includes(route), `Missing static SPA entrypoint ${route}`);
  }
});
