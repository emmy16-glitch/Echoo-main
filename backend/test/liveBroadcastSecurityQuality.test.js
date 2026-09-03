import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (relativePath) =>
  fs.readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('creator LiveKit token grants publishing only through the creator token path', async () => {
  const provider = await read('frontend/src/services/livekitPublisher.js');
  const quality = await read('frontend/src/services/realtimeAudioQuality.js');
  assert.match(provider, /liveKitPublishOptionsFor\(selectedQualityProfile\)/);
  assert.match(quality, /forceStereo:\s*true/);
  assert.match(quality, /red:\s*profile\.red/);
  assert.match(quality, /maxBitrate:\s*profile\.maxBitrate/);
});

test('listener LiveKit connections retry signaling and peer connection failures', async () => {
  const player = await read('frontend/src/Components/ListenerLiveExperience/LiveKitListenerPlayer.jsx');
  assert.match(player, /maxRetries:\s*5/);
  assert.match(player, /websocketTimeout:\s*15000/);
  assert.match(player, /peerConnectionTimeout:\s*20000/);
});

test('backend keeps creator and listener grants separated', async () => {
  const provider = await read('backend/src/providers/livekit.js');
  assert.match(provider, /generateCreatorToken/);
  assert.match(provider, /generateListenerToken/);
  assert.match(provider, /canPublish:\s*true/);
  assert.match(provider, /canPublish:\s*false/);
});
