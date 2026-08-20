import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = (relativePath) =>
  fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('station deletion cannot strand pending or retryable broadcasts', async () => {
  const routes = await source('src/routes/stationRoutes.js');
  const guard = await source('src/middleware/stationDeletionGuard.js');

  assert.match(routes, /requireStationDeletionSafe/);
  assert.match(
    routes,
    /router\.delete\([\s\S]*requireStationDeletionSafe[\s\S]*deleteStation/
  );
  for (const status of ['draft', 'scheduled', 'failed', 'starting', 'live', 'ending']) {
    assert.match(guard, new RegExp(`['"]${status}['"]`));
  }
  assert.match(guard, /STATION_HAS_PENDING_BROADCAST/);
  assert.match(guard, /\/uploads\/stations\//);
  assert.match(guard, /fs\.promises\.unlink/);
});

test('audio like route no longer imports the legacy count-only toggle', async () => {
  const routes = await source('src/routes/audioRoutes.js');
  assert.match(routes, /audioLikeController/);
  assert.match(routes, /toggleAudioLike/);
  assert.doesNotMatch(
    routes,
    /import\s*\{[\s\S]*toggleLike[\s\S]*\}\s*from\s*['"]\.\.\/controllers\/audioController\.js['"]/
  );
});

test('user deletion endpoint cannot bypass Settings password verification', async () => {
  const routes = await source('src/routes/userRoutes.js');
  assert.doesNotMatch(routes, /user\.isActive\s*=\s*false/);
  assert.match(routes, /ACCOUNT_STATE_VIA_SETTINGS/);
  assert.match(routes, /status\(405\)/);
});
