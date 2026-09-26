import test from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeLocalWavToMp3,
  parsePcmWavHeader,
} from './localRecordingTranscode.js';

const makeStereoPcm24Wav = ({
  sampleRate = 48000,
  seconds = 0.25,
} = {}) => {
  const frames = Math.max(1, Math.round(sampleRate * seconds));
  const channels = 2;
  const bitDepth = 24;
  const bytesPerSample = 3;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const writeAscii = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  };
  const writeInt24 = (offset, sample) => {
    const clamped = Math.max(-8388608, Math.min(8388607, sample));
    const encoded = clamped < 0 ? clamped + 0x1000000 : clamped;
    bytes[offset] = encoded & 0xff;
    bytes[offset + 1] = (encoded >>> 8) & 0xff;
    bytes[offset + 2] = (encoded >>> 16) & 0xff;
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    const t = frame / sampleRate;
    const left = Math.round(Math.sin(2 * Math.PI * 440 * t) * 0x5fffff);
    const right = Math.round(Math.sin(2 * Math.PI * 660 * t) * 0x5fffff);
    writeInt24(offset, left);
    writeInt24(offset + 3, right);
    offset += blockAlign;
  }

  return new Blob([buffer], { type: 'audio/wav' });
};

test('real WASM encoder converts Echoo 48 kHz stereo 24-bit WAV to MP3 bytes', async () => {
  const wav = makeStereoPcm24Wav();
  const header = await parsePcmWavHeader(wav);

  assert.equal(header.sampleRate, 48000);
  assert.equal(header.channels, 2);
  assert.equal(header.bitDepth, 24);

  const result = await encodeLocalWavToMp3({
    blob: wav,
    bitrateKbps: 320,
  });

  assert.equal(result.format, 'mp3');
  assert.equal(result.mimeType, 'audio/mpeg');
  assert.equal(result.bitrateKbps, 320);
  assert.ok(result.encodedBytes > 1000);
  assert.ok(result.blob?.size > 1000);

  const head = new Uint8Array(await result.blob.slice(0, 4).arrayBuffer());
  const id3 = head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33;
  const frameSync = head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
  assert.ok(id3 || frameSync, 'encoded output must contain a real MP3 header/frame');
  assert.notEqual(String.fromCharCode(...head), 'RIFF');

  await result.dispose?.();
});
