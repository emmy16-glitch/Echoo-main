import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

const exists = (relative) => fs.existsSync(path.join(root, relative));
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const walk = (directory) => {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];

  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(relative);
    return [relative];
  });
};

const requireFile = (relative) => {
  if (!exists(relative)) failures.push(`Missing required file: ${relative}`);
};

const forbidFile = (relative) => {
  if (exists(relative)) failures.push(`Obsolete duplicate still exists: ${relative}`);
};

[
  'frontend/src/Components/CreatorStudio/CreatorLiveConnectedWorkspace.jsx',
  'frontend/src/Components/CreatorStudio/CreatorScheduleWorkspace.jsx',
  'frontend/src/Components/CreatorStudio/CreatorStationsWorkspace.jsx',
  'frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx',
  'frontend/src/Components/ListenerLiveExperience/LiveKitListenerPlayer.jsx',
  'frontend/src/services/realtimeService.js',
  'backend/src/controllers/broadcastController.js',
  'backend/src/providers/livekit.js',
  'backend/src/models/StationFollow.js',
  'ARCHITECTURE.md',
].forEach(requireFile);

[
  'backend/src/routes/scheduleRoutes.js',
  'backend/src/controllers/scheduleController.js',
  'backend/src/routes/listenerLivekitRoutes.js',
  'frontend/src/Components/CreatorStudio/CreatorLiveWorkspace.jsx',
  'frontend/src/Components/ListenerLiveExperience/ListenerLiveExperience.jsx',
  'frontend/src/Components/ListenerLive/ListenerLive.jsx',
  'frontend/src/Components/ListenerStations/ListenerStations.jsx',
  'frontend/src/services/listenerMockService.js',
  'frontend/src/services/mockMediaService.js',
  'frontend/src/services/momentService.js',
].forEach(forbidFile);

const componentFiles = walk('frontend/src/Components').filter((file) =>
  /\.(jsx|js)$/.test(file)
);

const createStationCallers = componentFiles.filter((file) => {
  const source = read(file);
  return /\.createStation\s*\(/.test(source);
});

const allowedStationCreator =
  'frontend/src/Components/CreatorStudio/CreatorStationsWorkspace.jsx';

if (
  createStationCallers.length !== 1 ||
  createStationCallers[0] !== allowedStationCreator
) {
  failures.push(
    `Station creation must exist in exactly one UI (${allowedStationCreator}). Found: ${
      createStationCallers.length ? createStationCallers.join(', ') : 'none'
    }`
  );
}

const frontendFiles = walk('frontend/src').filter((file) => /\.(jsx|js|css)$/.test(file));
const forbiddenRuntimeTokens = [
  'listenerMockService',
  'mockMediaService',
  '/mock-media/',
  '/audio/deep-focus.mp3',
  '/audio/motivation.mp3',
  '/audio/sunday-message.mp3',
  'Faith Talk Live',
  'Praise & Worship Live',
];

for (const file of frontendFiles) {
  const source = read(file);
  for (const token of forbiddenRuntimeTokens) {
    if (source.includes(token)) {
      failures.push(`Forbidden production mock token "${token}" found in ${file}`);
    }
  }
}

const routeIndex = read('backend/src/routes/index.js');
for (const obsoleteImport of ['scheduleRoutes', 'listenerLivekitRoutes']) {
  if (routeIndex.includes(obsoleteImport)) {
    failures.push(`Duplicate backend route still mounted: ${obsoleteImport}`);
  }
}

const stationRoutes = read('backend/src/routes/stationRoutes.js');
for (const obsoleteStationRoute of ['toggle-live', '/schedule']) {
  if (stationRoutes.includes(obsoleteStationRoute)) {
    failures.push(`Station routes still contain duplicate runtime authority: ${obsoleteStationRoute}`);
  }
}

const stationModel = read('backend/src/models/Station.js');
if (stationModel.includes('schedule: [{') || stationModel.includes('toggleLive')) {
  failures.push('Station model reintroduced a duplicate schedule/manual live authority.');
}

const batch2Service = read('frontend/src/services/batch2Service.js');
for (const obsoleteClientMethod of ['getStationSchedule', 'updateStationSchedule']) {
  if (batch2Service.includes(obsoleteClientMethod)) {
    failures.push(`Frontend Station service reintroduced obsolete method: ${obsoleteClientMethod}`);
  }
}

const analyticsController = read('backend/src/controllers/analyticsController.js');
for (const syntheticToken of [
  'Math.random()',
  'Mock change percentage',
  "city: 'Lagos'",
  "name: 'Chill & Relax'",
]) {
  if (analyticsController.includes(syntheticToken)) {
    failures.push(`Synthetic analytics token returned: ${syntheticToken}`);
  }
}

const searchController = read('backend/src/controllers/searchController.js');
for (const syntheticSearchToken of [
  "term: 'Faith & Spirituality', type: 'category', count: 1250",
  "term: 'Faith Talk', type: 'track', trend: 45",
]) {
  if (searchController.includes(syntheticSearchToken)) {
    failures.push(`Synthetic search data returned: ${syntheticSearchToken}`);
  }
}

const broadcastRoutes = read('backend/src/routes/broadcastRoutes.js');
for (const canonicalRoute of ['/start', '/confirm-live', '/end', '/cancel', '/listener-token']) {
  if (!broadcastRoutes.includes(canonicalRoute)) {
    failures.push(`Broadcast lifecycle route missing: ${canonicalRoute}`);
  }
}

if (failures.length) {
  console.error('\nEchoo architecture check FAILED:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Echoo architecture check passed.');
console.log(`Station creation UI: ${allowedStationCreator}`);
console.log('Scheduling authority: Broadcast');
console.log('Live media path: Creator -> LiveKit -> Listener');
console.log('Synthetic analytics/search data guard: active');
