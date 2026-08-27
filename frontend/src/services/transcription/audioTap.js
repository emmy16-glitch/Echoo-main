const TARGET_SAMPLE_RATE = 16000;
const OUTPUT_CHUNK_SAMPLES = 1600; // 100 ms; also valid for Gemini realtime input.

const createWorkletModule = async (context) => {
  const source = `
    class EchooSttTap extends AudioWorkletProcessor {
      constructor() {
        super();
        this.ratio = sampleRate / ${TARGET_SAMPLE_RATE};
        this.phase = 0;
        this.sum = 0;
        this.count = 0;
        this.pending = [];
      }
      process(inputs) {
        const channels = inputs[0] || [];
        if (!channels.length) return true;
        const frames = channels[0].length;
        for (let i = 0; i < frames; i += 1) {
          let mixed = 0;
          for (let channel = 0; channel < channels.length; channel += 1) {
            mixed += channels[channel][i] || 0;
          }
          mixed /= Math.max(1, channels.length);
          this.sum += mixed;
          this.count += 1;
          this.phase += 1;
          if (this.phase >= this.ratio) {
            this.pending.push(Math.max(-1, Math.min(1, this.sum / Math.max(1, this.count))));
            this.phase -= this.ratio;
            this.sum = 0;
            this.count = 0;
          }
        }
        while (this.pending.length >= ${OUTPUT_CHUNK_SAMPLES}) {
          const output = new Float32Array(this.pending.splice(0, ${OUTPUT_CHUNK_SAMPLES}));
          this.port.postMessage(output.buffer, [output.buffer]);
        }
        return true;
      }
    }
    registerProcessor('echoo-stt-tap', EchooSttTap);
  `;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const createTranscriptionAudioTap = async ({ mediaTrack, onAudio }) => {
  if (!mediaTrack || mediaTrack.kind !== 'audio' || mediaTrack.readyState === 'ended') {
    throw new Error('Transcription requires the active Echoo post-master audio track.');
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || typeof AudioWorkletNode === 'undefined') {
    throw new Error('AudioWorklet is required for live transcription.');
  }

  const context = new AudioContextClass({ latencyHint: 'interactive' });
  await createWorkletModule(context);
  const track = mediaTrack.clone();
  const source = context.createMediaStreamSource(new MediaStream([track]));
  const processor = new AudioWorkletNode(context, 'echoo-stt-tap', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  const silentGain = context.createGain();
  silentGain.gain.value = 0;
  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(context.destination);
  processor.port.onmessage = (event) => {
    if (!(event.data instanceof ArrayBuffer)) return;
    const audio = new Float32Array(event.data);
    if (audio.length) onAudio?.(audio);
  };
  await context.resume();

  let stopped = false;
  return {
    sampleRate: TARGET_SAMPLE_RATE,
    sourceSampleRate: context.sampleRate,
    async stop() {
      if (stopped) return;
      stopped = true;
      processor.port.onmessage = null;
      try { source.disconnect(); } catch { /* already disconnected */ }
      try { processor.disconnect(); } catch { /* already disconnected */ }
      try { silentGain.disconnect(); } catch { /* already disconnected */ }
      try { track.stop(); } catch { /* already stopped */ }
      try { await context.close(); } catch { /* already closed */ }
    },
  };
};

export default createTranscriptionAudioTap;
