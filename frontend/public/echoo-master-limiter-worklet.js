/* global AudioWorkletProcessor, registerProcessor, sampleRate */

class EchooMasterLimiter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ceiling = 10 ** (-1 / 20);
    this.lookaheadFrames = Math.max(1, Math.round(sampleRate * 0.005));
    this.releaseCoefficient = Math.exp(-1 / (sampleRate * 0.12));
    this.buffers = [];
    this.position = 0;
    this.gain = 1;
    this.holdFrames = 0;
  }

  ensureBuffers(channelCount) {
    while (this.buffers.length < channelCount) {
      this.buffers.push(new Float32Array(this.lookaheadFrames));
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.length || !output?.length) return true;

    const channelCount = Math.min(input.length, output.length);
    const frameCount = output[0].length;
    this.ensureBuffers(channelCount);

    for (let frame = 0; frame < frameCount; frame += 1) {
      let incomingPeak = 0;
      for (let channel = 0; channel < channelCount; channel += 1) {
        incomingPeak = Math.max(incomingPeak, Math.abs(input[channel][frame] || 0));
      }

      if (incomingPeak > this.ceiling) {
        this.gain = Math.min(this.gain, this.ceiling / incomingPeak);
        this.holdFrames = this.lookaheadFrames;
      } else if (this.holdFrames > 0) {
        this.holdFrames -= 1;
      } else {
        this.gain = 1 - ((1 - this.gain) * this.releaseCoefficient);
      }

      for (let channel = 0; channel < channelCount; channel += 1) {
        const buffer = this.buffers[channel];
        const delayed = buffer[this.position];
        buffer[this.position] = input[channel][frame] || 0;
        output[channel][frame] = delayed * this.gain;
      }

      for (let channel = channelCount; channel < output.length; channel += 1) {
        output[channel][frame] = 0;
      }
      this.position = (this.position + 1) % this.lookaheadFrames;
    }

    return true;
  }
}

registerProcessor('echoo-master-limiter', EchooMasterLimiter);
