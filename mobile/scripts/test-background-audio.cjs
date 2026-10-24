// Static regression check for ECHOO Android background audio configuration.
// Device tests are still required: this verifies native service wiring and
// prevents accidentally removing the background playback/recording setup.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = JSON.parse(read('app.json')).expo;
const expoAudio = app.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-audio');
assert.equal(expoAudio?.[1]?.enableBackgroundPlayback, true, 'Expo background playback must be enabled');
for (const permission of [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.RECORD_AUDIO',
]) {
  assert(app.android.permissions.includes(permission), `Missing ${permission}`);
}

const manifest = read('modules/echoo-live-audio-service/android/src/main/AndroidManifest.xml');
assert.match(manifest, /foregroundServiceType="mediaPlayback\|microphone"/);
const service = read('modules/echoo-live-audio-service/android/src/main/java/org/digi02/echoo/liveaudioservice/EchooLiveAudioService.kt');
assert.match(service, /FOREGROUND_SERVICE_TYPE_MICROPHONE/);
assert.match(service, /kind == "broadcast"/);
assert.doesNotMatch(service, /addAction\(.*"Stop"/, 'A stop notification must not silently terminate only the service');

const creator = read('app/creator-live.tsx');
assert.match(creator, /kind: 'broadcast'/);
assert.match(creator, /await startLiveAudioService/);
assert(creator.indexOf('await startLiveAudioService') < creator.indexOf('await room.connect('),
  'Start the microphone service while the Android activity is visible, before connecting');
assert.match(creator, /BackHandler\.addEventListener\('hardwareBackPress'/);

const playback = read('src/playback/PlaybackProvider.tsx');
assert.match(playback, /shouldPlayInBackground: true/);
assert.match(playback, /setActiveForLockScreen\(/);
assert.match(playback, /kind: 'live'/);
const layout = read('app/_layout.tsx');
assert.match(layout, /<PlaybackProvider>/);
assert.match(layout, /name="creator-live" options=\{\{ gestureEnabled: false \}\}/);

console.log('Android background audio configuration checks passed.');
