import {
  Room,
  Track,
} from 'livekit-client';
import { resolveLiveKitUrl } from './livekitUrl.js';

let activeRoom = null;
let activeBroadcastId = null;

let syntheticContext = null;
let syntheticOscillator = null;
let syntheticNativeTrack = null;

const syntheticModeEnabled = () =>
  import.meta.env.VITE_SYNTHETIC_AUDIO === 'true';

const createSyntheticTrack = async () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error('This browser does not support Web Audio.');
  }

  syntheticContext = new AudioContextClass();
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

export const getLiveKitPublishingState = () => ({
  connected: Boolean(activeRoom),
  broadcastId: activeBroadcastId,
  roomName: activeRoom?.name || null,
});

export const stopLiveKitPublishing = async () => {
  const room = activeRoom;

  activeRoom = null;
  activeBroadcastId = null;

  if (room) {
    try {
      await room.disconnect();
    } catch (error) {
      console.warn('Could not disconnect LiveKit room:', error);
    }
  }

  await cleanupSyntheticAudio();
};

export const startLiveKitPublishing = async ({
  url,
  token,
  broadcastId,
  mediaTrack = null,
}) => {
  const resolvedUrl = resolveLiveKitUrl(url);

  if (!resolvedUrl) {
    throw new Error('VITE_LIVEKIT_URL is not configured.');
  }

  if (!token) {
    throw new Error('Echoo did not return a LiveKit token.');
  }

  await stopLiveKitPublishing();

  const room = new Room();

  try {
    await room.connect(resolvedUrl, token);

    let publication;
    let mode = 'microphone';

    if (mediaTrack) {
      if (mediaTrack.kind !== 'audio' || mediaTrack.readyState === 'ended') {
        throw new Error('The Echoo mixer output is not available.');
      }

      publication = await room.localParticipant.publishTrack(mediaTrack, {
        name: 'echoo-studio-mix',
        source: Track.Source.Microphone,
      });
      mode = 'studio-mix';
    } else if (syntheticModeEnabled()) {
      const nativeTrack = await createSyntheticTrack();
      publication = await room.localParticipant.publishTrack(nativeTrack, {
        name: 'echoo-dev-test-audio',
        source: Track.Source.Microphone,
      });
      mode = 'synthetic-test';
    } else {
      publication = await room.localParticipant.setMicrophoneEnabled(true);
    }

    activeRoom = room;
    activeBroadcastId = String(broadcastId || '');

    const result = {
      connected: true,
      roomName: room.name,
      identity: room.localParticipant.identity,
      trackSid: publication?.trackSid || null,
      mode,
      url: resolvedUrl,
    };

    console.log('[Echoo LiveKit] publishing', result);
    return result;
  } catch (error) {
    try {
      await room.disconnect();
    } catch {
      // Ignore cleanup errors while unwinding a failed connection.
    }

    await cleanupSyntheticAudio();
    throw error;
  }
};

export default {
  startLiveKitPublishing,
  stopLiveKitPublishing,
  getLiveKitPublishingState,
};
