import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Host fader keeps its meter pre-fader and writes the program gain node', async () => {
  const source = await readFile(new URL('./echooMixerService.js', import.meta.url), 'utf8');
  assert.match(source, /source\.connect\(analyser\);\s*analyser\.connect\(gainNode\);/);
  assert.match(source, /node\.gain\.value\s*=\s*channel\.muted\s*\?\s*0\s*:\s*channel\.gain/);
  assert.match(source, /export const setMixerChannelGainDb[\s\S]*?setMixerChannelGain\(channelId, dbToGain\(safeDb\)\);/);
});
