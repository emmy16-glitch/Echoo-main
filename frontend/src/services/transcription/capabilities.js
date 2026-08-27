export const detectTranscriptionCapabilities = async () => {
  const hasWindow = typeof window !== 'undefined';
  const hasNavigator = typeof navigator !== 'undefined';
  const AudioContextClass = hasWindow ? (window.AudioContext || window.webkitAudioContext) : null;

  const capabilities = {
    worker: typeof Worker !== 'undefined',
    wasm: typeof WebAssembly !== 'undefined',
    webgpu: Boolean(hasNavigator && navigator.gpu),
    audioWorklet: Boolean(AudioContextClass && typeof AudioWorkletNode !== 'undefined'),
    storage: Boolean(hasNavigator && navigator.storage),
    storageEstimate: null,
    persistentStorage: null,
  };

  if (capabilities.storage) {
    try {
      capabilities.storageEstimate = await navigator.storage.estimate();
    } catch {
      capabilities.storageEstimate = null;
    }
    try {
      capabilities.persistentStorage = await navigator.storage.persist();
    } catch {
      capabilities.persistentStorage = false;
    }
  }

  capabilities.parakeetSupported = capabilities.worker && capabilities.wasm && capabilities.audioWorklet;
  capabilities.preferredBackend = capabilities.webgpu ? 'webgpu' : 'wasm';
  return capabilities;
};

export const getParakeetEnvConfig = () => ({
  enabled: import.meta.env.VITE_PARAKEET_ENABLED !== 'false',
  model: String(import.meta.env.VITE_PARAKEET_MODEL || 'parakeet-tdt-0.6b-v3').trim(),
  modelSource: String(import.meta.env.VITE_PARAKEET_MODEL_SOURCE || 'hub').trim(),
  encoderQuant: String(import.meta.env.VITE_PARAKEET_ENCODER_QUANT || 'fp32').trim(),
  decoderQuant: String(import.meta.env.VITE_PARAKEET_DECODER_QUANT || 'int8').trim(),
  preprocessorBackend: String(import.meta.env.VITE_PARAKEET_PREPROCESSOR || 'js').trim(),
});
