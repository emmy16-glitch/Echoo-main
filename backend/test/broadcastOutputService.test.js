import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBroadcastOutputState,
  pcmFromWavChunk,
  startBroadcastOutputs,
  stopBroadcastOutputs,
} from '../src/services/broadcastOutputService.js';
import {
  getRealtimeAudioProfile,
  liveKitPublishOptionsFor,
  normalizeRealtimeAudioProfile,
} from '../../frontend/src/services/realtimeAudioQuality.js';

const pcmWav = ({ sampleRate = 48000, channels = 2, bitDepth = 24, dataBytes = 12 } = {}) => {
  const bytesPerSample = bitDepth / 8;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitDepth, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
};

test('secondary encoders accept only the canonical 48 kHz stereo 24-bit PCM chunks', () => {
  assert.equal(pcmFromWavChunk(pcmWav()).byteLength, 12);
  assert.throws(() => pcmFromWavChunk(pcmWav({ channels: 1, dataBytes: 9 })), /48 kHz stereo 24-bit/);
  assert.throws(() => pcmFromWavChunk(pcmWav({ sampleRate: 44100 })), /48 kHz stereo 24-bit/);
  assert.throws(() => pcmFromWavChunk(Buffer.from('not-a-wave')), /RIFF\/WAVE/);
});

test('the three publication profiles have explicit LiveKit transport options', () => {
  assert.equal(normalizeRealtimeAudioProfile(), 'broadcast_high');
  assert.deepEqual(liveKitPublishOptionsFor('broadcast_high'), {
    audioPreset: { maxBitrate: 256000 }, forceStereo: true, dtx: false, red: true,
  });
  assert.deepEqual(liveKitPublishOptionsFor('studio'), {
    audioPreset: { maxBitrate: 384000 }, forceStereo: true, dtx: false, red: true,
  });
  assert.deepEqual(liveKitPublishOptionsFor('studio_max'), {
    audioPreset: { maxBitrate: 510000 }, forceStereo: true, dtx: false, red: false,
  });
  assert.equal(getRealtimeAudioProfile('missing').id, 'broadcast_high');
});

test('disabled optional outputs remain idle and never represent a live encoder', async () => {
  const previousArchive = process.env.MASTER_ARCHIVE_ENABLED;
  const previousRadio = process.env.RADIO_STREAM_ENABLED;
  process.env.MASTER_ARCHIVE_ENABLED = 'false';
  process.env.RADIO_STREAM_ENABLED = 'false';
  const warn = console.warn;
  console.warn = () => {};
  try {
    const result = await startBroadcastOutputs('test-disabled-output');
    assert.equal(result.radioOutput.status, 'idle');
    assert.equal(result.masterRecording.status, 'idle');
    assert.equal(getBroadcastOutputState('test-disabled-output')?.radioOutput.status, 'idle');
  } finally {
    await stopBroadcastOutputs('test-disabled-output');
    console.warn = warn;
    process.env.MASTER_ARCHIVE_ENABLED = previousArchive;
    process.env.RADIO_STREAM_ENABLED = previousRadio;
  }
});
