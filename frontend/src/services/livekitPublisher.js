import {
  Room,
  Track,
} from 'livekit-client';
import { resolveLiveKitUrl } from './livekitUrl.js';
import { ensureBroadcastRecording } from './broadcastRecordingService.js';
import { applyProgramTrackQuality } from './audioQualityProfile.js';

const ECHOO_LIVE_AUDIO_BITRATE = 256000;

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

  syntheticContext = new AudioContextClass({ sampleRate: 48000 });
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
    throw new Error('Echoo did not receive a LiveKit websocket URL from the backend.');
  }

  if (!token) {
    throw new Error('Echoo did not return a LiveKit participant token.');
  }

  await stopLiveKitPublishing();

  const room = new Room();

  try {
    await room.connect(resolvedUrl, token, {
      autoSubscribe: false,
      maxRetries: 3,
      websocketTimeout: 15000,
      peerConnectionTimeout: 20000,
    });

    let publication;
    let mode = 'microphone';
    let programTrackQuality = null;

    if (mediaTrack) {
      if (mediaTrack.kind !== 'audio' || mediaTrack.readyState === 'ended') {
        throw new Error('The Echoo mixer output is not available.');
      }

      // The destination track is a finished broadcast program, not a speech-call
      // microphone. Mark it as music/program audio before WebRTC negotiates so
      // browsers avoid speech-oriented handling where they support contentHint.
      programTrackQuality = applyProgramTrackQuality(mediaTrack);

      publication = await room.localParticipant.publishTrack(mediaTrack, {
        name: 'echoo-studio-mix',
        source: Track.Source.Microphone,
        // Echoo is an audio-broadcast product, not a speech-call product. Keep
        // continuous music/system audio in stereo and give Opus enough bitrate
        // to preserve the post-master studio feed without speech-style DTX.
        audioPreset: { maxBitrate: ECHOO_LIVE_AUDIO_BITRATE },
        forceStereo: true,
        dtx: false,
        // Stereo RED is intentionally left off for the primary quality profile.
        // Network resilience can be A/B tested separately without changing the
        // clean source/mastering path.
        red: false,
      });
      mode = 'studio-mix';
    } else if (syntheticModeEnabled()) {
      const nativeTrack = await createSyntheticTrack();
      publication = await room.localParticipant.publishTrack(nativeTrack, {
        name: 'echoo-dev-test-audio',
        source: Track.Source.Microphone,
        audioPreset: { maxBitrate: 128000 },
        dtx: false,
      });
      mode = 'synthetic-test';
    } else {
      publication = await room.localParticipant.setMicrophoneEnabled(true);
    }

    activeRoom = room;
    activeBroadcastId = String(broadcastId || '');

    // Local-first recording: clone the exact post-master mixer track that is
    // being published to LiveKit. Recording is deliberately independent from
    // the LiveKit Room so a reconnect does not split or lose the local take.
    if (mode === 'studio-mix' && mediaTrack) {
      try {
        await ensureBroadcastRecording({
          broadcastId: activeBroadcastId,
          mediaTrack,
          title: `echoo-live-${activeBroadcastId}`,
        });
      } catch (recordingError) {
        // Recording must never prevent the creator from going live. The end
        // flow simply will not offer a recording if this browser cannot record.
        console.warn(
          '[Echoo Recording] could not start local recording:',
          recordingError?.message || recordingError
        );
      }
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
    try {
      await room.disconnect();
    } catch {
      // Ignore cleanup errors while unwinding a failed connection.
    }

    await cleanupSyntheticAudio();
    throw liveKitConnectionError(error, resolvedUrl);
  }
};

export default {
  startLiveKitPublishing,
  stopLiveKitPublishing,
  getLiveKitPublishingState,
};
