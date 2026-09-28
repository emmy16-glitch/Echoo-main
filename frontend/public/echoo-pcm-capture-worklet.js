/* global AudioWorkletProcessor, registerProcessor */

// Capture in moderately sized blocks and recycle the transferred ArrayBuffers.
// The old recorder allocated/copied a new block every ~85 ms at 48 kHz.
// Reusing two or three buffers avoids garbage-collection bursts on the
// AudioWorklet rendering thread, which can otherwise surface as tiny live-audio
// dropouts while the same graph is also feeding WebRTC.
const CHUNK_FRAMES = 16384;
const CHANNELS = 2;
const CHUNK_SAMPLES = CHUNK_FRAMES * CHANNELS;
const CHUNK_BYTES = CHUNK_SAMPLES * Float32Array.BYTES_PER_ELEMENT;

class EchooPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameOffset = 0;
    this.freeBuffers = [];
    this.interleaved = new Float32Array(CHUNK_SAMPLES);
    this.stopped = false;

    this.port.onmessage = (event) => {
      const message = event?.data || {};

      if (message.type === 'recycle' && message.buffer instanceof ArrayBuffer) {
        if (!this.stopped && message.buffer.byteLength === CHUNK_BYTES) {
          this.freeBuffers.push(new Float32Array(message.buffer));
        }
        return;
      }

      if (message.type !== 'stop' || this.stopped) return;
      this.flush();
      this.stopped = true;
      this.freeBuffers = [];
      this.port.postMessage({ type: 'stopped' });
    };
  }

  takeBuffer() {
    return this.freeBuffers.pop() || new Float32Array(CHUNK_SAMPLES);
  }

  flush() {
    if (!this.frameOffset) return;

    const samples = this.interleaved;
    const sampleCount = this.frameOffset * CHANNELS;
    this.interleaved = this.takeBuffer();
    this.frameOffset = 0;

    this.port.postMessage(
      { type: 'pcm', buffer: samples.buffer, sampleCount },
      [samples.buffer]
    );
  }

  process(inputs, outputs) {
    if (this.stopped) return false;

    const input = inputs?.[0];
    if (!input?.length || !input[0]?.length) return true;

    const left = input[0];
    const hasRightChannel = Boolean(input[1]);
    const right = hasRightChannel ? input[1] : left;
    const output = outputs?.[0];

    if (output?.[0]) output[0].set(left);
    if (output?.[1]) output[1].set(right);

    for (let frame = 0; frame < left.length; frame += 1) {
      const index = this.frameOffset * CHANNELS;
      const leftSample = Number.isFinite(left[frame]) ? left[frame] : 0;
      // A real stereo right-channel sample of exactly 0 is intentional
      // silence and must stay 0.
      const rightSample = hasRightChannel
        ? (Number.isFinite(right[frame]) ? right[frame] : 0)
        : leftSample;
      this.interleaved[index] = leftSample;
      this.interleaved[index + 1] = rightSample;
      this.frameOffset += 1;

      if (this.frameOffset >= CHUNK_FRAMES) this.flush();
    }

    return true;
  }
}

registerProcessor('echoo-pcm-capture', EchooPcmCaptureProcessor);
