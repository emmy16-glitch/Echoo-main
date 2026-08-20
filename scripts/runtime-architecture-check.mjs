import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const assertContains = (file, token, message) => {
  if (!read(file).includes(token)) failures.push(message || `${file} is missing ${token}`);
};

const assertNotContains = (file, token, message) => {
  if (read(file).includes(token)) failures.push(message || `${file} still contains ${token}`);
};

for (const required of [
  'backend/src/middleware/rateLimiter.js',
  'backend/src/controllers/audioStreamController.js',
  'backend/src/services/audioStreamAccess.js',
  'backend/src/services/broadcastAudioReadiness.js',
  'frontend/src/services/echooMixerService.js',
  'frontend/src/services/livekitPublisher.js',
  'ARCHITECTURE.md',
  'SMOKE_TEST.md',
]) {
  if (!fs.existsSync(path.join(root, required))) failures.push(`Missing runtime authority: ${required}`);
}

assertContains(
  'backend/src/routes/authRoutes.js',
  "'/forgot-password'",
  'Forgot-password controller exists but its API route is missing.'
);
assertContains(
  'backend/src/routes/authRoutes.js',
  'authLimiter',
  'Credential entrypoints are missing authentication throttling.'
);
assertContains(
  'backend/src/routes/authRoutes.js',
  'refreshLimiter',
  'Refresh endpoint is missing dedicated throttling.'
);
assertContains(
  'backend/src/routes/searchRoutes.js',
  'router.use(searchLimiter)',
  'Public search is missing its request-flood guard.'
);
assertContains(
  'backend/src/routes/index.js',
  "router.use('/audio/upload', uploadLimiter)",
  'Large local audio uploads are missing their dedicated throttle.'
);
assertContains(
  'backend/src/routes/index.js',
  "router.get('/health/ready'",
  'API readiness endpoint is missing.'
);

const settingsRoutes = read('backend/src/routes/settingsRoutes.js');
const reactivateIndex = settingsRoutes.indexOf("'/reactivate'");
const activeOnlyIndex = settingsRoutes.indexOf('router.use(authenticate)');
if (
  reactivateIndex < 0 ||
  activeOnlyIndex < 0 ||
  reactivateIndex > activeOnlyIndex ||
  !settingsRoutes.includes('authenticateIncludingInactive')
) {
  failures.push('Account reactivation is unreachable behind active-only authentication.');
}

const jwt = read('backend/src/config/jwt.js');
for (const token of [
  'algorithms: [jwtConfig.access.algorithm]',
  'algorithms: [jwtConfig.refresh.algorithm]',
]) {
  if (!jwt.includes(token)) failures.push(`JWT verification lost algorithm pinning: ${token}`);
}

const studio = read('backend/src/controllers/studioController.js');
if (!studio.includes("buildAudioStreamUrl(track, { access: 'owner' })")) {
  failures.push('Creator Studio no longer receives owner-scoped playback URLs for private audio.');
}
if (!studio.includes('Follow.countDocuments(followFilter)')) {
  failures.push('Creator audience totals are again capped by the UI follower sample.');
}

const player = read('backend/src/controllers/playerController.js');
for (const forbidden of [
  'track.duration = clientDuration',
  'track.duration = reportedDuration',
]) {
  if (player.includes(forbidden)) {
    failures.push('Listener playback can rewrite creator-owned Audio.duration metadata.');
  }
}

const publisher = read('frontend/src/services/livekitPublisher.js');
for (const invariant of [
  "name: 'echoo-studio-mix'",
  'forceStereo: true',
  'dtx: false',
  'red: false',
]) {
  if (!publisher.includes(invariant)) failures.push(`Live program invariant missing: ${invariant}`);
}
if (publisher.includes('createLocalAudioTrack(')) {
  failures.push('LiveKit publisher reintroduced a raw microphone fallback outside the mixer.');
}

const architecture = read('ARCHITECTURE.md');
for (const requiredDocToken of [
  'echoo-studio-mix',
  '/api/audio/:id/stream',
  'process-local',
]) {
  if (!architecture.includes(requiredDocToken)) {
    failures.push(`ARCHITECTURE.md is stale: missing ${requiredDocToken}`);
  }
}

const smoke = read('SMOKE_TEST.md');
if (/Confirm `\/uploads\/audio\/\.\.\.` is reachable/i.test(smoke)) {
  failures.push('SMOKE_TEST.md incorrectly expects private audio storage to be publicly reachable.');
}
if (!smoke.includes('206 Partial Content') || !smoke.includes('blocked/404')) {
  failures.push('SMOKE_TEST.md is missing protected HTTP Range streaming validation.');
}

const readme = read('README.md');
if (readme.includes('Redis / Socket.IO as implemented')) {
  failures.push('README.md falsely claims the current Socket.IO process has Redis-backed cluster state.');
}
if (!readme.includes('post-master `echoo-studio-mix`')) {
  failures.push('README.md no longer documents the canonical post-master LiveKit feed.');
}

if (failures.length) {
  console.error('\nEchoo runtime architecture check FAILED:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Echoo runtime architecture check passed.');
console.log('Auth throttling + reactivation: guarded');
console.log('Creator private playback: owner-scoped signed stream');
console.log('Live program: post-master echoo-studio-mix -> LiveKit');
console.log('Prerecorded audio: protected Range stream; direct storage blocked');
console.log('Realtime scaling claims: process-local unless a shared adapter is explicitly added');
