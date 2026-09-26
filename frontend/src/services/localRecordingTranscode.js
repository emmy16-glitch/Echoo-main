const WAV_HEADER_SCAN_BYTES = 64 * 1024;
const LOCAL_MP3_READ_SECONDS = 5;
const LOCAL_MP3_TEMP_DIRECTORY = 'echoo-local-mp3-exports';
export const DEFAULT_LOCAL_MP3_BITRATE_KBPS = 320;

const ascii = (bytes, offset, length) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

const abortError = () => {
  const error = new Error('Local recording export was cancelled.');
  error.name = 'AbortError';
  return error;
};

const assertNotAborted = (signal) => {
  if (signal?.aborted) throw abortError();
};

const yieldToUi = () =>
  new Promise((resolve) => setTimeout(resolve, 0));


const supportsOpfs = () =>
  typeof navigator !== 'undefined' &&
  typeof navigator.storage?.getDirectory === 'function';

const openTemporaryMp3Sink = async () => {
  if (!supportsOpfs()) return null;

  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(
    LOCAL_MP3_TEMP_DIRECTORY,
    { create: true }
  );
  const randomPart =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const filename = `echoo-local-${randomPart}.mp3`;
  const fileHandle = await directory.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();

  return {
    directory,
    filename,
    fileHandle,
    writable,
    closed: false,
    async close() {
      if (this.closed) return;
      await this.writable.close();
      this.closed = true;
    },
    async abort() {
      if (!this.closed) {
        try { await this.writable.abort?.(); } catch { /* best effort */ }
        try { await this.writable.close?.(); } catch { /* best effort */ }
        this.closed = true;
      }
      try { await this.directory.removeEntry(this.filename); } catch { /* best effort */ }
    },
    async file() {
      await this.close();
      return this.fileHandle.getFile();
    },
    async dispose() {
      try { await this.directory.removeEntry(this.filename); } catch { /* best effort */ }
    },
  };
};

export const parsePcmWavHeader = async (blob) => {
  if (!blob?.size) throw new Error('The local WAV master is empty.');

  const headerBytes = new Uint8Array(
    await blob.slice(0, Math.min(blob.size, WAV_HEADER_SCAN_BYTES)).arrayBuffer()
  );
  if (
    headerBytes.length < 44 ||
    ascii(headerBytes, 0, 4) !== 'RIFF' ||
    ascii(headerBytes, 8, 4) !== 'WAVE'
  ) {
    throw new Error('The local recording is not a valid RIFF/WAV file.');
  }

  const view = new DataView(
    headerBytes.buffer,
    headerBytes.byteOffset,
    headerBytes.byteLength
  );

  let cursor = 12;
  let format = null;
  let data = null;

  while (cursor + 8 <= headerBytes.length) {
    const id = ascii(headerBytes, cursor, 4);
    const size = view.getUint32(cursor + 4, true);
    const payloadOffset = cursor + 8;

    if (id === 'fmt ' && payloadOffset + Math.min(size, 16) <= headerBytes.length) {
      if (size < 16) throw new Error('The WAV format block is incomplete.');
      format = {
        audioFormat: view.getUint16(payloadOffset, true),
        channels: view.getUint16(payloadOffset + 2, true),
        sampleRate: view.getUint32(payloadOffset + 4, true),
        byteRate: view.getUint32(payloadOffset + 8, true),
        blockAlign: view.getUint16(payloadOffset + 12, true),
        bitDepth: view.getUint16(payloadOffset + 14, true),
      };
    } else if (id === 'data') {
      data = {
        offset: payloadOffset,
        declaredBytes: size,
      };
      break;
    }

    const paddedSize = size + (size % 2);
    cursor = payloadOffset + paddedSize;
    if (cursor > headerBytes.length && cursor < blob.size) {
      throw new Error('The WAV header is too large for local MP3 conversion.');
    }
  }

  if (!format || !data) {
    throw new Error('The WAV master is missing its PCM format or data block.');
  }
  if (format.audioFormat !== 1) {
    throw new Error('Only uncompressed PCM WAV masters can be converted locally to MP3.');
  }
  if (![1, 2].includes(format.channels)) {
    throw new Error('Local MP3 conversion supports mono or stereo WAV masters.');
  }
  if (![16, 24, 32].includes(format.bitDepth)) {
    throw new Error('Local MP3 conversion supports 16-bit, 24-bit, or 32-bit PCM WAV.');
  }
  if (!Number.isFinite(format.sampleRate) || format.sampleRate < 8000 || format.sampleRate > 192000) {
    throw new Error('The WAV sample rate is invalid.');
  }

  const bytesPerSample = format.bitDepth / 8;
  const expectedBlockAlign = format.channels * bytesPerSample;
  if (format.blockAlign !== expectedBlockAlign) {
    throw new Error('The WAV channel layout is inconsistent.');
  }

  const availableBytes = Math.max(0, blob.size - data.offset);
  const dataBytes = Math.min(
    availableBytes,
    data.declaredBytes || availableBytes
  );
  const alignedDataBytes = dataBytes - (dataBytes % format.blockAlign);
  if (!alignedDataBytes) throw new Error('The WAV master contains no PCM audio.');

  return {
    ...format,
    dataOffset: data.offset,
    dataBytes: alignedDataBytes,
    bytesPerSample,
    bytesPerFrame: format.blockAlign,
    frameCount: alignedDataBytes / format.blockAlign,
  };
};

const pcmSampleToFloat = (bytes, view, offset, bitDepth) => {
  if (bitDepth === 16) {
    return Math.max(-1, Math.min(1, view.getInt16(offset, true) / 32768));
  }
  if (bitDepth === 24) {
    let value =
      bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16);
    if (value & 0x800000) value |= 0xff000000;
    return Math.max(-1, Math.min(1, value / 8388608));
  }
  return Math.max(-1, Math.min(1, view.getInt32(offset, true) / 2147483648));
};

export const pcmWavChunkToFloatChannels = (bytes, wav) => {
  const frameCount = Math.floor(bytes.byteLength / wav.bytesPerFrame);
  const channels = Array.from(
    { length: wav.channels },
    () => new Float32Array(frameCount)
  );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const frameOffset = frame * wav.bytesPerFrame;
    for (let channel = 0; channel < wav.channels; channel += 1) {
      const sampleOffset = frameOffset + channel * wav.bytesPerSample;
      channels[channel][frame] = pcmSampleToFloat(
        bytes,
        view,
        sampleOffset,
        wav.bitDepth
      );
    }
  }

  return channels;
};

export const encodeLocalWavToMp3 = async ({
  blob,
  bitrateKbps = DEFAULT_LOCAL_MP3_BITRATE_KBPS,
  onChunk = null,
  onProgress = null,
  signal = null,
} = {}) => {
  assertNotAborted(signal);
  const wav = await parsePcmWavHeader(blob);
  const bitrate = Number(bitrateKbps);
  const allowedBitrates = new Set([
    64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
  ]);
  const safeBitrate = allowedBitrates.has(bitrate)
    ? bitrate
    : DEFAULT_LOCAL_MP3_BITRATE_KBPS;

  const { default: createMp3Encoder } = await import('@audio/encode-mp3');
  assertNotAborted(signal);
  const encoder = await createMp3Encoder({
    sampleRate: wav.sampleRate,
    channels: wav.channels,
    bitrate: safeBitrate,
  });

  const collected = [];
  const temporarySink = onChunk
    ? null
    : await openTemporaryMp3Sink().catch(() => null);
  let encodedBytes = 0;
  const emitChunk = async (value) => {
    if (!value?.byteLength) return;
    // @audio/encode-mp3 returns a view backed by WASM memory. Copy it before
    // awaiting any filesystem write so a later encoder call cannot mutate it.
    const chunk = new Uint8Array(value);
    encodedBytes += chunk.byteLength;
    if (onChunk) await onChunk(chunk);
    else if (temporarySink) await temporarySink.writable.write(chunk);
    else collected.push(chunk);
  };

  const framesPerRead = Math.max(
    1152,
    Math.round(wav.sampleRate * LOCAL_MP3_READ_SECONDS)
  );
  const bytesPerRead = framesPerRead * wav.bytesPerFrame;
  let consumed = 0;

  try {
    while (consumed < wav.dataBytes) {
      assertNotAborted(signal);
      const take = Math.min(bytesPerRead, wav.dataBytes - consumed);
      const alignedTake = take - (take % wav.bytesPerFrame);
      if (!alignedTake) break;

      const start = wav.dataOffset + consumed;
      const bytes = new Uint8Array(
        await blob.slice(start, start + alignedTake).arrayBuffer()
      );
      const channels = pcmWavChunkToFloatChannels(bytes, wav);
      await emitChunk(encoder.encode(channels));

      consumed += alignedTake;
      onProgress?.({
        processedBytes: consumed,
        totalBytes: wav.dataBytes,
        percent: Math.min(100, Math.round((consumed / wav.dataBytes) * 100)),
      });
      await yieldToUi();
    }

    assertNotAborted(signal);
    await emitChunk(encoder.flush());
  } catch (error) {
    await temporarySink?.abort?.();
    throw error;
  } finally {
    encoder.free?.();
  }

  let outputBlob = null;
  let dispose = null;
  let storageMode = onChunk ? 'external-stream' : 'memory';

  if (!onChunk && temporarySink) {
    outputBlob = await temporarySink.file();
    storageMode = 'opfs-temp';
    dispose = () => temporarySink.dispose();
  } else if (!onChunk) {
    outputBlob = new Blob(collected, { type: 'audio/mpeg' });
  }

  return {
    blob: outputBlob,
    mimeType: 'audio/mpeg',
    format: 'mp3',
    bitrateKbps: safeBitrate,
    encodedBytes,
    storageMode,
    dispose,
    sourceFormat: 'pcm-wav',
    sourceSampleRate: wav.sampleRate,
    sourceChannels: wav.channels,
  };
};

export default {
  DEFAULT_LOCAL_MP3_BITRATE_KBPS,
  parsePcmWavHeader,
  pcmWavChunkToFloatChannels,
  encodeLocalWavToMp3,
};
