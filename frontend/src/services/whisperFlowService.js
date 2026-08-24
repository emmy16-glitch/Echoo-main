import realtimeService from './realtimeService.js';
import transcriptService from './transcriptService.js';

const TARGET_SAMPLE_RATE = 16000;
const CLIENT_FRAME_LIMIT = 250;
const FRAME_ACK_TIMEOUT_MS = 5000;
let activeSession = null;
let whisperHealth = {
  status: 'disabled',
  broadcastId: null,
  sessionId: null,
  framesProduced: 0,
  framesAcknowledged: 0,
  droppedFrames: 0,
  bufferedFrames: 0,
};

const publishWhisperHealth = (update) => {
  whisperHealth = { ...whisperHealth, ...update, updatedAt: new Date().toISOString() };
  window.dispatchEvent(new CustomEvent('echoo:whisper-health', { detail: whisperHealth }));
  return whisperHealth;
};

const emitWithAck = (socket, event, payload, timeout = FRAME_ACK_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${event} timed out.`));
    }, timeout);
    socket.emit(event, payload, (response) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (response?.ok) resolve(response);
      else reject(new Error(response?.error || `${event} failed.`));
    });
  });

const createPcmWorklet = async (context) => {
  if (!context.audioWorklet || typeof AudioWorkletNode === 'undefined') return null;
  const source = `
    class EchooTranscriptPcm extends AudioWorkletProcessor {
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
        const left = channels[0];
        const right = channels[1] || left;
        for (let i = 0; i < left.length; i += 1) {
          this.sum += (left[i] + right[i]) * 0.5;
          this.count += 1;
          this.phase += 1;
          if (this.phase >= this.ratio) {
            const sample = Math.max(-1, Math.min(1, this.count ? this.sum / this.count : 0));
            this.pending.push(sample < 0 ? sample * 32768 : sample * 32767);
            this.phase -= this.ratio;
            this.sum = 0;
            this.count = 0;
          }
        }
        if (this.pending.length >= 320) {
          const pcm = new Int16Array(this.pending.splice(0, 320));
          this.port.postMessage(pcm.buffer, [pcm.buffer]);
        }
        return true;
      }
    }
    registerProcessor('echoo-transcript-pcm', EchooTranscriptPcm);
  `;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  return new AudioWorkletNode(context, 'echoo-transcript-pcm', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
};

const drainFrames = async (session) => {
  if (session.draining || activeSession !== session) return;
  session.draining = true;
  try {
    while (activeSession === session && session.frames.length && session.socket.connected) {
      const frame = session.frames[0];
      try {
        await emitWithAck(session.socket, 'transcription:pcm', {
          sessionId: session.id,
          frameIndex: frame.frameIndex,
          data: frame.data,
        });
        session.frames.shift();
        session.lastAcknowledgedFrame = frame.frameIndex;
        session.framesAcknowledged += 1;
        publishWhisperHealth({
          status: 'connected',
          framesAcknowledged: session.framesAcknowledged,
          bufferedFrames: session.frames.length,
        });
      } catch {
        frame.attempts += 1;
        if (frame.attempts >= 3) session.frames.shift();
        break;
      }
    }
  } finally {
    session.draining = false;
  }
};

const enqueueFrame = (session, data) => {
  if (activeSession !== session || !(data instanceof ArrayBuffer) || !data.byteLength) return;
  session.frames.push({ frameIndex: session.nextFrame, data, attempts: 0 });
  session.nextFrame += 1;
  session.framesProduced += 1;
  while (session.frames.length > CLIENT_FRAME_LIMIT) {
    session.frames.shift();
    session.droppedFrames += 1;
  }
  publishWhisperHealth({
    framesProduced: session.framesProduced,
    droppedFrames: session.droppedFrames,
    bufferedFrames: session.frames.length,
  });
  if (session.framesProduced === 1 || session.framesProduced % 500 === 0) {
    console.info('[Echoo Transcript] PCM leaving creator', {
      broadcastId: session.broadcastId,
      sessionId: session.id,
      framesProduced: session.framesProduced,
      bufferedFrames: session.frames.length,
      droppedFrames: session.droppedFrames,
    });
  }
  void drainFrames(session);
};

const attachSession = async (session) => {
  const response = await emitWithAck(session.socket, 'transcription:attach', {
    sessionId: session.id,
  });
  session.connected = true;
  session.lastAcknowledgedFrame = Number(response?.session?.lastAcknowledgedFrame ?? -1);
  session.nextFrame = Math.max(session.nextFrame, session.lastAcknowledgedFrame + 1);
  publishWhisperHealth({
    status: 'connected',
    broadcastId: session.broadcastId,
    sessionId: session.id,
  });
  console.info('[Echoo Transcript] gateway connected', {
    broadcastId: session.broadcastId,
    sessionId: session.id,
    lastAcknowledgedFrame: session.lastAcknowledgedFrame,
  });
  void drainFrames(session);
};

export const getWhisperFlowState = () => ({
  ...whisperHealth,
  configured: Boolean(activeSession?.configured),
  connected: Boolean(activeSession?.connected && activeSession?.socket?.connected),
  broadcastId: activeSession?.broadcastId || null,
  sessionId: activeSession?.id || null,
  offsetMs: Number(activeSession?.offsetMs) || 0,
  bufferedFrames: activeSession?.frames?.length || 0,
  lastAcknowledgedFrame: Number(activeSession?.lastAcknowledgedFrame ?? -1),
});

const drainForBackgroundHandoff = async (session, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs;
  while (session.frames.length && session.socket.connected && Date.now() < deadline) {
    await drainFrames(session);
    if (session.frames.length) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  }

  if (session.frames.length) {
    console.warn('[Echoo Transcript] creator handoff left buffered PCM frames', {
      broadcastId: session.broadcastId,
      sessionId: session.id,
      bufferedFrames: session.frames.length,
    });
  }
};

export const stopWhisperFlowTranscription = async ({ finalize = true } = {}) => {
  const session = activeSession;
  if (!session) return;
  session.stopping = true;
  publishWhisperHealth({ status: finalize ? 'finalizing' : 'handoff' });

  // Stop producing new PCM first, then deliver every already-captured frame we
  // can acknowledge. The backend owns the long-running quality/finalization
  // work after End Live; the creator must not lose the last seconds merely
  // because the browser producer was detached.
  if (session.processor?.port) session.processor.port.onmessage = null;
  try { session.source.disconnect(); } catch { /* already disconnected */ }
  try { session.processor.disconnect(); } catch { /* already disconnected */ }
  try { session.silentGain.disconnect(); } catch { /* already disconnected */ }
  try { session.track.stop(); } catch { /* already stopped */ }
  try { await session.context.close(); } catch { /* already closed */ }

  await drainForBackgroundHandoff(session);

  session.socket.off('connect', session.onConnect);
  session.socket.off('disconnect', session.onDisconnect);

  if (!finalize || !session.configured) {
    if (activeSession === session) activeSession = null;
    publishWhisperHealth({
      status: 'disabled', broadcastId: null, sessionId: null, bufferedFrames: session.frames.length,
    });
    return;
  }

  try {
    await emitWithAck(session.socket, 'transcription:flush', { sessionId: session.id }, 35000);
  } catch (socketError) {
    await transcriptService.flushSession(session.id).catch((error) => {
      console.warn('[Echoo Transcript] could not flush transcript:', error?.message || socketError?.message || error);
    });
  }
  if (activeSession === session) activeSession = null;
  publishWhisperHealth({ status: 'completed', bufferedFrames: 0 });
};

export const startWhisperFlowTranscription = async ({ broadcastId, mediaTrack }) => {
  const id = String(broadcastId || '').trim();
  if (!id || !mediaTrack || mediaTrack.kind !== 'audio') {
    throw new Error('Transcription needs the Echoo master audio track and broadcast ID.');
  }

  await stopWhisperFlowTranscription();
  publishWhisperHealth({
    status: 'connecting',
    broadcastId: id,
    sessionId: null,
    framesProduced: 0,
    framesAcknowledged: 0,
    droppedFrames: 0,
    bufferedFrames: 0,
  });
  const created = await transcriptService.createSession(id);
  const configured = Boolean(created?.data?.configured);
  const sessionData = created?.data?.session;
  if (!configured || !sessionData?.id) {
    publishWhisperHealth({ status: 'disabled' });
    return { configured: false, connected: false };
  }

  const socket = await realtimeService.connect();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('This browser cannot prepare transcription audio.');
  const context = new AudioContextClass({ latencyHint: 'interactive' });
  const track = mediaTrack.clone();
  const source = context.createMediaStreamSource(new MediaStream([track]));
  const processor = await createPcmWorklet(context);
  if (!processor) {
    track.stop();
    await context.close();
    throw new Error('AudioWorklet is required for production transcription.');
  }
  const silentGain = context.createGain();
  silentGain.gain.value = 0;
  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(context.destination);

  const session = {
    id: sessionData.id,
    broadcastId: id,
    configured: true,
    connected: false,
    offsetMs: Number(sessionData.offsetMs) || 0,
    lastAcknowledgedFrame: Number(sessionData.lastAcknowledgedFrame ?? -1),
    nextFrame: Math.max(0, Number(sessionData.lastAcknowledgedFrame ?? -1) + 1),
    frames: [],
    draining: false,
    socket,
    context,
    track,
    source,
    processor,
    silentGain,
    onConnect: null,
    onDisconnect: null,
    framesProduced: 0,
    framesAcknowledged: 0,
    droppedFrames: 0,
  };
  activeSession = session;
  processor.port.onmessage = (event) => enqueueFrame(session, event.data);
  session.onConnect = () => {
    session.connected = false;
    publishWhisperHealth({ status: 'reconnecting' });
    attachSession(session).catch((error) => {
      publishWhisperHealth({ status: 'failed', error: error?.message || String(error) });
      console.warn('[Echoo Transcript] gateway reconnect failed; live audio continues:', error?.message || error);
    });
  };
  session.onDisconnect = () => {
    if (!session.stopping) publishWhisperHealth({ status: 'reconnecting' });
  };
  socket.on('connect', session.onConnect);
  socket.on('disconnect', session.onDisconnect);
  try {
    await attachSession(session);
    await context.resume();
  } catch (error) {
    await stopWhisperFlowTranscription({ finalize: false }).catch(() => null);
    publishWhisperHealth({ status: 'failed', error: error?.message || String(error) });
    throw error;
  }

  return {
    configured: true,
    connected: true,
    sampleRate: TARGET_SAMPLE_RATE,
    sessionId: session.id,
    offsetMs: session.offsetMs,
  };
};

export default {
  startWhisperFlowTranscription,
  stopWhisperFlowTranscription,
  getWhisperFlowState,
};
