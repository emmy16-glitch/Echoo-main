import transcriptService from '../transcriptService.js';
import { dedupeOverlap } from './dedupe.js';

const floatToBase64Pcm16 = (audio) => {
  const pcm = new Int16Array(audio.length);
  for (let i = 0; i < audio.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, Number(audio[i]) || 0));
    pcm[i] = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  const stride = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += stride) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + stride));
  }
  return btoa(binary);
};

export class GeminiLiveProvider {
  constructor({ broadcastId, onStatus, onPartial, onFinal, onError, onMetrics } = {}) {
    this.broadcastId = String(broadcastId || '');
    this.callbacks = { onStatus, onPartial, onFinal, onError, onMetrics };
    this.session = null;
    this.sessionIndex = 0;
    this.rotationTimer = null;
    this.closingTimer = null;
    this.rotateMs = 560000;
    this.overlapMs = 5000;
    this.overlapAudio = [];
    this.overlapAudioMs = 0;
    this.audioClockMs = 0;
    this.lastFinalEndMs = 0;
    this.lastFinalText = '';
    this.sequence = 0;
    this.stopped = false;
    this.rotating = false;
    this.model = 'gemini-3.5-transcribe-live';
  }

  emit(name, payload) {
    try { this.callbacks[name]?.(payload); } catch { /* provider callbacks cannot affect audio */ }
  }

  async initialize({ offsetMs = 0 } = {}) {
    this.audioClockMs = Math.max(0, Number(offsetMs) || 0);
    this.lastFinalEndMs = this.audioClockMs;
    this.emit('onStatus', { status: 'initializing', provider: 'gemini-live' });
    const connection = await this.openSession(0);
    this.session = connection.session;
    this.sessionIndex = 0;
    this.model = connection.model;
    this.rotateMs = connection.rotateMs;
    this.overlapMs = connection.overlapMs;
    this.scheduleRotation();
    this.emit('onStatus', { status: 'ready', provider: 'gemini-live' });
    return this.getState();
  }

  async openSession(index) {
    const tokenResponse = await transcriptService.createGeminiLiveToken(this.broadcastId);
    const token = tokenResponse?.data?.token;
    if (!token) throw new Error('ECHOO could not obtain a Gemini Live token.');

    const { GoogleGenAI, Modality } = await import('@google/genai');
    const model = String(tokenResponse?.data?.model || 'gemini-3.5-transcribe-live');
    const client = new GoogleGenAI({ apiKey: token, apiVersion: 'v1alpha' });
    let opened = false;
    let resolveOpen;
    let rejectOpen;
    const openedPromise = new Promise((resolve, reject) => {
      resolveOpen = resolve;
      rejectOpen = reject;
    });

    const session = await client.live.connect({
      model,
      config: {
        responseModalities: [Modality.TEXT],
        inputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => {
          opened = true;
          resolveOpen?.();
        },
        onmessage: (message) => this.handleMessage(message, index),
        onerror: (event) => {
          const error = new Error(event?.message || 'Gemini Live connection error.');
          if (!opened) rejectOpen?.(error);
          this.emit('onError', error);
        },
        onclose: (event) => {
          if (!this.stopped && index === this.sessionIndex && !this.rotating) {
            this.emit('onError', new Error(event?.reason || 'Gemini Live session closed unexpectedly.'));
          }
        },
      },
    });

    await Promise.race([
      openedPromise,
      new Promise((_, reject) => window.setTimeout(() => reject(new Error('Gemini Live connection timed out.')), 12000)),
    ]);

    return {
      session,
      model,
      rotateMs: Math.max(30000, Number(tokenResponse?.data?.rotateSeconds || 560) * 1000),
      overlapMs: Math.max(1000, Number(tokenResponse?.data?.overlapSeconds || 5) * 1000),
    };
  }

  handleMessage(message, index) {
    const content = message?.serverContent || {};
    const interim = String(content?.interimInputTranscription?.text || '').trim();
    const input = content?.inputTranscription;
    const finalTextRaw = String(input?.text || '').trim();

    if (interim) {
      this.emit('onPartial', {
        provider: 'gemini-live', text: interim, endMs: this.audioClockMs, sessionIndex: index,
      });
    }

    if (finalTextRaw) {
      if (input?.finished === false) {
        this.emit('onPartial', {
          provider: 'gemini-live', text: finalTextRaw, endMs: this.audioClockMs, sessionIndex: index,
        });
        return;
      }
      const text = dedupeOverlap(this.lastFinalText, finalTextRaw);
      if (!text) return;
      const startMs = this.lastFinalEndMs;
      const endMs = Math.max(startMs, this.audioClockMs);
      const sequence = this.sequence++;
      this.lastFinalText = [this.lastFinalText, text].filter(Boolean).join(' ').slice(-4000);
      this.lastFinalEndMs = endMs;
      this.emit('onFinal', {
        provider: 'gemini-live',
        model: this.model,
        providerSegmentId: `gemini-live-${sequence}`,
        sequence,
        text,
        isFinal: true,
        startMs,
        endMs,
        confidence: null,
        language: String(input?.languageCode || 'en').slice(0, 16),
        speaker: String(input?.speakerLabel || 'Speaker').slice(0, 120),
        sourceType: 'final_mix',
        sourceLabel: 'Echoo final mix',
      });
    }
  }

  pushAudio(audio) {
    if (this.stopped || !this.session || !(audio instanceof Float32Array) || !audio.length) return;
    const durationMs = (audio.length / 16000) * 1000;
    this.audioClockMs += durationMs;
    const copy = audio.slice();
    this.overlapAudio.push(copy);
    this.overlapAudioMs += durationMs;
    while (this.overlapAudioMs > this.overlapMs && this.overlapAudio.length > 1) {
      const removed = this.overlapAudio.shift();
      this.overlapAudioMs -= (removed.length / 16000) * 1000;
    }
    try {
      this.session.sendRealtimeInput({
        media: { data: floatToBase64Pcm16(copy), mimeType: 'audio/pcm;rate=16000' },
      });
    } catch (error) {
      this.emit('onError', error);
    }
  }

  scheduleRotation() {
    if (this.stopped) return;
    window.clearTimeout(this.rotationTimer);
    this.rotationTimer = window.setTimeout(() => void this.rotate(), this.rotateMs);
  }

  async rotate() {
    if (this.stopped || this.rotating || !this.session) return;
    this.rotating = true;
    const oldSession = this.session;
    const nextIndex = this.sessionIndex + 1;
    this.emit('onStatus', { status: 'rotating', provider: 'gemini-live', sessionIndex: nextIndex });
    try {
      const next = await this.openSession(nextIndex);
      for (const chunk of this.overlapAudio) {
        next.session.sendRealtimeInput({
          media: { data: floatToBase64Pcm16(chunk), mimeType: 'audio/pcm;rate=16000' },
        });
      }
      this.session = next.session;
      this.sessionIndex = nextIndex;
      this.model = next.model;
      this.rotateMs = next.rotateMs;
      this.overlapMs = next.overlapMs;
      this.closingTimer = window.setTimeout(() => {
        try { oldSession.close(); } catch { /* already closed */ }
      }, this.overlapMs);
      this.emit('onStatus', { status: 'ready', provider: 'gemini-live', sessionIndex: nextIndex });
      this.scheduleRotation();
    } catch (error) {
      this.emit('onError', error);
      // Keep the old session alive if possible and retry well before its hard limit.
      this.rotationTimer = window.setTimeout(() => void this.rotate(), Math.min(15000, Math.max(3000, this.overlapMs)));
    } finally {
      this.rotating = false;
    }
  }

  async flush() {
    // Live transcription has no separate durable flush endpoint. Closing the
    // session after the last realtime packet asks Gemini to finish the stream.
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }

  async stop() {
    this.stopped = true;
    window.clearTimeout(this.rotationTimer);
    window.clearTimeout(this.closingTimer);
    await this.flush().catch(() => null);
    try { this.session?.close(); } catch { /* already closed */ }
    this.session = null;
    this.emit('onStatus', { status: 'stopped', provider: 'gemini-live' });
  }

  getState() {
    return {
      provider: 'gemini-live',
      ready: Boolean(this.session),
      sessionIndex: this.sessionIndex,
      rotateMs: this.rotateMs,
      overlapMs: this.overlapMs,
      audioClockMs: this.audioClockMs,
    };
  }
}

export default GeminiLiveProvider;
