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
  'frontend/src/Components/CreatorStudio/CreatorStudio.jsx',
  'frontend/src/Components/CreatorStudio/CreatorStudioHome.jsx',
  'frontend/src/Components/CreatorStudio/CreatorLiveConnectedWorkspace.jsx',
  'frontend/src/Components/CreatorStudio/CreatorLiveChatPanel.jsx',
  'frontend/src/Components/CreatorStudio/CreatorAudioMixer.jsx',
  'frontend/src/Components/CreatorStudio/CreatorBroadcastStudioExact.css',
  'frontend/src/Components/CreatorStudio/CreatorStationsWorkspace.jsx',
  'frontend/src/Components/CreatorStudio/CreatorStationsExact.css',
  'frontend/src/Components/CreatorStudio/CreatorContentWorkspace.jsx',
  'frontend/src/Components/CreatorStudio/CreatorContentExact.css',
  'frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx',
  'frontend/src/Components/ListenerLiveExperience/LiveKitListenerPlayer.jsx',
  'frontend/src/Components/EchooSystem/EchooExperienceOrchestrator.jsx',
  'frontend/src/Components/Assets/echoo-patterns/signal-wave.svg',
  'frontend/src/Components/Assets/echoo-patterns/layered-waves.svg',
  'frontend/src/Components/Assets/echoo-patterns/circle-scatter.svg',
  'frontend/src/Components/Assets/echoo-patterns/blob-scene.svg',
  'frontend/src/styles/echoo-experience-2026.css',
  'frontend/src/styles/echoo-component-refinement-2026.css',
  'frontend/src/styles/echoo-auth-motion-2026.css',
  'frontend/src/styles/echoo-responsive-2026.css',
  'frontend/src/services/echooMixerService.js',
  'frontend/src/services/livekitPublisher.js',
  'backend/src/models/BroadcastAudioChunk.js',
  'backend/src/controllers/broadcastChunkController.js',
  'backend/src/services/transcriptQualityService.js',
  'backend/src/controllers/broadcastController.js',
  'backend/src/providers/livekit.js',
  'backend/src/middleware/enforceSingleLiveCreator.js',
  'backend/src/models/StationFollow.js',
  'ARCHITECTURE.md',
].forEach(requireFile);

[
  'backend/src/routes/scheduleRoutes.js',
  'backend/src/controllers/scheduleController.js',
  'backend/src/routes/listenerLivekitRoutes.js',
  'frontend/src/Components/CreatorStudio/CreatorScheduleWorkspace.jsx',
  'frontend/src/Components/CreatorStudio/CreatorLiveWorkspace.jsx',
  'frontend/src/Components/ListenerLiveExperience/ListenerLiveExperience.jsx',
  'frontend/src/Components/ListenerLive/ListenerLive.jsx',
  'frontend/src/Components/ListenerStations/ListenerStations.jsx',
  'frontend/src/services/listenerMockService.js',
  'frontend/src/services/mockMediaService.js',
  'frontend/src/services/momentService.js',
].forEach(forbidFile);

const componentFiles = walk('frontend/src/Components').filter((file) => /\.(jsx|js)$/.test(file));
const createStationCallers = componentFiles.filter((file) => /\.createStation\s*\(/.test(read(file)));
const allowedStationCreator = 'frontend/src/Components/CreatorStudio/CreatorStationsWorkspace.jsx';

if (createStationCallers.length !== 1 || createStationCallers[0] !== allowedStationCreator) {
  failures.push(
    `Station creation must exist in exactly one UI (${allowedStationCreator}). Found: ${
      createStationCallers.length ? createStationCallers.join(', ') : 'none'
    }`
  );
}

const creatorStudio = read('frontend/src/Components/CreatorStudio/CreatorStudio.jsx');
for (const obsoleteNav of ["name: 'Live'", "name: 'Schedule'"]) {
  if (creatorStudio.includes(obsoleteNav)) {
    failures.push(`Creator Studio reintroduced a duplicate sidebar destination: ${obsoleteNav}`);
  }
}
for (const requiredNav of ["name: 'Home'", "name: 'Stations'", "name: 'Broadcast'", "name: 'Audio'"]) {
  if (!creatorStudio.includes(requiredNav)) {
    failures.push(`Creator Studio navigation is missing: ${requiredNav}`);
  }
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
    if (source.includes(token)) failures.push(`Forbidden production mock token "${token}" found in ${file}`);
  }
}

const appSource = read('frontend/src/App.jsx');
const mainSource = read('frontend/src/main.jsx');
const experienceSource = read('frontend/src/Components/EchooSystem/EchooExperienceOrchestrator.jsx');
for (const requiredExperienceToken of [
  'EchooExperienceOrchestrator',
  '<EchooExperienceOrchestrator />',
]) {
  if (!appSource.includes(requiredExperienceToken)) {
    failures.push(`Product-wide experience orchestration is missing from App.jsx: ${requiredExperienceToken}`);
  }
}
for (const experienceStylesheet of [
  'echoo-experience-2026.css',
  'echoo-component-refinement-2026.css',
  'echoo-auth-motion-2026.css',
  'echoo-responsive-2026.css',
]) {
  if (!mainSource.includes(experienceStylesheet)) {
    failures.push(`Product-wide Echoo design layer is not loaded: ${experienceStylesheet}`);
  }
}
if (!experienceSource.includes('IntersectionObserver') || !experienceSource.includes('prefers-reduced-motion')) {
  failures.push('Echoo experience orchestration must keep in-view motion and reduced-motion accessibility.');
}

const routeIndex = read('backend/src/routes/index.js');
for (const obsoleteImport of ['scheduleRoutes', 'listenerLivekitRoutes']) {
  if (routeIndex.includes(obsoleteImport)) failures.push(`Duplicate backend route still mounted: ${obsoleteImport}`);
}

const stationRoutes = read('backend/src/routes/stationRoutes.js');
for (const obsoleteStationRoute of ['toggle-live', '/schedule']) {
  if (stationRoutes.includes(obsoleteStationRoute)) failures.push(`Station routes still contain duplicate runtime authority: ${obsoleteStationRoute}`);
}

const stationModel = read('backend/src/models/Station.js');
if (stationModel.includes('schedule: [{') || stationModel.includes('toggleLive')) {
  failures.push('Station model reintroduced a duplicate schedule/manual live authority.');
}

const batch2Service = read('frontend/src/services/batch2Service.js');
for (const obsoleteClientMethod of ['getStationSchedule', 'updateStationSchedule']) {
  if (batch2Service.includes(obsoleteClientMethod)) failures.push(`Frontend Station service reintroduced obsolete method: ${obsoleteClientMethod}`);
}

const analyticsController = read('backend/src/controllers/analyticsController.js');
for (const syntheticToken of ['Math.random()', 'Mock change percentage', "city: 'Lagos'", "name: 'Chill & Relax'"]) {
  if (analyticsController.includes(syntheticToken)) failures.push(`Synthetic analytics token returned: ${syntheticToken}`);
}

const searchController = read('backend/src/controllers/searchController.js');
for (const syntheticSearchToken of [
  "term: 'Faith & Spirituality', type: 'category', count: 1250",
  "term: 'Faith Talk', type: 'track', trend: 45",
]) {
  if (searchController.includes(syntheticSearchToken)) failures.push(`Synthetic search data returned: ${syntheticSearchToken}`);
}

const broadcastRoutes = read('backend/src/routes/broadcastRoutes.js');
for (const canonicalRoute of ['/start', '/confirm-live', '/end', '/cancel', '/listener-token']) {
  if (!broadcastRoutes.includes(canonicalRoute)) failures.push(`Broadcast lifecycle route missing: ${canonicalRoute}`);
}
if (!broadcastRoutes.includes('enforceSingleLiveCreator')) {
  failures.push('Broadcast start route is missing the one-active-live creator guard.');
}

const mixerService = read('frontend/src/services/echooMixerService.js');
for (const mixerChannel of ["name: 'Host Mic'", "name: 'Guest Mic'", "name: 'Music / FX'"]) {
  if (!mixerService.includes(mixerChannel)) failures.push(`Studio mixer is missing channel: ${mixerChannel}`);
}
if (!mixerService.includes('createMediaStreamDestination')) {
  failures.push('Studio mixer is not producing a real mixed MediaStream output.');
}

const qualityJobModel = read('backend/src/models/BroadcastProcessingJob.js');
if (!qualityJobModel.includes("'transcript_quality_chunk'") || !qualityJobModel.includes('chunkId')) {
  failures.push('BroadcastProcessingJob is missing durable transcript quality chunk support.');
}
const qualityService = read('backend/src/services/transcriptQualityService.js');
for (const qualityToken of ['qualityHistory', 'originalText', 'processedBy', 'processedAt']) {
  if (!qualityService.includes(qualityToken)) failures.push(`Transcript quality reconciliation is missing: ${qualityToken}`);
}
const recordingService = read('frontend/src/services/broadcastRecordingService.js');
for (const chunkToken of ['recording-chunks', 'QUALITY_CHUNK_SECONDS', 'qualityChunkErrors']) {
  if (!recordingService.includes(chunkToken)) failures.push(`Live recording chunk pipeline is missing: ${chunkToken}`);
}

const publisher = read('frontend/src/services/livekitPublisher.js');
if (!publisher.includes("name: 'echoo-studio-mix'") || !publisher.includes('mediaTrack')) {
  failures.push('LiveKit publisher is not wired to the real Echoo studio mix.');
}

const broadcastStudio = read('frontend/src/Components/CreatorStudio/CreatorLiveConnectedWorkspace.jsx');
for (const requiredStudioFeature of ['CreatorBroadcastAudioSurface', 'Go live now', 'Schedule for later']) {
  if (!broadcastStudio.includes(requiredStudioFeature)) {
    failures.push(`Broadcast Studio is missing: ${requiredStudioFeature}`);
  }
}

const creatorLiveChat = read('frontend/src/Components/CreatorStudio/CreatorLiveChatPanel.jsx');
if (!broadcastStudio.includes('CreatorLiveChatPanel') || !creatorLiveChat.includes('Live Chat')) {
  failures.push('Broadcast Studio is missing the synchronized Live Chat component.');
}

if (failures.length) {
  console.error('\nEchoo architecture check FAILED:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Echoo architecture check passed.');
console.log(`Station creation UI: ${allowedStationCreator}`);
console.log('Creator navigation: Home -> Stations -> Broadcast -> Audio -> Audience -> Analytics -> Settings');
console.log('Scheduling authority: unified Broadcast Studio');
console.log('Live concurrency: one active broadcast per creator account');
console.log('Studio mixer: Host Mic + Guest Mic + Music/FX -> Master Output -> LiveKit');
console.log('Live chat: synchronized CreatorLiveChatPanel + listener room');
console.log('Experience system: shared motion + premium component layer + Echoo SVG geometry + strict responsive pass');
console.log('Live media path: Creator mixer -> LiveKit -> Listener');
console.log('Synthetic analytics/search data guard: active');
