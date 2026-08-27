import transcriptService from '../transcriptService.js';
import {
  startWhisperFlowTranscription,
  stopWhisperFlowTranscription,
} from '../whisperFlowService.js';
import BrowserParakeetProvider from './BrowserParakeetProvider.js';
import GeminiLiveProvider from './GeminiLiveProvider.js';
import TranscriptUploadQueue from './uploadQueue.js';
import { createTranscriptionAudioTap } from './audioTap.js';

let activeOrchestrator = null;
let preloadedParakeet = null;
let preloadPromise = null;

const emitWindowState = (detail) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('echoo:transcription-state', { detail }));
  }
};

const statusLabel = (status, provider) => {
  if (status === 'ready' || status === 'live') return 'Live transcription ready';
  if (status === 'initializing' || status === 'loading') return 'Preparing transcription…';
  if (provider === 'gemini-live') return 'Using cloud transcription fallback';
  if (provider === 'whisper-flow') return 'Using transcription fallback';
  if (status === 'unavailable' || status === 'failed') return 'Transcription unavailable — broadcast will continue';
  return 'Preparing transcription…';
};

export const preloadCreatorTranscription = async () => {
  if (import.meta.env.VITE_PARAKEET_ENABLED === 'false') return { ready: false, disabled: true };
  if (preloadedParakeet?.ready) return preloadedParakeet.getState();
  if (preloadPromise) return preloadPromise;
  const provider = new BrowserParakeetProvider({
    onStatus: (state) => emitWindowState({ ...state, label: statusLabel(state.status, 'parakeet'), preload: true }),
  });
  preloadedParakeet = provider;
  preloadPromise = provider.initialize({ offsetMs: 0 })
    .catch((error) => {
      emitWindowState({
        status: 'degraded', provider: 'parakeet', preload: true,
        label: 'Local transcription will use a fallback when you go live.',
        message: error?.message || String(error),
      });
      return { ready: false, error: error?.message || String(error) };
    })
    .finally(() => { preloadPromise = null; });
  return preloadPromise;
};

class TranscriptionOrchestrator {
  constructor({ broadcastId, mediaTrack }) {
    this.broadcastId = String(broadcastId || '');
    this.mediaTrack = mediaTrack;
    this.provider = null;
    this.providerName = null;
    this.session = null;
    this.audioTap = null;
    this.queue = null;
    this.readiness = null;
    this.stopping = false;
    this.failoverInProgress = false;
  }

  publishState(update) {
    const detail = {
      broadcastId: this.broadcastId,
      provider: this.providerName,
      ...update,
    };
    detail.label = detail.label || statusLabel(detail.status, detail.provider);
    emitWindowState(detail);
    return detail;
  }

  providerCallbacks(providerName) {
    return {
      onStatus: (state) => this.publishState({ ...state, provider: providerName }),
      onPartial: (segment) => {
        this.publishState({ status: 'live', provider: providerName, partialText: segment.text });
      },
      onFinal: (segment) => {
        if (!this.queue || !this.session?.id) return;
        this.queue.enqueue({
          ...segment,
          sessionId: this.session.id,
          provider: providerName,
          providerRevision: Number(segment.providerRevision) || 0,
        });
      },
      onMetrics: (metrics) => this.publishState({ status: 'live', provider: providerName, metrics }),
      onError: (error) => {
        this.publishState({ status: 'degraded', provider: providerName, message: error?.message || String(error) });
        if (!this.stopping) void this.failover(providerName, error);
      },
    };
  }

  async createBrowserSession(provider) {
    const response = await transcriptService.createProviderSession(this.broadcastId, {
      provider,
      language: 'en',
    });
    const session = response?.data?.session;
    if (!session?.id) throw new Error('ECHOO could not create a transcript session.');
    this.session = session;
    this.queue = new TranscriptUploadQueue({
      upload: (segment) => transcriptService.upsertBroadcastSegment(this.broadcastId, segment),
    });
    return session;
  }

  async startParakeet() {
    let provider = preloadedParakeet;
    if (!provider || !provider.ready) provider = new BrowserParakeetProvider();
    provider.callbacks = this.providerCallbacks('parakeet');
    const state = provider.ready ? provider.getState() : await provider.initialize({ offsetMs: 0 });
    const session = await this.createBrowserSession('parakeet');
    provider.offsetMs = Number(session.offsetMs) || 0;
    this.provider = provider;
    this.providerName = 'parakeet';
    preloadedParakeet = null;
    this.audioTap = await createTranscriptionAudioTap({
      mediaTrack: this.mediaTrack,
      onAudio: (audio) => this.provider === provider && provider.pushAudio(audio),
    });
    this.publishState({ status: 'live', provider: 'parakeet', model: state.model });
    return { provider: 'parakeet', sessionId: session.id };
  }

  async startGemini() {
    const provider = new GeminiLiveProvider({
      broadcastId: this.broadcastId,
      ...this.providerCallbacks('gemini-live'),
    });
    const session = await this.createBrowserSession('gemini-live');
    await provider.initialize({ offsetMs: Number(session.offsetMs) || 0 });
    this.provider = provider;
    this.providerName = 'gemini-live';
    this.audioTap = await createTranscriptionAudioTap({
      mediaTrack: this.mediaTrack,
      onAudio: (audio) => this.provider === provider && provider.pushAudio(audio),
    });
    this.publishState({ status: 'live', provider: 'gemini-live' });
    return { provider: 'gemini-live', sessionId: session.id };
  }

  async startWhisper() {
    this.provider = null;
    this.providerName = 'whisper-flow';
    const result = await startWhisperFlowTranscription({
      broadcastId: this.broadcastId,
      mediaTrack: this.mediaTrack,
    });
    if (!result?.configured) throw new Error('Whisper fallback is not configured.');
    this.publishState({ status: 'live', provider: 'whisper-flow' });
    return { provider: 'whisper-flow', sessionId: result.sessionId };
  }

  async start() {
    this.readiness = await transcriptService.getReadiness().catch(() => ({ data: {} }));
    const flags = this.readiness?.data || {};
    this.publishState({ status: 'initializing' });

    if (import.meta.env.VITE_PARAKEET_ENABLED !== 'false') {
      try { return await this.startParakeet(); } catch (error) {
        this.publishState({ status: 'degraded', provider: 'parakeet', message: error?.message || String(error) });
        await this.cleanupBrowserProvider({ flush: false });
      }
    }
    if (flags.geminiLiveEnabled) {
      try { return await this.startGemini(); } catch (error) {
        this.publishState({ status: 'degraded', provider: 'gemini-live', message: error?.message || String(error) });
        await this.cleanupBrowserProvider({ flush: false });
      }
    }
    if (flags.whisperFallbackEnabled ?? flags.configured) {
      try { return await this.startWhisper(); } catch (error) {
        this.publishState({ status: 'degraded', provider: 'whisper-flow', message: error?.message || String(error) });
      }
    }
    this.providerName = null;
    this.publishState({ status: 'unavailable', provider: null });
    return { provider: null, configured: false };
  }

  async cleanupBrowserProvider({ flush = true } = {}) {
    const provider = this.provider;
    this.provider = null;
    if (this.audioTap) {
      await this.audioTap.stop().catch(() => null);
      this.audioTap = null;
    }
    if (provider) {
      if (flush) await provider.flush?.().catch(() => null);
      await provider.stop?.().catch(() => null);
    }
    if (this.queue) {
      if (flush) await this.queue.flush({ timeoutMs: 5000 }).catch(() => false);
      this.queue.stop();
      this.queue = null;
    }
    if (this.session?.id) {
      await transcriptService.flushProviderSession(this.session.id).catch(() => null);
      this.session = null;
    }
  }

  async failover(failedProvider, error) {
    if (this.failoverInProgress || this.stopping || this.providerName !== failedProvider) return;
    this.failoverInProgress = true;
    try {
      await this.cleanupBrowserProvider({ flush: true });
      const flags = this.readiness?.data || {};
      if (failedProvider === 'parakeet' && flags.geminiLiveEnabled) {
        try { await this.startGemini(); return; } catch { await this.cleanupBrowserProvider({ flush: false }); }
      }
      if (flags.whisperFallbackEnabled ?? flags.configured) {
        try { await this.startWhisper(); return; } catch { /* fall through */ }
      }
      this.providerName = null;
      this.publishState({
        status: 'unavailable', provider: null,
        message: error?.message || 'All transcription providers are unavailable.',
      });
    } finally {
      this.failoverInProgress = false;
    }
  }

  async stop({ finalize = true } = {}) {
    if (this.stopping) return;
    this.stopping = true;
    try {
      if (this.providerName === 'whisper-flow') {
        await stopWhisperFlowTranscription({ finalize }).catch(() => null);
      } else {
        await this.cleanupBrowserProvider({ flush: finalize });
      }
      if (finalize) await transcriptService.finalizeBroadcast(this.broadcastId).catch(() => null);
      this.publishState({ status: 'completed' });
    } finally {
      this.providerName = null;
      this.stopping = false;
    }
  }
}

export const startEchooTranscription = async ({ broadcastId, mediaTrack }) => {
  if (activeOrchestrator) await activeOrchestrator.stop({ finalize: false });
  const orchestrator = new TranscriptionOrchestrator({ broadcastId, mediaTrack });
  activeOrchestrator = orchestrator;
  try {
    return await orchestrator.start();
  } catch (error) {
    orchestrator.publishState({ status: 'unavailable', message: error?.message || String(error) });
    return { provider: null, configured: false, error: error?.message || String(error) };
  }
};

export const stopEchooTranscription = async ({ finalize = true } = {}) => {
  const orchestrator = activeOrchestrator;
  activeOrchestrator = null;
  if (orchestrator) await orchestrator.stop({ finalize });
  else await stopWhisperFlowTranscription({ finalize }).catch(() => null);
};

export const getEchooTranscriptionState = () => ({
  active: Boolean(activeOrchestrator?.providerName),
  provider: activeOrchestrator?.providerName || null,
  broadcastId: activeOrchestrator?.broadcastId || null,
});

// livekitPublisher imports this module only inside the Creator Studio bundle.
// Start model preparation while that UI is idle so Go Live never waits on a
// first model download. Listener routes do not import this module.
if (typeof window !== 'undefined' && import.meta.env.VITE_PARAKEET_ENABLED !== 'false') {
  const startPreload = () => void preloadCreatorTranscription();
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(startPreload, { timeout: 3000 });
  } else {
    window.setTimeout(startPreload, 1200);
  }
}

export default {
  preloadCreatorTranscription,
  startEchooTranscription,
  stopEchooTranscription,
  getEchooTranscriptionState,
};
