import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parsePcmWavHeader,
  pcmWavChunkToFloatChannels,
} from '../../frontend/src/services/localRecordingTranscode.js';

const writeInt24LE = (bytes, offset, value) => {
  const encoded = value < 0 ? value + 0x1000000 : value;
  bytes[offset] = encoded & 0xff;
  bytes[offset + 1] = (encoded >>> 8) & 0xff;
  bytes[offset + 2] = (encoded >>> 16) & 0xff;
};

const pcm24StereoWav = () => {
  const sampleRate = 48000;
  const channels = 2;
  const bitDepth = 24;
  const bytesPerSample = 3;
  const blockAlign = channels * bytesPerSample;
  const frames = [
    [-8388608, 8388607],
    [0, -4194304],
  ];
  const dataBytes = frames.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  bytes.set(new TextEncoder().encode('RIFF'), 0);
  view.setUint32(4, 36 + dataBytes, true);
  bytes.set(new TextEncoder().encode('WAVE'), 8);
  bytes.set(new TextEncoder().encode('fmt '), 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  bytes.set(new TextEncoder().encode('data'), 36);
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (const frame of frames) {
    for (const sample of frame) {
      writeInt24LE(bytes, offset, sample);
      offset += 3;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
};

test('local MP3 source parser accepts Echoo 48 kHz stereo 24-bit PCM WAV', async () => {
  const blob = pcm24StereoWav();
  const wav = await parsePcmWavHeader(blob);

  assert.equal(wav.audioFormat, 1);
  assert.equal(wav.sampleRate, 48000);
  assert.equal(wav.channels, 2);
  assert.equal(wav.bitDepth, 24);
  assert.equal(wav.bytesPerFrame, 6);
  assert.equal(wav.frameCount, 2);
  assert.equal(wav.dataOffset, 44);
  assert.equal(wav.dataBytes, 12);
});

test('24-bit PCM conversion preserves sign and stereo channel ordering', async () => {
  const blob = pcm24StereoWav();
  const wav = await parsePcmWavHeader(blob);
  const bytes = new Uint8Array(
    await blob.slice(wav.dataOffset, wav.dataOffset + wav.dataBytes).arrayBuffer()
  );
  const channels = pcmWavChunkToFloatChannels(bytes, wav);

  assert.equal(channels.length, 2);
  assert.equal(channels[0].length, 2);
  assert.equal(channels[0][0], -1);
  assert.ok(channels[1][0] > 0.999999);
  assert.equal(channels[0][1], 0);
  assert.equal(channels[1][1], -0.5);
});

test('WAV parser rejects renamed or unsupported audio', async () => {
  await assert.rejects(
    parsePcmWavHeader(new Blob([new TextEncoder().encode('not a wav')], { type: 'audio/wav' })),
    /valid RIFF\/WAV/
  );
});
