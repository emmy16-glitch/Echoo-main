import WebSocket from 'ws';
import Broadcast from '../models/Broadcast.js';
import TranscriptSession from '../models/TranscriptSession.js';
import {
  appendTranscriptSessionError,
  finalizeConfirmedTranscript,
  persistTranscriptSegment,
} from './transcriptPersistenceService.js';

const TARGET_SAMPLE_RATE = 16000;
const PCM_FRAME_DURATION_MS = 20;
const PCM_FRAME_BYTES = TARGET_SAMPLE_RATE * (PCM_FRAME_DURATION_MS / 1000) * 2;
const MAX_PCM_FRAMES_PER_SECOND = 200;
const CLIENT_RECONNECT_GRACE_MS = 20000;
const PROVIDER_READY_TIMEOUT_MS = 10000;
const PROVIDER_FLUSH_TIMEOUT_MS = 15000;
const runtimes = new Map();
let socketServer = null;

const clampInteger = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
};
const providerUrl = () => String(process.env.WHISPER_FLOW_URL || '').trim();
const providerApiKey = () => String(process.env.WHISPER_FLOW_API_KEY || process.env.WHISPER_FLOW_AUTH_TOKEN || '').trim();
const providerModel = () => String(process.env.WHISPER_MODEL || 'faster-whisper-large-v3-turbo').trim() || 'faster-whisper-large-v3-turbo';
const providerLanguage = () => String(process.env.WHISPER_LANGUAGE || 'en').trim() || 'en';
const maxBufferBytes = () => clampInteger(process.env.TRANSCRIPTION_MAX_BUFFER_BYTES, 2 * 1024 * 1024, 64 * 1024, 16 * 1024 * 1024);
const maxBufferFrames = () => clampInteger(process.env.TRANSCRIPTION_MAX_BUFFER_FRAMES, 250, 10, 2000);
const maxRetries = () => clampInteger(process.env.TRANSCRIPTION_MAX_RETRIES, 5, 0, 12);
const coarseStatus = (state) => state === 'completed' ? 'completed' : ['failed', 'abandoned'].includes(state) ? 'failed' : 'active';

const publicSession = (session) => ({
  id: String(session.id || session._id),
  broadcastId: String(session.broadcastId),
  state: session.state,
  status: session.status || coarseStatus(session.state),
  provider: session.provider,
  model: session.model || providerModel(),
  offsetMs: Number(session.offsetMs) || 0,
  captureOffset: Number(session.captureOffset ?? session.offsetMs) || 0,
  lastReceivedFrame: Number(session.lastReceivedFrame ?? -1),
  lastSentFrame: Number(session.lastSentFrame ?? -1),
  lastAcknowledgedFrame: Number(session.lastAcknowledgedFrame ?? -1),
  retryCount: Number(session.retryCount) || 0,
  bufferedFramesDropped: Number(session.bufferedFramesDropped) || 0,
  language: session.language || providerLanguage(),
  lastActivityAt: session.lastActivityAt || null,
});

const emitStatus = (runtime, extra = {}) => {
  if (!runtime?.session) return;
  const state = runtime.session.state;
  socketServer?.to(`broadcast:${runtime.session.broadcastId}`).emit('transcript:status', {
    type: state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : 'started',
    ...publicSession(runtime.session),
    ...extra,
  });
};

const updateSession = async (runtime, update, { emit = true } = {}) => {
  if (!runtime?.session) return null;
  const state = update.state || runtime.session.state;
  const session = await TranscriptSession.findByIdAndUpdate(
    runtime.session._id,
    { $set: { ...update, status: coarseStatus(state), lastActivityAt: new Date() } },
    { returnDocument: 'after', runValidators: true }
  );
  if (session) runtime.session = session;
  if (update.state && runtime.session?.broadcastId) {
    const transcriptState = update.state === 'connected'
      ? 'connected'
      : update.state === 'reconnecting'
        ? 'reconnecting'
        : ['failed', 'abandoned'].includes(update.state)
          ? 'failed'
          : update.state === 'completed'
            ? 'completed'
            : update.state === 'flushing'
              ? 'connected'
              : 'connecting';
    await Broadcast.updateOne(
      { _id: runtime.session.broadcastId, isDeleted: false },
      { $set: { transcriptState } }
    ).catch(() => null);
  }
  if (emit) emitStatus(runtime);
  return session;
};

const recordRuntimeError = async (runtime, error, { retryable = false, code } = {}) => {
  const message = String(error?.message || error || 'Transcription gateway error');
  const errorCode = code || error?.code || 'TRANSCRIPTION_GATEWAY_ERROR';
  console.warn('[Echoo Transcript]', {
    broadcastId: String(runtime?.session?.broadcastId || ''),
    sessionId: String(runtime?.session?._id || ''),
    code: errorCode,
    retryable,
    message,
  });
  await appendTranscriptSessionError(runtime?.session?._id, { code: errorCode, message, retryable }).catch(() => null);
  emitStatus(runtime, { error: { code: errorCode, message, retryable } });
};

const parseJson = (data) => {
  try { return JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data || '{}')); }
  catch { return null; }
};

const parseProviderSegment = (value) => {
  if (!value || (value.type && value.type !== 'segment')) return null;
  const text = String(value.transcript ?? value.text ?? '').trim();
  if (!text) return null;
  const confidence = Number(value.confidence ?? value.probability);
  const startTimeMs = Number(value.startTimeMs);
  const endTimeMs = Number(value.endTimeMs);
  return {
    providerSegmentId: String(value.segment_id ?? value.segmentId ?? '').trim(),
    text,
    startMs: Number.isFinite(startTimeMs) ? Math.max(0, startTimeMs) : Math.max(0, (Number(value.start_time ?? value.startTime ?? value.start) || 0) * 1000),
    endMs: Number.isFinite(endTimeMs) ? Math.max(0, endTimeMs) : Math.max(0, (Number(value.end_time ?? value.endTime ?? value.end) || 0) * 1000),
    timebase: value.timebase === 'broadcast' ? 'broadcast' : 'session',
    isFinal: String(value.status || '').toLowerCase() === 'final' || !(value.is_partial ?? value.isPartial ?? value.partial ?? true),
    speaker: String(value.speaker ?? value.speaker_name ?? 'Creator').trim() || 'Creator',
    // Whisper receives the post-master program, so final_mix is authoritative.
    // A future diarization-capable provider may return a narrower source label.
    sourceType: String(value.sourceType ?? value.source_type ?? 'final_mix').trim() || 'final_mix',
    sourceLabel: String(value.sourceLabel ?? value.source_label ?? 'Echoo final mix').trim() || 'Echoo final mix',
    language: String(value.language || providerLanguage()).trim() || providerLanguage(),
    confidence: Number.isFinite(confidence) ? confidence : null,
    providerRevision: Math.max(0, Math.floor(Number(value.revision) || 0)),
    processingMs: Math.max(0, Math.floor(Number(value.processingMs) || 0)),
  };
};

const persistProviderSegment = async (runtime, value) => {
  const result = parseProviderSegment(value);
  if (!result || runtime.closed) return;
  const base = result.timebase === 'broadcast' ? 0 : Number(runtime.session.offsetMs || 0);
  const startMs = Math.max(runtime.lastSegmentEndMs, base + Math.round(result.startMs));
  const endMs = Math.max(startMs, base + Math.round(result.endMs));
  const providerSegmentId = result.providerSegmentId || `wf-${runtime.session._id}-${runtime.sequence}`;
  const receivedAt = Date.now();
  runtime.persistQueue = runtime.persistQueue.then(async () => {
    await persistTranscriptSegment({
      broadcastId: runtime.session.broadcastId,
      sessionId: runtime.session._id,
      io: socketServer,
      input: { ...result, providerSegmentId, sequence: runtime.sequence, startMs, endMs, provider: runtime.session.provider },
    });
    if (result.isFinal) {
      runtime.lastSegmentEndMs = Math.max(runtime.lastSegmentEndMs, endMs);
      runtime.sequence += 1;
      const latencyMs = Math.max(0, receivedAt - (runtime.broadcastStartedAt + endMs));
      await updateSession(runtime, {
        lastProviderSequence: runtime.sequence,
        lastTranscriptLatencyMs: latencyMs,
        lastProcessingMs: result.processingMs,
      }, { emit: false });
      console.info('[Echoo Transcript] final segment', {
        broadcastId: String(runtime.session.broadcastId),
        sessionId: String(runtime.session._id),
        latencyMs,
        processingMs: result.processingMs,
      });
    }
  }).catch((error) => recordRuntimeError(runtime, error, { retryable: true, code: 'TRANSCRIPT_PERSIST_FAILED' }));
};

const persistFrameProgress = (runtime) => {
  if (runtime.progressTimer) return;
  runtime.progressTimer = setTimeout(() => {
    runtime.progressTimer = null;
    updateSession(runtime, {
      lastReceivedFrame: runtime.lastReceivedFrame,
      lastSentFrame: runtime.lastSentFrame,
      lastAcknowledgedFrame: runtime.lastAcknowledgedFrame,
      bufferedFramesDropped: runtime.droppedFrames,
    }, { emit: false }).catch(() => null);
  }, 500);
  runtime.progressTimer.unref?.();
};

const queueFrame = (runtime, frame) => {
  if (runtime.frames.some((item) => item.frameIndex === frame.frameIndex)) return;
  runtime.frames.push({ ...frame, inFlight: false });
  runtime.bufferedBytes += frame.data.byteLength;
  while (runtime.frames.length > maxBufferFrames() || runtime.bufferedBytes > maxBufferBytes()) {
    const dropped = runtime.frames.shift();
    runtime.bufferedBytes -= dropped?.data?.byteLength || 0;
    runtime.droppedFrames += 1;
  }
  persistFrameProgress(runtime);
};

const sendFrame = (runtime, frame) => {
  if (runtime.closed || !runtime.providerReady || runtime.provider?.readyState !== WebSocket.OPEN || runtime.provider.bufferedAmount > maxBufferBytes()) return false;
  frame.inFlight = true;
  runtime.provider.send(JSON.stringify({
    type: 'audio',
    broadcastId: String(runtime.session.broadcastId),
    sessionId: String(runtime.session._id),
    sequence: frame.frameIndex,
    timestamp: Number(runtime.session.offsetMs || 0) + frame.frameIndex * PCM_FRAME_DURATION_MS,
    audioChunk: frame.data.toString('base64'),
  }), (error) => { if (error) frame.inFlight = false; });
  runtime.lastSentFrame = Math.max(runtime.lastSentFrame, frame.frameIndex);
  if (frame.frameIndex === 0 || frame.frameIndex % 500 === 0) {
    console.info('[Echoo Transcript] PCM forwarded to Whisper Flow', {
      broadcastId: String(runtime.session.broadcastId),
      sessionId: String(runtime.session._id),
      sequence: frame.frameIndex,
      bytes: frame.data.byteLength,
    });
  }
  persistFrameProgress(runtime);
  return true;
};

const drainFrames = (runtime) => {
  for (const frame of runtime.frames) {
    if (!frame.inFlight && !sendFrame(runtime, frame)) break;
  }
};

const acknowledgeFrame = (runtime, sequence) => {
  const acknowledged = Number(sequence);
  if (!Number.isSafeInteger(acknowledged) || acknowledged < 0) return;
  runtime.lastAcknowledgedFrame = Math.max(runtime.lastAcknowledgedFrame, acknowledged);
  while (runtime.frames.length && runtime.frames[0].frameIndex <= runtime.lastAcknowledgedFrame) {
    const removed = runtime.frames.shift();
    runtime.bufferedBytes -= removed.data.byteLength;
  }
  persistFrameProgress(runtime);
  drainFrames(runtime);
};

const waitUntil = async (predicate, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return Boolean(predicate());
};

const scheduleProviderReconnect = async (runtime, cause) => {
  if (runtime.closed || runtime.flushing || runtime.reconnectTimer) return;
  runtime.retryCount += 1;
  await recordRuntimeError(runtime, cause, { retryable: runtime.retryCount <= maxRetries(), code: 'WHISPER_FLOW_DISCONNECTED' });
  if (runtime.retryCount > maxRetries()) {
    await updateSession(runtime, { state: 'failed', failureReason: String(cause?.message || cause).slice(0, 1000), retryCount: runtime.retryCount });
    runtime.closed = true;
    runtime.frames.length = 0;
    runtime.bufferedBytes = 0;
    try { runtime.provider?.close(); } catch { /* already closed */ }
    runtimes.delete(String(runtime.session._id));
    return;
  }
  await updateSession(runtime, { state: 'reconnecting', retryCount: runtime.retryCount });
  const delay = Math.min(15000, 500 * (2 ** Math.min(runtime.retryCount - 1, 5))) + Math.floor(Math.random() * 250);
  runtime.reconnectTimer = setTimeout(() => {
    runtime.reconnectTimer = null;
    connectProvider(runtime).catch(() => null);
  }, delay);
  runtime.reconnectTimer.unref?.();
};

const handleProviderMessage = (runtime, provider, raw) => {
  if (runtime.provider !== provider) return;
  const value = parseJson(raw);
  if (!value) return;
  if (value.type === 'ready') {
    runtime.providerReady = true;
    runtime.retryCount = 0;
    void updateSession(runtime, {
      state: runtime.flushing ? 'flushing' : 'connected',
      connectedAt: runtime.session.connectedAt || new Date(),
      retryCount: 0,
      model: String(value.model || runtime.session.model || providerModel()).slice(0, 80),
    }).then(() => drainFrames(runtime));
  } else if (value.type === 'ack') {
    acknowledgeFrame(runtime, value.sequence);
  } else if (value.type === 'flushed') {
    runtime.flushResolve?.(value);
    runtime.flushResolve = null;
  } else {
    void persistProviderSegment(runtime, value);
  }
};

async function connectProvider(runtime, { allowFlushing = false } = {}) {
  if (runtime.closed || (runtime.flushing && !allowFlushing)) return;
  const url = providerUrl();
  if (!url) {
    await updateSession(runtime, { state: 'failed', failureReason: 'Whisper Flow is not configured' });
    return;
  }
  await updateSession(runtime, { state: runtime.flushing ? 'flushing' : runtime.retryCount ? 'reconnecting' : 'connecting', retryCount: runtime.retryCount });
  const options = { handshakeTimeout: PROVIDER_READY_TIMEOUT_MS, maxPayload: 1024 * 1024 };
  if (providerApiKey()) options.headers = { Authorization: `Bearer ${providerApiKey()}` };
  const provider = new WebSocket(url, options);
  runtime.provider = provider;
  runtime.providerReady = false;
  provider.on('open', () => {
    if (runtime.closed || runtime.provider !== provider) return provider.close();
    for (const frame of runtime.frames) frame.inFlight = false;
    provider.send(JSON.stringify({
      type: 'start',
      broadcastId: String(runtime.session.broadcastId),
      sessionId: String(runtime.session._id),
      model: runtime.session.model || providerModel(),
      language: runtime.session.language || providerLanguage(),
      sampleRate: TARGET_SAMPLE_RATE,
      channels: 1,
      encoding: 'pcm_s16le',
      offsetMs: Number(runtime.session.offsetMs || 0),
      resumeAfterSequence: runtime.lastAcknowledgedFrame,
      // The durable recording-chunk pipeline is authoritative when it started
      // successfully. Keep the original inline quality pass only as a fallback
      // for browsers where lossless recording/chunking could not start.
      inlineQuality: runtime.inlineQuality !== false,
    }));
  });
  provider.on('message', (data) => handleProviderMessage(runtime, provider, data));
  provider.on('error', (error) => {
    if (runtime.provider === provider) void recordRuntimeError(runtime, error, { retryable: true, code: 'WHISPER_FLOW_ERROR' });
  });
  provider.on('close', (code, reason) => {
    if (runtime.provider !== provider) return;
    runtime.provider = null;
    runtime.providerReady = false;
    for (const frame of runtime.frames) frame.inFlight = false;
    if (!runtime.closed && !runtime.flushing) void scheduleProviderReconnect(runtime, new Error(`Whisper Flow closed (${code}${reason?.length ? `: ${reason}` : ''})`));
  });
}

const runtimeForSession = (session, broadcastStartedAt = null, inlineQuality = true) => {
  const key = String(session._id);
  let runtime = runtimes.get(key);
  if (runtime) {
    runtime.inlineQuality = inlineQuality;
    return runtime;
  }
  runtime = {
    session,
    broadcastStartedAt: broadcastStartedAt ? new Date(broadcastStartedAt).getTime() : Date.now() - Number(session.offsetMs || 0),
    inlineQuality,
    provider: null,
    providerReady: false,
    socketIds: new Set(),
    frames: [],
    bufferedBytes: 0,
    droppedFrames: Number(session.bufferedFramesDropped) || 0,
    lastReceivedFrame: Number(session.lastReceivedFrame ?? session.lastAcknowledgedFrame ?? -1),
    lastSentFrame: Number(session.lastSentFrame ?? session.lastAcknowledgedFrame ?? -1),
    lastAcknowledgedFrame: Number(session.lastAcknowledgedFrame ?? -1),
    retryCount: Number(session.retryCount) || 0,
    sequence: Number(session.lastProviderSequence) || 0,
    lastSegmentEndMs: Number(session.captureOffset ?? session.offsetMs) || 0,
    persistQueue: Promise.resolve(),
    progressTimer: null,
    reconnectTimer: null,
    abandonTimer: null,
    flushResolve: null,
    receivedWindowStartedAt: Date.now(),
    receivedWindowFrames: 0,
    flushing: false,
    closed: false,
  };
  runtimes.set(key, runtime);
  return runtime;
};

const loadOwnedSession = async (sessionId, userId) => {
  const session = await TranscriptSession.findOne({
    _id: sessionId,
    creatorId: userId,
    state: { $in: ['starting', 'connecting', 'connected', 'reconnecting', 'flushing'] },
  });
  if (!session) return null;
  const broadcast = await Broadcast.findOne({
    _id: session.broadcastId,
    creator: userId,
    status: { $in: ['starting', 'live', 'ending'] },
    isDeleted: false,
  }).select('startedAt qualityChunkingStartedAt qualityChunkingCompletedAt');
  if (!broadcast) return null;
  const durableQualityActive = Boolean(
    broadcast.qualityChunkingStartedAt && !broadcast.qualityChunkingCompletedAt
  );
  return {
    session,
    startedAt: broadcast.startedAt,
    inlineQuality: !durableQualityActive,
  };
};

export const isTranscriptionConfigured = () => Boolean(providerUrl() && providerApiKey());

export async function attachTranscriptionSession({ sessionId, userId, socketId }) {
  const owned = await loadOwnedSession(sessionId, userId);
  if (!owned) throw Object.assign(new Error('Transcript session is unavailable'), { code: 'SESSION_NOT_FOUND' });
  const runtime = runtimeForSession(owned.session, owned.startedAt, owned.inlineQuality);
  runtime.socketIds.add(socketId);
  if (runtime.abandonTimer) clearTimeout(runtime.abandonTimer);
  runtime.abandonTimer = null;
  if (!runtime.provider && !runtime.reconnectTimer && !runtime.flushing) void connectProvider(runtime);
  return publicSession(runtime.session);
}

export function ingestTranscriptionFrame({ sessionId, userId, socketId, frameIndex, data }) {
  const runtime = runtimes.get(String(sessionId));
  if (!runtime || String(runtime.session.creatorId) !== String(userId) || !runtime.socketIds.has(socketId)) {
    throw Object.assign(new Error('Transcript session is not attached'), { code: 'SESSION_NOT_ATTACHED' });
  }
  const index = Number(frameIndex);
  const buffer = Buffer.isBuffer(data) ? data : data instanceof ArrayBuffer ? Buffer.from(data) : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : null;
  if (!Number.isSafeInteger(index) || index < 0 || buffer?.length !== PCM_FRAME_BYTES) {
    throw Object.assign(new Error('Invalid transcription PCM frame'), { code: 'INVALID_PCM_FRAME' });
  }
  const now = Date.now();
  if (now - runtime.receivedWindowStartedAt >= 1000) {
    runtime.receivedWindowStartedAt = now;
    runtime.receivedWindowFrames = 0;
  }
  runtime.receivedWindowFrames += 1;
  if (runtime.receivedWindowFrames > MAX_PCM_FRAMES_PER_SECOND) throw Object.assign(new Error('Transcription PCM rate limit exceeded'), { code: 'PCM_RATE_LIMITED' });
  if (index <= runtime.lastAcknowledgedFrame || index <= runtime.lastReceivedFrame) return { accepted: true, duplicate: true };
  runtime.lastReceivedFrame = index;
  if (index === 0 || index % 500 === 0) {
    console.info('[Echoo Transcript] PCM received by gateway', {
      broadcastId: String(runtime.session.broadcastId),
      sessionId: String(runtime.session._id),
      sequence: index,
      bytes: buffer.byteLength,
    });
  }
  queueFrame(runtime, { frameIndex: index, data: buffer });
  drainFrames(runtime);
  return { accepted: true, buffered: runtime.frames.length };
}

export async function flushTranscriptionSession(sessionId, { reason = 'broadcast-ended', finalize = true } = {}) {
  const runtime = runtimes.get(String(sessionId));
  if (runtime?.flushing) {
    await waitUntil(() => runtime.closed, PROVIDER_READY_TIMEOUT_MS + PROVIDER_FLUSH_TIMEOUT_MS);
    return publicSession(runtime.session);
  }
  const session = runtime?.session || await TranscriptSession.findById(sessionId);
  if (!session) return null;
  if (['completed', 'failed', 'abandoned'].includes(session.state)) return publicSession(session);
  const active = runtime || runtimeForSession(session);
  active.flushing = true;
  if (active.reconnectTimer) clearTimeout(active.reconnectTimer);
  active.reconnectTimer = null;
  await updateSession(active, { state: 'flushing' });
  if (!active.provider) await connectProvider(active, { allowFlushing: true }).catch(() => null);
  const ready = await waitUntil(() => active.providerReady, PROVIDER_READY_TIMEOUT_MS);
  let flushConfirmed = false;
  if (ready) {
    drainFrames(active);
    await waitUntil(() => active.frames.length === 0, PROVIDER_READY_TIMEOUT_MS);
    if (active.provider?.readyState === WebSocket.OPEN) {
      const flushed = new Promise((resolve) => { active.flushResolve = resolve; });
      active.provider.send(JSON.stringify({
        type: 'flush',
        broadcastId: String(active.session.broadcastId),
        sessionId: String(active.session._id),
        reason,
        lastSequence: active.lastReceivedFrame,
      }));
      const result = await Promise.race([
        flushed,
        new Promise((resolve) => setTimeout(() => resolve(null), PROVIDER_FLUSH_TIMEOUT_MS)),
      ]);
      flushConfirmed = Boolean(result);
      if (!flushConfirmed) {
        await recordRuntimeError(active, new Error('Whisper Flow did not confirm transcript flush'), {
          retryable: false,
          code: 'WHISPER_FLOW_FLUSH_TIMEOUT',
        });
      }
    }
  } else {
    await recordRuntimeError(active, new Error('Whisper Flow did not become ready before finalization'), { retryable: false, code: 'WHISPER_FLOW_FLUSH_TIMEOUT' });
  }
  await active.persistQueue.catch(() => null);
  if (!flushConfirmed) {
    active.flushing = false;
    active.flushResolve = null;
    await updateSession(active, { state: 'reconnecting' });
    const error = new Error('Whisper Flow did not confirm transcript finalization');
    error.code = 'WHISPER_FLOW_FLUSH_TIMEOUT';
    error.retryable = true;
    throw error;
  }
  active.closed = true;
  active.flushResolve = null;
  if (active.progressTimer) clearTimeout(active.progressTimer);
  if (active.abandonTimer) clearTimeout(active.abandonTimer);
  try { active.provider?.close(1000, reason); } catch { /* already closed */ }
  await updateSession(active, {
    state: 'completed',
    endedAt: new Date(),
    lastReceivedFrame: active.lastReceivedFrame,
    lastSentFrame: active.lastSentFrame,
    lastAcknowledgedFrame: active.lastAcknowledgedFrame,
    bufferedFramesDropped: active.droppedFrames,
  });
  if (finalize) await finalizeConfirmedTranscript({ broadcastId: session.broadcastId, io: socketServer });
  runtimes.delete(String(sessionId));
  return publicSession(active.session);
}

export async function flushBroadcastTranscription(broadcastId) {
  const sessions = await TranscriptSession.find({ broadcastId, state: { $in: ['starting', 'connecting', 'connected', 'reconnecting', 'flushing'] } });
  await Promise.allSettled(sessions.map((session) => flushTranscriptionSession(session._id, { reason: 'broadcast-ended', finalize: false })));
  return finalizeConfirmedTranscript({ broadcastId, io: socketServer });
}

export function detachTranscriptionSocket(socketId) {
  for (const runtime of runtimes.values()) {
    if (!runtime.socketIds.delete(socketId) || runtime.socketIds.size || runtime.flushing) continue;
    runtime.abandonTimer = setTimeout(() => {
      runtime.abandonTimer = null;
      if (!runtime.socketIds.size && !runtime.flushing) {
        void flushTranscriptionSession(runtime.session._id, { reason: 'creator-disconnected' })
          .catch((error) => {
            console.warn('[Echoo Transcript] background disconnect flush will retry:', {
              broadcastId: String(runtime.session.broadcastId),
              sessionId: String(runtime.session._id),
              code: error?.code || 'TRANSCRIPT_FLUSH_FAILED',
              message: error?.message || String(error),
            });
          });
      }
    }, CLIENT_RECONNECT_GRACE_MS);
    runtime.abandonTimer.unref?.();
  }
}

export function configureTranscriptionGateway(io) { socketServer = io; }
export function getTranscriptionGatewayDiagnostics() {
  return {
    configured: isTranscriptionConfigured(),
    activeSessions: runtimes.size,
    maxBufferBytes: maxBufferBytes(),
    maxBufferFrames: maxBufferFrames(),
    maxRetries: maxRetries(),
    model: providerModel(),
  };
}

export default {
  configureTranscriptionGateway,
  isTranscriptionConfigured,
  attachTranscriptionSession,
  ingestTranscriptionFrame,
  flushTranscriptionSession,
  flushBroadcastTranscription,
  detachTranscriptionSocket,
  getTranscriptionGatewayDiagnostics,
};