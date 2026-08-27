let model = null;
let transcriber = null;
let backend = null;
let initialized = false;
let chain = Promise.resolve();
let emittedText = '';
let lastEndMs = 0;
let sequence = 0;

const post = (type, payload = {}) => globalThis.postMessage({ type, ...payload });

const asConfidence = (result) => {
  const value = Number(result?.confidence_scores?.word_avg ?? result?.confidence_scores?.token_avg);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
};

const init = async (config) => {
  post('STATUS', { status: 'loading' });
  const { fromHub } = await import('parakeet.js');
  const requestedBackend = config.backend === 'webgpu' ? 'webgpu' : 'wasm';
  const options = {
    backend: requestedBackend,
    encoderQuant: config.encoderQuant || 'fp32',
    decoderQuant: config.decoderQuant || 'int8',
    preprocessorBackend: config.preprocessorBackend || 'js',
    enableProfiling: true,
    progress: ({ loaded, total, file }) => {
      post('PROGRESS', { loaded: Number(loaded) || 0, total: Number(total) || 0, file: String(file || '') });
    },
  };

  try {
    model = await fromHub(config.model || 'parakeet-tdt-0.6b-v3', options);
    backend = requestedBackend;
  } catch (error) {
    if (requestedBackend !== 'webgpu') throw error;
    post('STATUS', { status: 'loading', detail: 'WebGPU unavailable; using WASM fallback.' });
    model = await fromHub(config.model || 'parakeet-tdt-0.6b-v3', { ...options, backend: 'wasm' });
    backend = 'wasm';
  }

  transcriber = model.createStreamingTranscriber({
    sampleRate: 16000,
    returnTimestamps: true,
    returnConfidences: true,
  });
  initialized = true;
  emittedText = '';
  lastEndMs = 0;
  sequence = 0;
  post('READY', { backend });
};

const processAudio = async ({ buffer, requestId }) => {
  if (!initialized || !transcriber) throw new Error('Parakeet worker is not initialized.');
  const audio = new Float32Array(buffer);
  const started = performance.now();
  const result = await transcriber.processChunk(audio);
  const processingMs = performance.now() - started;
  const fullText = String(result?.text || '').trim();
  const chunkText = String(result?.chunkText || '').trim();
  const words = Array.isArray(result?.chunkWords) ? result.chunkWords : [];
  const startMs = words.length
    ? Math.max(0, Math.round(Number(words[0]?.start_time || 0) * 1000))
    : lastEndMs;
  const endMs = words.length
    ? Math.max(startMs, Math.round(Number(words[words.length - 1]?.end_time || result?.totalDuration || 0) * 1000))
    : Math.max(startMs, Math.round(Number(result?.totalDuration || 0) * 1000));

  if (fullText) post('PARTIAL', { text: fullText, requestId, endMs });
  if (chunkText) {
    lastEndMs = Math.max(lastEndMs, endMs);
    emittedText = [emittedText, chunkText].filter(Boolean).join(' ').trim();
    post('FINAL', {
      text: chunkText,
      requestId,
      sequence: sequence++,
      startMs,
      endMs: lastEndMs,
      confidence: asConfidence(result),
      words,
    });
  }
  post('METRICS', {
    requestId,
    processingMs,
    rtf: Number(result?.metrics?.rtf) || null,
    totalDuration: Number(result?.totalDuration) || 0,
  });
  post('CHUNK_DONE', { requestId });
};

const flush = async () => {
  if (!transcriber) return;
  const final = transcriber.finalize();
  const text = String(final?.text || '').trim();
  let remainder = text;
  if (emittedText && text.toLowerCase().startsWith(emittedText.toLowerCase())) {
    remainder = text.slice(emittedText.length).trim();
  }
  if (remainder) {
    const words = Array.isArray(final?.words) ? final.words : [];
    const endMs = Math.max(lastEndMs, Math.round(Number(final?.totalDuration || 0) * 1000));
    post('FINAL', {
      text: remainder,
      sequence: sequence++,
      startMs: lastEndMs,
      endMs,
      confidence: null,
      words,
    });
    lastEndMs = endMs;
  }
  post('FLUSHED');
};

globalThis.onmessage = (event) => {
  const message = event.data || {};
  chain = chain.then(async () => {
    switch (message.type) {
      case 'INIT':
        await init(message.config || {});
        break;
      case 'AUDIO_CHUNK':
        await processAudio(message);
        break;
      case 'FLUSH':
        await flush();
        break;
      case 'RESET':
        transcriber?.reset?.();
        emittedText = '';
        lastEndMs = 0;
        sequence = 0;
        post('RESET');
        break;
      case 'STOP':
        transcriber?.reset?.();
        model?.clearIncrementalCache?.();
        post('STOPPED');
        break;
      default:
        break;
    }
  }).catch((error) => {
    post('ERROR', {
      requestId: message.requestId,
      message: error?.message || String(error),
    });
    if (message.type === 'AUDIO_CHUNK') post('CHUNK_DONE', { requestId: message.requestId });
  });
};
