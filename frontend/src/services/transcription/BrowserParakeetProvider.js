import { detectTranscriptionCapabilities, getParakeetEnvConfig } from './capabilities.js';

const MAX_QUEUE = 8;
const TARGET_BATCH_SAMPLES = 32000; // 2 seconds at 16 kHz.

const concatFloat32 = (parts, length) => {
  const output = new Float32Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

export class BrowserParakeetProvider {
  constructor({ onStatus, onPartial, onFinal, onError, onMetrics } = {}) {
    this.callbacks = { onStatus, onPartial, onFinal, onError, onMetrics };
    this.worker = null;
    this.ready = false;
    this.queue = [];
    this.pendingParts = [];
    this.pendingSamples = 0;
    this.processing = false;
    this.requestId = 0;
    this.pendingInit = null;
    this.pendingFlush = null;
    this.offsetMs = 0;
    this.droppedChunks = 0;
    this.config = getParakeetEnvConfig();
    this.capabilities = null;
  }

  emit(name, payload) {
    try { this.callbacks[name]?.(payload); } catch { /* UI callbacks are isolated from STT */ }
  }

  async isSupported() {
    if (!this.config.enabled) return false;
    this.capabilities = await detectTranscriptionCapabilities();
    return Boolean(this.capabilities.parakeetSupported);
  }

  async initialize({ offsetMs = 0 } = {}) {
    this.offsetMs = Math.max(0, Number(offsetMs) || 0);
    if (!(await this.isSupported())) throw new Error('Browser Parakeet is not supported in this browser.');
    if (this.ready) return this.getState();
    if (this.pendingInit) return this.pendingInit.promise;

    this.emit('onStatus', { status: 'initializing', provider: 'parakeet' });
    this.worker = new Worker(new URL('../../workers/parakeet.worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event) => this.handleMessage(event.data || {});
    this.worker.onerror = (event) => {
      const error = new Error(event?.message || 'Parakeet worker crashed.');
      this.ready = false;
      this.emit('onStatus', { status: 'failed', provider: 'parakeet', message: error.message });
      this.emit('onError', error);
      this.pendingInit?.reject?.(error);
      this.pendingInit = null;
    };

    this.pendingInit = {};
    this.pendingInit.promise = new Promise((resolve, reject) => {
      this.pendingInit.resolve = resolve;
      this.pendingInit.reject = reject;
      this.pendingInit.timer = window.setTimeout(() => {
        if (!this.ready && this.pendingInit) {
          const error = new Error('Parakeet model preparation timed out.');
          this.pendingInit = null;
          reject(error);
        }
      }, 5 * 60 * 1000);
    });

    this.worker.postMessage({
      type: 'INIT',
      config: {
        model: this.config.model,
        backend: this.capabilities.preferredBackend,
        encoderQuant: this.config.encoderQuant,
        decoderQuant: this.config.decoderQuant,
        preprocessorBackend: this.config.preprocessorBackend,
      },
    });
    return this.pendingInit.promise;
  }

  handleMessage(message) {
    switch (message.type) {
      case 'STATUS':
        this.emit('onStatus', { provider: 'parakeet', ...message });
        break;
      case 'PROGRESS': {
        const total = Number(message.total) || 0;
        const loaded = Number(message.loaded) || 0;
        this.emit('onStatus', {
          status: 'loading',
          provider: 'parakeet',
          progress: total > 0 ? Math.min(1, loaded / total) : null,
        });
        break;
      }
      case 'READY':
        this.ready = true;
        if (this.pendingInit?.timer) window.clearTimeout(this.pendingInit.timer);
        this.pendingInit?.resolve?.(this.getState());
        this.pendingInit = null;
        this.emit('onStatus', { status: 'ready', provider: 'parakeet', backend: message.backend });
        this.drain();
        break;
      case 'PARTIAL':
        this.emit('onPartial', {
          provider: 'parakeet',
          text: message.text,
          endMs: this.offsetMs + Math.max(0, Number(message.endMs) || 0),
        });
        break;
      case 'FINAL':
        this.emit('onFinal', {
          provider: 'parakeet',
          model: this.config.model,
          providerSegmentId: `parakeet-${message.sequence}`,
          sequence: Math.max(0, Number(message.sequence) || 0),
          text: message.text,
          isFinal: true,
          startMs: this.offsetMs + Math.max(0, Number(message.startMs) || 0),
          endMs: this.offsetMs + Math.max(0, Number(message.endMs) || 0),
          confidence: Number.isFinite(Number(message.confidence)) ? Number(message.confidence) : null,
          language: 'en',
          sourceType: 'final_mix',
          sourceLabel: 'Echoo final mix',
        });
        break;
      case 'METRICS':
        this.emit('onMetrics', {
          provider: 'parakeet',
          processingMs: Number(message.processingMs) || 0,
          rtf: Number(message.rtf) || null,
          queuedChunks: this.queue.length,
          droppedChunks: this.droppedChunks,
        });
        break;
      case 'CHUNK_DONE':
        this.processing = false;
        this.drain();
        break;
      case 'FLUSHED':
        this.pendingFlush?.resolve?.();
        this.pendingFlush = null;
        break;
      case 'ERROR': {
        this.processing = false;
        const error = new Error(message.message || 'Parakeet transcription failed.');
        this.emit('onError', error);
        this.emit('onStatus', { status: 'degraded', provider: 'parakeet', message: error.message });
        this.drain();
        break;
      }
      default:
        break;
    }
  }

  enqueueChunk(chunk) {
    if (!chunk?.length) return;
    if (this.queue.length >= MAX_QUEUE) {
      this.queue.shift();
      this.droppedChunks += 1;
      this.emit('onStatus', {
        status: 'degraded', provider: 'parakeet', message: 'Local transcription is falling behind.',
      });
    }
    this.queue.push(chunk);
    this.drain();
  }

  pushAudio(audio) {
    if (!(audio instanceof Float32Array) || !audio.length) return;
    const copy = audio.slice();
    this.pendingParts.push(copy);
    this.pendingSamples += copy.length;
    if (this.pendingSamples < TARGET_BATCH_SAMPLES) return;
    const batch = concatFloat32(this.pendingParts, this.pendingSamples);
    this.pendingParts = [];
    this.pendingSamples = 0;
    this.enqueueChunk(batch);
  }

  drain() {
    if (!this.ready || this.processing || !this.worker || !this.queue.length) return;
    const chunk = this.queue.shift();
    this.processing = true;
    const requestId = ++this.requestId;
    this.worker.postMessage({ type: 'AUDIO_CHUNK', requestId, buffer: chunk.buffer }, [chunk.buffer]);
  }

  async flush() {
    if (!this.worker || !this.ready) return;
    if (this.pendingSamples) {
      const tail = concatFloat32(this.pendingParts, this.pendingSamples);
      this.pendingParts = [];
      this.pendingSamples = 0;
      this.enqueueChunk(tail);
    }
    const deadline = Date.now() + 10000;
    while ((this.processing || this.queue.length) && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
    if (this.pendingFlush) return this.pendingFlush.promise;
    this.pendingFlush = {};
    this.pendingFlush.promise = new Promise((resolve) => { this.pendingFlush.resolve = resolve; });
    this.worker.postMessage({ type: 'FLUSH' });
    await Promise.race([
      this.pendingFlush.promise,
      new Promise((resolve) => window.setTimeout(resolve, 3000)),
    ]);
  }

  async stop() {
    await this.flush().catch(() => null);
    this.worker?.postMessage({ type: 'STOP' });
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.queue = [];
    this.pendingParts = [];
    this.pendingSamples = 0;
    this.processing = false;
    this.emit('onStatus', { status: 'stopped', provider: 'parakeet' });
  }

  getState() {
    return {
      provider: 'parakeet',
      ready: this.ready,
      model: this.config.model,
      backend: this.capabilities?.preferredBackend || null,
      queuedChunks: this.queue.length,
      droppedChunks: this.droppedChunks,
    };
  }
}

export default BrowserParakeetProvider;
