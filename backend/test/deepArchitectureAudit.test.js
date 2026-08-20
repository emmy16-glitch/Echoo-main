import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../src/config/jwt.js';

const source = (relativePath) =>
  fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const rootSource = (relativePath) =>
  fs.readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('access and refresh JWT types cannot be confused', () => {
  const userId = '507f1f77bcf86cd799439011';
  const access = generateAccessToken({ userId, email: 'audit@example.com' });
  const refresh = generateRefreshToken({ userId, tokenVersion: 0 });

  assert.equal(verifyAccessToken(access).type, 'access');
  assert.equal(verifyRefreshToken(refresh).type, 'refresh');
  assert.throws(
    () => verifyAccessToken(refresh),
    (error) => error?.message === 'Invalid access token'
  );
  assert.throws(
    () => verifyRefreshToken(access),
    (error) => error?.message === 'Invalid refresh token'
  );
});

test('auth routes expose forgot-password and throttle credential entrypoints', async () => {
  const routes = await source('src/routes/authRoutes.js');
  assert.match(routes, /forgotPassword/);
  assert.match(routes, /['"]\/forgot-password['"]/);
  assert.match(routes, /authLimiter/);
  assert.match(routes, /refreshLimiter/);
});

test('reactivation is authenticated through the inactive-account exception', async () => {
  const routes = await source('src/routes/settingsRoutes.js');
  const reactivation = routes.indexOf("'/reactivate'");
  const activeGuard = routes.indexOf('router.use(authenticate)');
  assert.ok(reactivation >= 0, 'reactivation route should exist');
  assert.ok(activeGuard >= 0, 'normal settings auth guard should exist');
  assert.ok(reactivation < activeGuard, 'reactivation must be registered before active-only guard');
  assert.match(routes, /authenticateIncludingInactive/);
  assert.match(routes, /sensitiveLimiter/);
});

test('public search and large audio uploads have explicit request throttles', async () => {
  const searchRoutes = await source('src/routes/searchRoutes.js');
  const routeIndex = await source('src/routes/index.js');
  assert.match(searchRoutes, /router\.use\(searchLimiter\)/);
  assert.match(routeIndex, /router\.use\(['"]\/audio\/upload['"],\s*uploadLimiter\)/);
});

test('creator content stays creator-only and private creator playback gets owner grants', async () => {
  const studio = await source('src/controllers/studioController.js');
  assert.match(studio, /export async function getContentList/);
  assert.match(studio, /const user = await requireCreator\(req\.userId, res\)/);
  assert.match(studio, /buildAudioStreamUrl\(track, \{ access: 'owner' \}\)/);
  assert.match(studio, /Follow\.countDocuments\(followFilter\)/);
});

test('listener playback metadata cannot rewrite canonical Audio duration', async () => {
  const player = await source('src/controllers/playerController.js');
  assert.doesNotMatch(player, /track\.duration\s*=\s*clientDuration/);
  assert.doesNotMatch(player, /track\.duration\s*=\s*reportedDuration/);
  assert.match(player, /const totalDuration = canonicalDuration \|\| reportedDuration/);
});

test('health separates process liveness, database readiness and LiveKit health', async () => {
  const routes = await source('src/routes/index.js');
  assert.match(routes, /['"]\/health['"]/);
  assert.match(routes, /['"]\/health\/ready['"]/);
  assert.match(routes, /mongoose\.connection\.readyState === 1/);
  assert.match(routes, /['"]\/health\/livekit['"]/);
});

test('architecture docs describe the protected mixer and stream paths, not obsolete direct audio', async () => {
  const architecture = await rootSource('ARCHITECTURE.md');
  const smoke = await rootSource('SMOKE_TEST.md');
  const readme = await rootSource('README.md');

  assert.match(architecture, /echoo-studio-mix/);
  assert.match(architecture, /\/api\/audio\/:id\/stream/);
  assert.match(architecture, /process-local/);
  assert.match(smoke, /direct `\/uploads\/audio\/\.\.\.` is blocked\/404/);
  assert.match(smoke, /206 Partial Content/);
  assert.match(readme, /post-master `echoo-studio-mix`/);
  assert.doesNotMatch(readme, /Redis \/ Socket\.IO as implemented/);
});
