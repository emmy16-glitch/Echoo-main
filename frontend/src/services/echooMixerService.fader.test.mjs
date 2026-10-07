import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Host fader keeps its meter pre-fader and writes the program gain node', async () => {
  const source = await readFile(new URL('./echooMixerService.js', import.meta.url), 'utf8');
  assert.match(source, /source\.connect\(analyser\);\s*analyser\.connect\(gainNode\);/);
  assert.match(source, /analyser\.connect\(channelSplitter\);\s*channelSplitter\.connect\(leftAnalyser, 0\);\s*channelSplitter\.connect\(rightAnalyser, 1\);/);
  assert.match(source, /const right = sourceState\?\.isMono \? left : measuredRight;/);
  assert.match(source, /node\.gain\.value\s*=\s*channel\.muted\s*\?\s*0\s*:\s*channel\.gain/);
  assert.match(source, /export const setMixerChannelGainDb[\s\S]*?setMixerChannelGain\(channelId, dbToGain\(safeDb\)\);/);
});

test('microphone failures provide actionable recovery guidance', async () => {
  const source = await readFile(new URL('./echooMixerService.js', import.meta.url), 'utf8');
  assert.match(source, /export const describeMicrophoneAccessError/);
  assert.match(source, /Windows Settings > Privacy & security > Microphone/);
  assert.match(source, /Windows reports microphone access is allowed, but Echoo/);
  assert.match(source, /No microphone was found/);
  assert.match(source, /This microphone is busy or unavailable/);
  assert.match(source, /await requestMicrophone\(constraints\)/);
});
