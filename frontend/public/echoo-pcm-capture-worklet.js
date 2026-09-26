/* global AudioWorkletProcessor, registerProcessor */

const CHUNK_FRAMES = 4096;

class EchooPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameOffset = 0;
    this.interleaved = new Float32Array(CHUNK_FRAMES * 2);
    this.stopped = false;

    this.port.onmessage = (event) => {
      if (event?.data?.type !== 'stop' || this.stopped) return;
      this.flush();
      this.stopped = true;
      this.port.postMessage({ type: 'stopped' });
    };
  }

  flush() {
    if (!this.frameOffset) return;

    const samples = this.interleaved.slice(0, this.frameOffset * 2);
    this.frameOffset = 0;
    this.port.postMessage(
      { type: 'pcm', buffer: samples.buffer },
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
      const index = this.frameOffset * 2;
      const leftSample = Number.isFinite(left[frame]) ? left[frame] : 0;
      // A real stereo right-channel sample of exactly 0 is intentional
      // silence and must stay 0. Falling back with `right || left` mirrors
      // the left channel into hard-panned/silent-right material and corrupts
      // the OPFS recovery master even though the live LiveKit mix is correct.
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
