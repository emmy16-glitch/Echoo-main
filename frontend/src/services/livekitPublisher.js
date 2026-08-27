import {
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import { resolveLiveKitUrl } from './livekitUrl.js';
import { ensureBroadcastRecording } from './broadcastRecordingService.js';
import { applyProgramTrackQuality } from './audioQualityProfile.js';
import {
  startEchooTranscription,
  stopEchooTranscription,
} from './transcription/orchestrator.js';

const ECHOO_LIVE_AUDIO_BITRATE = 256000;

let activeRoom = null;
let activeBroadcastId = null;
let activePublication = null;
let publisherHealth = {
  mixer: 'idle',
  livekit: 'disconnected',
  audio: 'disconnected',
  broadcastId: null,
  trackSid: null,
  trackName: null,
};

const publishHealth = (update) => {
  publisherHealth = { ...publisherHealth, ...update, updatedAt: new Date().toISOString() };
  window.dispatchEvent(new CustomEvent('echoo:publisher-health', { detail: publisherHealth }));
  return publisherHealth;
};

let syntheticContext = null;
let syntheticOscillator = null;
let syntheticNativeTrack = null;

const syntheticModeEnabled = () =>
  import.meta.env.DEV && import.meta.env.VITE_SYNTHETIC_AUDIO === 'true';

const createPreferredAudioContext = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('This browser does not support Web Audio.');
  }

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

  if (!nativeTrack) {
    throw new Error('Could not create Echoo synthetic audio track.');
  }

  applyProgramTrackQuality(nativeTrack);
  syntheticOscillator = oscillator;
  syntheticNativeTrack = nativeTrack;
  return nativeTrack;
};

const cleanupSyntheticAudio = async () => {
  try {
    syntheticNativeTrack?.stop();
  } catch {
    // Ignore cleanup errors from an already-ended test track.
  }

  try {
    syntheticOscillator?.stop();
  } catch {
    // Ignore cleanup errors from an already-stopped oscillator.
  }

  try {
    await syntheticContext?.close();
  } catch {
    // Ignore cleanup errors from an already-closed context.
  }

  syntheticNativeTrack = null;
  syntheticOscillator = null;
  syntheticContext = null;
};

const liveKitConnectionError = (error, url) => {
  const message = String(error?.message || error || '').trim();
  const lower = message.toLowerCase();

  if (/token|jwt|authorization|permission|unauth/.test(lower)) {
    return new Error(
      `LiveKit rejected the broadcast session credentials. Confirm the backend is using the API key and secret for ${url}, then sign in again and retry.${message ? ` (${message})` : ''}`
    );
  }

  if (/websocket|network|connect|timeout|fetch|ice|signal/.test(lower)) {
    return new Error(
      `Could not establish the LiveKit audio connection to ${url}. Check internet access, firewall/VPN restrictions, and that the .env points to the correct LiveKit Cloud project.${message ? ` (${message})` : ''}`
    );
  }

  return new Error(
    message
      ? `LiveKit could not publish the Echoo studio mix: ${message}`
      : 'LiveKit could not publish the Echoo studio mix.'
  );
};

export const getLiveKitPublishingState = () => ({
  connected: Boolean(activeRoom),
  broadcastId: activeBroadcastId,
  roomName: activeRoom?.name || null,
  targetAudioBitsPerSecond: ECHOO_LIVE_AUDIO_BITRATE,
  ...publisherHealth,
});

export const stopLiveKitPublishing = async () => {
  const room = activeRoom;

  activeRoom = null;
  activeBroadcastId = null;
  activePublication = null;
  publishHealth({
    livekit: 'disconnected',
    audio: 'disconnected',
    broadcastId: null,
    trackSid: null,
    trackName: null,
  });

  await stopEchooTranscription().catch((error) => {
    console.warn('[Echoo Transcript] cleanup warning:', error?.message || error);
  });

  if (room) {
    try {
      await room.disconnect();
    } catch (error) {
      console.warn('Could not disconnect LiveKit room:', error);
    }
  }

  await cleanupSyntheticAudio();
};

export const setLiveKitPublishingPaused = async (paused) => {
  if (!activeRoom || !activePublication) {
    throw new Error('The Echoo studio mix is not currently published.');
  }

  if (paused) await activePublication.mute();
  else await activePublication.unmute();

  publishHealth({ audio: paused ? 'paused' : 'published' });
  console.info(`[Echoo LiveKit] studio mix ${paused ? 'paused' : 'resumed'}`, {
    broadcastId: activeBroadcastId,
    roomName: activeRoom.name,
    trackSid: activePublication.trackSid || null,
  });
  return getLiveKitPublishingState();
};

export const startLiveKitPublishing = async ({
  url,
  token,
  broadcastId,
  mediaTrack = null,
}) => {
  const resolvedUrl = resolveLiveKitUrl(url);
  const id = String(broadcastId || '').trim();

  if (!resolvedUrl) {
    throw new Error('Echoo did not receive a LiveKit websocket URL from the backend.');
  }

  if (!token) {
    throw new Error('Echoo did not return a LiveKit participant token.');
  }

  if (!id) {
    throw new Error('Echoo cannot publish audio without a broadcast ID.');
  }

  if (!mediaTrack && !syntheticModeEnabled()) {
    throw new Error(
      'The Echoo post-master studio mix is not ready. Connect the Host Mic and confirm the Audience Output before going live.'
    );
  }

  await stopLiveKitPublishing();

  publishHealth({
    mixer: mediaTrack ? 'ready' : 'synthetic-test',
    livekit: 'connecting',
    audio: 'waiting',
    broadcastId: id,
    trackSid: null,
    trackName: mediaTrack ? 'echoo-studio-mix' : 'echoo-dev-test-audio',
  });
  console.info('[Echoo Studio] mixer ready', {
    broadcastId: id,
    trackId: mediaTrack?.id || null,
    trackKind: mediaTrack?.kind || null,
    trackState: mediaTrack?.readyState || null,
  });

  const room = new Room({ stopLocalTrackOnUnpublish: false });
  room.on(RoomEvent.Reconnecting, () => {
    publishHealth({ livekit: 'reconnecting', audio: 'reconnecting' });
  });
  room.on(RoomEvent.Reconnected, () => {
    publishHealth({ livekit: 'connected', audio: publisherHealth.trackSid ? 'published' : 'waiting' });
  });
  room.on(RoomEvent.Disconnected, () => {
    publishHealth({ livekit: 'disconnected', audio: 'disconnected' });
  });

  try {
    await room.connect(resolvedUrl, token, {
      autoSubscribe: false,
      maxRetries: 3,
      websocketTimeout: 15000,
      peerConnectionTimeout: 20000,
    });
    publishHealth({ livekit: 'connected' });
    console.info('[Echoo LiveKit] connected', {
      broadcastId: id,
      roomName: room.name,
      identity: room.localParticipant.identity,
    });

    let publication;
    let mode = 'studio-mix';
    let programTrackQuality = null;

    if (mediaTrack) {
      if (mediaTrack.kind !== 'audio' || mediaTrack.readyState === 'ended') {
        throw new Error('The Echoo mixer output is not available.');
      }

      programTrackQuality = applyProgramTrackQuality(mediaTrack);

      publication = await room.localParticipant.publishTrack(mediaTrack, {
        name: 'echoo-studio-mix',
        source: Track.Source.Microphone,
        audioPreset: { maxBitrate: ECHOO_LIVE_AUDIO_BITRATE },
        forceStereo: true,
        dtx: false,
        red: false,
      });
    } else {
      const nativeTrack = await createSyntheticTrack();
      publication = await room.localParticipant.publishTrack(nativeTrack, {
        name: 'echoo-dev-test-audio',
        source: Track.Source.Microphone,
        audioPreset: { maxBitrate: 128000 },
        dtx: false,
      });
      mode = 'synthetic-test';
    }

    activeRoom = room;
    activeBroadcastId = id;
    activePublication = publication;
    publishHealth({
      audio: 'published',
      broadcastId: id,
      trackSid: publication?.trackSid || null,
      trackName: mode === 'studio-mix' ? 'echoo-studio-mix' : 'echoo-dev-test-audio',
    });
    console.info('[Echoo LiveKit] track published', {
      broadcastId: id,
      roomName: room.name,
      trackSid: publication?.trackSid || null,
      trackName: mode === 'studio-mix' ? 'echoo-studio-mix' : 'echoo-dev-test-audio',
      source: mode === 'studio-mix' ? 'echoo-studio-mix' : 'echoo-dev-test-audio',
    });

    if (mode === 'studio-mix' && mediaTrack) {
      try {
        await ensureBroadcastRecording({
          broadcastId: activeBroadcastId,
          mediaTrack,
          title: `echoo-live-${activeBroadcastId}`,
        });
      } catch (recordingError) {
        console.warn(
          '[Echoo Recording] could not start local recording:',
          recordingError?.message || recordingError
        );
      }

      // Transcription taps a clone of the exact same post-master track. It is a
      // side-car only: a provider/model/API failure can never unwind LiveKit.
      startEchooTranscription({
        broadcastId: activeBroadcastId,
        mediaTrack,
      }).catch((transcriptionError) => {
        console.warn(
          '[Echoo Transcript] realtime transcription is unavailable; live audio continues:',
          transcriptionError?.message || transcriptionError
        );
      });
    }

    const result = {
      connected: true,
      roomName: room.name,
      identity: room.localParticipant.identity,
      trackSid: publication?.trackSid || null,
      mode,
      url: resolvedUrl,
      targetAudioBitsPerSecond: ECHOO_LIVE_AUDIO_BITRATE,
      programTrackQuality,
    };

    console.log('[Echoo LiveKit] publishing hi-fi studio mix', result);
    return result;
  } catch (error) {
    publishHealth({ livekit: 'error', audio: 'error' });
    try {
      await room.disconnect();
    } catch {
      // Ignore cleanup errors while unwinding a failed connection.
    }

    await cleanupSyntheticAudio();
    throw liveKitConnectionError(error, resolvedUrl);
  }
};

export const getActiveLiveKitRoom = () => activeRoom;

export default {
  startLiveKitPublishing,
  stopLiveKitPublishing,
  getLiveKitPublishingState,
  getActiveLiveKitRoom,
  setLiveKitPublishingPaused,
};
