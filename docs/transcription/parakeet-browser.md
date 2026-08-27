# Browser Parakeet

ECHOO uses `parakeet.js` 1.4.4 with `parakeet-tdt-0.6b-v3` as the primary live transcription provider for eligible Creator Studio browsers.

## Loading and cache

Creators do not manually download a model or install Python/NVIDIA software. When the Creator Studio publishing bundle becomes idle, ECHOO begins preparing Parakeet. `parakeet.js` handles its remote model retrieval and browser cache. ECHOO also requests persistent browser storage when available. Listener routes do not intentionally preload Parakeet.

Configuration defaults:

```env
VITE_PARAKEET_ENABLED=true
VITE_PARAKEET_MODEL=parakeet-tdt-0.6b-v3
VITE_PARAKEET_MODEL_SOURCE=hub
VITE_PARAKEET_ENCODER_QUANT=fp32
VITE_PARAKEET_DECODER_QUANT=int8
VITE_PARAKEET_PREPROCESSOR=js
```

The exact first-load transfer size is deliberately not hard-coded because it depends on the selected artifacts and quantization. Measure it from a clean browser profile using DevTools Network/Application storage.

## Runtime

Inference runs in `parakeet.worker.js`, not the React main thread. The verified 1.4.4 streaming contract is:

```text
fromHub(...)
  -> createStreamingTranscriber(...)
  -> processChunk(Float32Array)
  -> finalize()
```

ECHOO prefers WebGPU and falls back to WASM if WebGPU model initialization fails. No global COOP/COEP headers are introduced, because doing so without auditing every external LiveKit/media/auth resource could break the app.

The audio tap clones the exact post-master MediaStreamTrack sent to LiveKit and converts it to mono 16 kHz Float32. One-hundred-millisecond audio frames are batched into roughly two-second inference chunks. Queue size is bounded; if inference falls behind, old STT work can be dropped without affecting the mixer or LiveKit.

## Manual verification

Use a Chromium browser with WebGPU enabled. Open Creator Studio, allow the model to become ready, go live, speak, and confirm final segments arrive in transcript review. Reload Creator Studio and verify the model is served from browser storage/cache rather than requiring a manual installation or a complete first-load transfer again.
