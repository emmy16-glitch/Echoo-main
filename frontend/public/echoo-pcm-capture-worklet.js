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
    const right = input[1] || left;
    const output = outputs?.[0];

    if (output?.[0]) output[0].set(left);
    if (output?.[1]) output[1].set(right);

    for (let frame = 0; frame < left.length; frame += 1) {
      const index = this.frameOffset * 2;
      this.interleaved[index] = left[frame] || 0;
      this.interleaved[index + 1] = right[frame] || left[frame] || 0;
      this.frameOffset += 1;

      if (this.frameOffset >= CHUNK_FRAMES) this.flush();
    }

    return true;
  }
}

registerProcessor('echoo-pcm-capture', EchooPcmCaptureProcessor);
