import { Room, RoomEvent, Track } from 'livekit-client';

import { applyProgramTrackQuality } from './audioQualityProfile.js';
import { ensureBroadcastRecording } from './broadcastRecordingService.js';
import {
  CREATOR_TRANSPORT_STALL_MS,
  LIVE_RECOVERY_DELAYS_MS,
  mediaTrackIsLive,
  recoveryDelayMs,
  roomIsConnected,
} from './liveRecoveryPolicy.js';
import { resolveLiveKitUrl } from './livekitUrl.js';
import {
  getRealtimeAudioProfile,
  liveKitPublishOptionsFor,
  normalizeRealtimeAudioProfile,
} from './realtimeAudioQuality.js';

const PROGRAM_TRACK_NAME = 'echoo-studio-mix';
const DEV_TRACK_NAME = 'echoo-dev-test-audio';
const WATCHDOG_INTERVAL_MS = 5000;
const ROOM_DISCONNECT_DEADLINE_MS = 4000;

let activeRoom = null;
let activeBroadcastId = null;
let activePublication = null;
let activeQualityProfile = 'broadcast_high';
let previousSenderStats = null;
let generation = 0;
let session = null;

let publisherHealth = {
  phase: 'idle',
  mixer: 'idle',
  room: 'disconnected',
  publication: 'missing',
  livekit: 'disconnected',
  audio: 'disconnected',
  broadcastId: null,
  trackSid: null,
  trackName: null,
  recoveryAttempt: 0,
  lastError: '',
};

let syntheticContext = null;
let syntheticOscillator = null;
let syntheticNativeTrack = null;

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const isCurrent = (candidate) => Boolean(
  candidate && session === candidate && candidate.generation === generation && !candidate.stopping
);

const publishHealth = (update) => {
  publisherHealth = {
    ...publisherHealth,
    ...update,
    connected: Boolean(
      roomIsConnected(activeRoom) &&
      activePublication &&
      mediaTrackIsLive(activePublication.track) &&
      session?.mediaTrack?.readyState !== 'ended'
    ),
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('echoo:publisher-health', { detail: publisherHealth }));
  }
  return publisherHealth;
};

const syntheticModeEnabled = () =>
  import.meta.env.DEV && import.meta.env.VITE_SYNTHETIC_AUDIO === 'true';

const createPreferredAudioContext = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('This browser does not support Web Audio.');
  try {
    return new AudioContextClass({ sampleRate: 48000, latencyHint: 'interactive' });
  } catch {
    return new AudioContextClass();
  }
};

const createSyntheticTrack = async () => {
  syntheticContext = createPreferredAudioContext();
  await syntheticContext.resume();
  const oscillator = syntheticContext.createOscillator();
  const gain = syntheticContext.createGain();
  const destination = syntheticContext.createMediaStreamDestination();
  oscillator.type = 'sine';
  oscillator.frequency.value = 440;
  gain.gain.value = 0.02;
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start();
  const nativeTrack = destination.stream.getAudioTracks()[0];
  if (!nativeTrack) throw new Error('Could not create Echoo synthetic audio track.');
  applyProgramTrackQuality(nativeTrack);
  syntheticOscillator = oscillator;
  syntheticNativeTrack = nativeTrack;
  return nativeTrack;
};

const cleanupSyntheticAudio = async () => {
  try { syntheticNativeTrack?.stop(); } catch { /* already ended */ }
  try { syntheticOscillator?.stop(); } catch { /* already stopped */ }
  try { await syntheticContext?.close(); } catch { /* already closed */ }
  syntheticNativeTrack = null;
  syntheticOscillator = null;
  syntheticContext = null;
};

const liveKitConnectionError = (error, url) => {
  const message = String(error?.message || error || '').trim();
  const lower = message.toLowerCase();
  if (/token|jwt|authorization|permission|unauth/.test(lower)) {
    return new Error(`LiveKit rejected the broadcast session credentials. Sign in again and retry.${message ? ` (${message})` : ''}`);
  }
  if (/websocket|network|connect|timeout|fetch|ice|signal/.test(lower)) {
    return new Error(`Could not establish the LiveKit audio connection to ${url}. Check internet access and retry.${message ? ` (${message})` : ''}`);
  }
  return new Error(message ? `LiveKit could not publish the Echoo studio mix: ${message}` : 'LiveKit could not publish the Echoo studio mix.');
};

const canonicalPublicationExists = (room, publication = activePublication) => {
  if (!room || !publication || !mediaTrackIsLive(publication.track)) return false;
  const publications = room.localParticipant?.trackPublications;
  if (!publications?.forEach) return Boolean(publication.trackSid);
  let found = false;
  publications.forEach((candidate) => {
    const name = candidate?.trackName || candidate?.name || candidate?.track?.name;
    if (
      candidate === publication ||
      candidate?.trackSid === publication?.trackSid ||
      name === PROGRAM_TRACK_NAME ||
      name === DEV_TRACK_NAME
    ) {
      if (mediaTrackIsLive(candidate?.track || publication.track)) found = true;
    }
  });
  return found;
};

const healthySnapshot = () => {
  const mixerLive = mediaTrackIsLive(
    session?.mediaTrack ? { kind: 'audio', mediaStreamTrack: session.mediaTrack } : null
  );
  const roomConnected = roomIsConnected(activeRoom);
  const published = roomConnected && canonicalPublicationExists(activeRoom);
  return { mixerLive, roomConnected, published };
};

export const getLiveKitPublishingState = () => {
  const health = healthySnapshot();
  return {
    broadcastId: activeBroadcastId,
    roomName: activeRoom?.name || null,
    targetAudioBitsPerSecond: getRealtimeAudioProfile(activeQualityProfile).maxBitrate,
    qualityProfile: activeQualityProfile,
    ...publisherHealth,
    connected: health.roomConnected && health.published && health.mixerLive,
  };
};

export const refreshLiveKitPublishingDiagnostics = async () => {
  const track = activePublication?.track;
  const stats = await track?.getSenderStats?.();
  if (!stats) return getLiveKitPublishingState();
  const report = await track?.getRTCStatsReport?.();
  let outbound = null;
  report?.forEach?.((entry) => {
    if (entry?.type === 'outbound-rtp' && entry.kind === 'audio') outbound = entry;
  });
  const codec = outbound?.codecId ? report?.get?.(outbound.codecId) : null;
  const previous = previousSenderStats;
  const elapsedMs = Math.max(1, Number(stats.timestamp || 0) - Number(previous?.timestamp || 0));
  const bytesDelta = Math.max(0, Number(stats.bytesSent || 0) - Number(previous?.bytesSent || 0));
  previousSenderStats = stats;
  publishHealth({
    outboundBitrate: previous ? Math.round((bytesDelta * 8 * 1000) / elapsedMs) : null,
    bytesSent: Number(stats.bytesSent) || 0,
    packetsSent: Number(stats.packetsSent) || 0,
    packetsLost: Number(stats.packetsLost) || 0,
    roundTripTime: Number.isFinite(stats.roundTripTime) ? stats.roundTripTime : null,
    jitter: Number.isFinite(stats.jitter) ? stats.jitter : null,
    negotiatedCodec: codec?.mimeType || null,
    audioClockRate: Number(codec?.clockRate) || null,
    negotiatedChannels: Number(outbound?.channels) || null,
    trackId: track?.mediaStreamTrack?.id || null,
  });
  return getLiveKitPublishingState();
};

const cancelRecoveryTimer = (candidate) => {
  if (candidate?.recoveryTimer) window.clearTimeout(candidate.recoveryTimer);
  if (candidate) candidate.recoveryTimer = null;
};

const detachRoom = async (room) => {
  if (!room) return;
  let deadlineTimer = null;
  let deadlineReached = false;
  const disconnect = Promise.resolve()
    .then(() => room.disconnect())
    .catch((error) => {
      console.warn('[Echoo Live][Creator] room disconnect warning', error?.message || error);
    });
  const deadline = new Promise((resolve) => {
    deadlineTimer = window.setTimeout(() => {
      deadlineReached = true;
      resolve();
    }, ROOM_DISCONNECT_DEADLINE_MS);
  });

  await Promise.race([disconnect, deadline]);
  window.clearTimeout(deadlineTimer);
  if (deadlineReached) {
    // LiveKit owns the in-flight cleanup promise. The session references were
    // already cleared, so a slow provider disconnect must not trap the Creator
    // in the ENDING overlay after listeners are already off air.
    console.warn('[Echoo Live][Creator] room disconnect exceeded the UI deadline');
  }
};

const attachRoomEvents = (room, candidate) => {
  room.on(RoomEvent.Reconnecting, () => {
    if (!isCurrent(candidate) || activeRoom !== room) return;
    publishHealth({ phase: 'reconnecting', room: 'reconnecting', livekit: 'reconnecting', audio: 'reconnecting' });
  });

  room.on(RoomEvent.Reconnected, () => {
    if (!isCurrent(candidate) || activeRoom !== room) return;
    if (canonicalPublicationExists(room) && mediaTrackIsLive({ kind: 'audio', mediaStreamTrack: candidate.mediaTrack })) {
      candidate.recoveryAttempt = 0;
      candidate.lastProgressAt = Date.now();
      publishHealth({
        phase: candidate.paused ? 'paused' : 'live',
        room: 'connected',
        publication: 'published',
        livekit: 'connected',
        audio: candidate.paused ? 'paused' : 'published',
        recoveryAttempt: 0,
        lastError: '',
      });
      return;
    }
    publishHealth({ phase: 'recovering', room: 'connected', publication: 'missing', livekit: 'connected', audio: 'recovering' });
    void schedulePublisherRecovery(candidate, 'publication_missing_after_reconnect', true);
  });

  room.on(RoomEvent.Disconnected, (reason) => {
    if (!isCurrent(candidate) || activeRoom !== room) return;
    activeRoom = null;
    activePublication = null;
    publishHealth({ phase: 'recovering', room: 'disconnected', publication: 'missing', livekit: 'disconnected', audio: 'recovering', disconnectReason: String(reason ?? '') });
    void schedulePublisherRecovery(candidate, 'room_disconnected', true);
  });
};

const connectAndPublish = async (candidate, { url, token, recovery = false }) => {
  const resolvedUrl = resolveLiveKitUrl(url);
  const mediaTrack = candidate.mediaTrack;
  if (!resolvedUrl || !token) throw new Error('Echoo did not receive valid LiveKit publishing credentials.');
  if (!mediaTrackIsLive({ kind: 'audio', mediaStreamTrack: candidate.mediaTrack })) {
    publishHealth({ mixer: 'ended', publication: 'missing', audio: 'failed' });
    throw new Error('The Echoo mixer output ended and cannot be republished.');
  }

  const room = new Room({ stopLocalTrackOnUnpublish: false });
  attachRoomEvents(room, candidate);
  activeRoom = room;
  activePublication = null;
  activeBroadcastId = candidate.broadcastId;
  publishHealth({
    phase: recovery ? 'recovering' : 'connecting',
    mixer: 'available',
    room: 'connecting',
    publication: 'waiting',
    livekit: 'connecting',
    audio: recovery ? 'recovering' : 'waiting',
    broadcastId: candidate.broadcastId,
    trackSid: null,
    trackName: candidate.trackName,
  });

  const connectStartedAt = performance.now();
  try {
    await room.connect(resolvedUrl, token, {
      autoSubscribe: false,
      maxRetries: 3,
      websocketTimeout: 15000,
      peerConnectionTimeout: 20000,
    });
    if (!isCurrent(candidate) || activeRoom !== room) {
      await detachRoom(room);
      throw new Error('Broadcast publishing was superseded.');
    }

    const connectedAt = performance.now();
    console.info('[Echoo LiveKit] connected', {
      broadcastId: candidate.broadcastId,
      recovery,
    });
    publishHealth({ room: 'connected', livekit: 'connected', publication: 'waiting' });
    const publishOptions = candidate.mode === 'studio-mix'
      ? {
          name: 'echoo-studio-mix',
          source: Track.Source.Microphone,
          ...candidate.publishOptions,
        }
      : {
          name: 'echoo-dev-test-audio',
          source: Track.Source.Microphone,
          audioPreset: { maxBitrate: 128000 },
          dtx: false,
        };
    const publication = await room.localParticipant.publishTrack(mediaTrack, publishOptions);
    if (!isCurrent(candidate) || activeRoom !== room) {
      await detachRoom(room);
      throw new Error('Broadcast publishing was superseded.');
    }

    // Preserve intentional Pause across a transport recovery.
    if (candidate.paused) await publication.mute();

    activePublication = publication;
    activeQualityProfile = candidate.qualityProfile;
    previousSenderStats = null;
    candidate.recoveryAttempt = 0;
    candidate.lastProgressAt = Date.now();
    candidate.lastTransportSample = null;
    publishHealth({
      phase: candidate.paused ? 'paused' : 'live',
      mixer: 'available',
      room: 'connected',
      publication: 'published',
      livekit: 'connected',
      audio: candidate.paused ? 'paused' : 'published',
      trackSid: publication?.trackSid || null,
      trackName: candidate.trackName,
      recoveryAttempt: 0,
      lastError: '',
    });
    console.info('[Echoo LiveKit] track published', {
      broadcastId: candidate.broadcastId,
      trackSid: publication?.trackSid || null,
      trackName: candidate.trackName,
    });
    console.info(`[Echoo Live][${recovery ? 'Recovery' : 'Creator'}] program track published`, {
      broadcastId: candidate.broadcastId,
      roomName: room.name,
      trackSid: publication?.trackSid || null,
      trackName: candidate.trackName,
      recovery,
    });
    return {
      connected: true,
      roomName: room.name,
      identity: room.localParticipant.identity,
      trackSid: publication?.trackSid || null,
      mode: candidate.mode,
      url: resolvedUrl,
      connectMs: Math.round(connectedAt - connectStartedAt),
      publishMs: Math.round(performance.now() - connectedAt),
    };
  } catch (error) {
    if (activeRoom === room) activeRoom = null;
    activePublication = null;
    await detachRoom(room);
    throw error;
  }
};

async function runPublisherRecovery(candidate, reason) {
  if (!isCurrent(candidate) || candidate.recoveryPromise) return candidate?.recoveryPromise;
  candidate.recoveryPromise = (async () => {
    while (isCurrent(candidate) && candidate.recoveryAttempt < LIVE_RECOVERY_DELAYS_MS.length) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        publishHealth({ phase: 'recovering', room: 'waiting_network', livekit: 'reconnecting', audio: 'recovering' });
        return false;
      }
      const attempt = candidate.recoveryAttempt;
      candidate.recoveryAttempt += 1;
      publishHealth({ phase: 'recovering', publication: 'missing', audio: 'recovering', recoveryAttempt: attempt + 1 });
      const delay = recoveryDelayMs(attempt);
      if (delay) await wait(delay);
      if (!isCurrent(candidate)) return false;

      try {
        const staleRoom = activeRoom;
        activeRoom = null;
        activePublication = null;
        await detachRoom(staleRoom);
        const credentials = await candidate.credentialProvider?.();
        if (!credentials?.token) throw new Error('Echoo could not refresh creator credentials.');
        await connectAndPublish(candidate, {
          url: credentials.livekitUrl || candidate.url,
          token: credentials.token,
          recovery: true,
        });
        console.info('[Echoo Live][Recovery] creator audio recovered', {
          broadcastId: candidate.broadcastId,
          attempt: attempt + 1,
          reason,
        });
        return true;
      } catch (error) {
        if (!isCurrent(candidate)) return false;
        const message = error?.message || String(error);
        publishHealth({ lastError: message, recoveryAttempt: attempt + 1 });
        console.warn('[Echoo Live][Recovery] creator recovery attempt failed', {
          broadcastId: candidate.broadcastId,
          attempt: attempt + 1,
          reason,
          message,
        });
      }
    }
    if (isCurrent(candidate)) {
      publishHealth({ phase: 'failed', room: 'disconnected', publication: 'failed', livekit: 'error', audio: 'failed' });
    }
    return false;
  })();
  try {
    return await candidate.recoveryPromise;
  } finally {
    candidate.recoveryPromise = null;
  }
}

async function schedulePublisherRecovery(candidate, reason, immediate = false) {
  if (!isCurrent(candidate) || candidate.recoveryPromise || candidate.recoveryTimer) return;
  const delay = immediate ? 0 : recoveryDelayMs(candidate.recoveryAttempt);
  candidate.recoveryTimer = window.setTimeout(() => {
    candidate.recoveryTimer = null;
    void runPublisherRecovery(candidate, reason);
  }, delay);
}

const startWatchdog = (candidate) => {
  window.clearInterval(candidate.watchdogTimer);
  candidate.watchdogTimer = window.setInterval(async () => {
    if (
      !isCurrent(candidate) ||
      candidate.recoveryPromise ||
      candidate.paused ||
      !roomIsConnected(activeRoom) ||
      !activePublication
    ) return;
    if (!mediaTrackIsLive({ kind: 'audio', mediaStreamTrack: candidate.mediaTrack })) {
      publishHealth({ phase: 'failed', mixer: 'ended', publication: 'failed', audio: 'failed', lastError: 'Mixer track ended.' });
      return;
    }
    try {
      const stats = await activePublication.track?.getSenderStats?.();
      if (!stats || !isCurrent(candidate)) return;
      const sample = { bytes: Number(stats.bytesSent) || 0, packets: Number(stats.packetsSent) || 0 };
      const prior = candidate.lastTransportSample;
      candidate.lastTransportSample = sample;
      if (!prior || sample.bytes > prior.bytes || sample.packets > prior.packets) {
        candidate.lastProgressAt = Date.now();
        return;
      }
      if (Date.now() - candidate.lastProgressAt >= CREATOR_TRANSPORT_STALL_MS) {
        publishHealth({ phase: 'recovering', publication: 'stalled', audio: 'recovering', lastError: 'Outgoing audio transport stopped progressing.' });
        void schedulePublisherRecovery(candidate, 'transport_stall', true);
      }
    } catch (error) {
      console.warn('[Echoo Live][Creator] sender diagnostics unavailable', error?.message || error);
    }
  }, WATCHDOG_INTERVAL_MS);
};

const installNetworkHints = (candidate) => {
  candidate.onOffline = () => {
    if (isCurrent(candidate)) publishHealth({ phase: 'reconnecting', room: 'waiting_network', livekit: 'reconnecting', audio: 'reconnecting' });
  };
  candidate.onOnline = () => {
    if (isCurrent(candidate) && !healthySnapshot().published) {
      void schedulePublisherRecovery(candidate, 'browser_online', true);
    }
  };
  window.addEventListener('offline', candidate.onOffline);
  window.addEventListener('online', candidate.onOnline);
};

const removeNetworkHints = (candidate) => {
  if (!candidate) return;
  window.removeEventListener('offline', candidate.onOffline);
  window.removeEventListener('online', candidate.onOnline);
};

export const stopLiveKitPublishing = async () => {
  const current = session;
  if (current) current.stopping = true;
  generation += 1;
  session = null;
  cancelRecoveryTimer(current);
  if (current?.watchdogTimer) window.clearInterval(current.watchdogTimer);
  removeNetworkHints(current);
  const room = activeRoom;
  activeRoom = null;
  activeBroadcastId = null;
  activePublication = null;
  activeQualityProfile = 'broadcast_high';
  previousSenderStats = null;
  publishHealth({
    phase: 'idle', mixer: 'idle', room: 'disconnected', publication: 'missing',
    livekit: 'disconnected', audio: 'disconnected', broadcastId: null,
    trackSid: null, trackName: null, recoveryAttempt: 0, lastError: '',
  });
  await detachRoom(room);
  if (syntheticContext || syntheticNativeTrack || syntheticOscillator) await cleanupSyntheticAudio();
};

export const retryLiveKitPublishingRecovery = async () => {
  if (!session || session.stopping) throw new Error('There is no active broadcast to recover.');
  session.recoveryAttempt = 0;
  return runPublisherRecovery(session, 'manual_retry');
};

export const setLiveKitPublishingPaused = async (paused) => {
  if (!activeRoom || !activePublication || !canonicalPublicationExists(activeRoom)) {
    throw new Error('The Echoo studio mix is not currently published.');
  }
  if (session) session.paused = Boolean(paused);
  if (paused) await activePublication.mute();
  else {
    await activePublication.unmute();
    if (session) session.lastProgressAt = Date.now();
  }
  publishHealth({ phase: paused ? 'paused' : 'live', audio: paused ? 'paused' : 'published' });
  return getLiveKitPublishingState();
};

export const startLiveKitPublishing = async ({
  url,
  token,
  broadcastId,
  mediaTrack = null,
  qualityProfile = 'broadcast_high',
  credentialProvider = null,
}) => {
  const publishingStartedAt = performance.now();
  const resolvedUrl = resolveLiveKitUrl(url);
  const id = String(broadcastId || '').trim();
  const selectedQualityProfile = normalizeRealtimeAudioProfile(qualityProfile);
  const selectedQuality = getRealtimeAudioProfile(selectedQualityProfile);
  const selectedPublishOptions = liveKitPublishOptionsFor(selectedQualityProfile);
  if (!resolvedUrl) throw new Error('Echoo did not receive a LiveKit websocket URL from the backend.');
  if (!token) throw new Error('Echoo did not return a LiveKit participant token.');
  if (!id) throw new Error('Echoo cannot publish audio without a broadcast ID.');
  if (!mediaTrack && !syntheticModeEnabled()) {
    throw new Error('The Echoo post-master studio mix is not ready. Connect an audio source before going live.');
  }
  if (session || activeRoom || activePublication || syntheticContext) await stopLiveKitPublishing();

  const nativeTrack = mediaTrack || await createSyntheticTrack();
  if (nativeTrack.kind !== 'audio' || nativeTrack.readyState === 'ended') {
    throw new Error('The Echoo mixer output is not available.');
  }
  const programTrackQuality = applyProgramTrackQuality(nativeTrack);
  console.info('[Echoo Studio] mixer ready', {
    broadcastId: id,
    trackId: nativeTrack.id || null,
  });
  const candidate = {
    generation: ++generation,
    broadcastId: id,
    url: resolvedUrl,
    mediaTrack: nativeTrack,
    qualityProfile: selectedQualityProfile,
    publishOptions: selectedPublishOptions,
    mode: mediaTrack ? 'studio-mix' : 'synthetic-test',
    trackName: mediaTrack ? PROGRAM_TRACK_NAME : DEV_TRACK_NAME,
    credentialProvider,
    recoveryAttempt: 0,
    recoveryTimer: null,
    recoveryPromise: null,
    watchdogTimer: null,
    lastProgressAt: Date.now(),
    lastTransportSample: null,
    paused: false,
    stopping: false,
  };
  session = candidate;
  activeBroadcastId = id;
  installNetworkHints(candidate);

  try {
    const result = await connectAndPublish(candidate, { url: resolvedUrl, token, recovery: false });
    startWatchdog(candidate);
    if (candidate.mode === 'studio-mix') {
      void ensureBroadcastRecording({ broadcastId: id, mediaTrack: nativeTrack, title: `echoo-live-${id}` })
        .catch((error) => console.warn('[Echoo Recording] local recording start failed', error?.message || error));
    }
    return {
      ...result,
      targetAudioBitsPerSecond: selectedQuality.maxBitrate,
      qualityProfile: selectedQualityProfile,
      requestedSampleRate: selectedQuality.sampleRate,
      requestedChannels: selectedQuality.channels,
      programTrackQuality,
      totalMs: Math.round(performance.now() - publishingStartedAt),
    };
  } catch (error) {
    if (isCurrent(candidate)) {
      candidate.stopping = true;
      session = null;
      generation += 1;
      removeNetworkHints(candidate);
      if (candidate.watchdogTimer) window.clearInterval(candidate.watchdogTimer);
      publishHealth({ phase: 'failed', room: 'disconnected', publication: 'failed', livekit: 'error', audio: 'failed', lastError: error?.message || String(error) });
    }
    await cleanupSyntheticAudio();
    throw liveKitConnectionError(error, resolvedUrl);
  }
};

export const getActiveLiveKitRoom = () => activeRoom;

export default {
  startLiveKitPublishing,
  stopLiveKitPublishing,
  retryLiveKitPublishingRecovery,
  getLiveKitPublishingState,
  getActiveLiveKitRoom,
  setLiveKitPublishingPaused,
  refreshLiveKitPublishingDiagnostics,
};
