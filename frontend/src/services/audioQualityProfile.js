const PROFILE_STORAGE_KEY = 'echooBroadcastCaptureProfile';

export const BROADCAST_CAPTURE_PROFILES = Object.freeze({
  studio: {
    id: 'studio',
    label: 'Studio clean',
    shortDescription: 'Natural sound for headphones, USB mics and audio interfaces.',
    contentHint: 'music',
    constraints: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 24 },
    },
  },
  voice: {
    id: 'voice',
    label: 'Voice cleanup',
    shortDescription: 'Extra browser cleanup for laptop mics and noisy rooms.',
    contentHint: 'speech',
    constraints: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: { ideal: 48000 },
    },
  },
});

const safeStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const getBroadcastCaptureProfile = () => {
  const stored = safeStorage()?.getItem(PROFILE_STORAGE_KEY) || '';
  return BROADCAST_CAPTURE_PROFILES[stored] ? stored : 'studio';
};

export const saveBroadcastCaptureProfile = (profileId) => {
  const next = BROADCAST_CAPTURE_PROFILES[profileId] ? profileId : 'studio';
  try {
    safeStorage()?.setItem(PROFILE_STORAGE_KEY, next);
  } catch {
    // A storage failure must never block the creator audio path.
  }
  return next;
};

const supportedConstraintKeys = () => {
  try {
    return navigator.mediaDevices?.getSupportedConstraints?.() || {};
  } catch {
    return {};
  }
};

const filteredConstraints = (constraints = {}) => {
  const supported = supportedConstraintKeys();
  return Object.fromEntries(
    Object.entries(constraints).filter(([key]) => supported[key] !== false)
  );
};

const setContentHint = (track, hint) => {
  if (!track || !hint || !('contentHint' in track)) return;
  try {
    track.contentHint = hint;
  } catch {
    // Older browsers may expose contentHint without allowing assignment.
  }
};

export const applyBroadcastCaptureProfile = async (track, profileId = 'studio') => {
  if (!track || track.kind !== 'audio' || track.readyState === 'ended') {
    throw new Error('The microphone track is not available for audio-quality setup.');
  }

  const profile =
    BROADCAST_CAPTURE_PROFILES[profileId] || BROADCAST_CAPTURE_PROFILES.studio;

  setContentHint(track, profile.contentHint);

  if (typeof track.applyConstraints === 'function') {
    const constraints = filteredConstraints(profile.constraints);
    try {
      await track.applyConstraints(constraints);
    } catch (error) {
      // Some devices reject one optional constraint even when the browser says
      // the key is supported. Retry the universally useful processing controls
      // rather than failing an otherwise healthy microphone.
      const fallback = filteredConstraints({
        echoCancellation: profile.constraints.echoCancellation,
        noiseSuppression: profile.constraints.noiseSuppression,
        autoGainControl: profile.constraints.autoGainControl,
        channelCount: 1,
      });

      try {
        await track.applyConstraints(fallback);
      } catch {
        console.warn(
          '[Echoo Audio] capture profile could not be fully applied:',
          error?.message || error
        );
      }
    }
  }

  return getTrackQualitySummary(track, profile.id);
};

export const applyProgramTrackQuality = (track) => {
  if (!track || track.kind !== 'audio' || track.readyState === 'ended') return null;
  setContentHint(track, 'music');
  return getTrackQualitySummary(track, 'program');
};

export const getTrackQualitySummary = (track, profileId = '') => {
  const settings = track?.getSettings?.() || {};
  return {
    profileId,
    sampleRate: Number(settings.sampleRate) || null,
    sampleSize: Number(settings.sampleSize) || null,
    channelCount: Number(settings.channelCount) || null,
    echoCancellation:
      typeof settings.echoCancellation === 'boolean' ? settings.echoCancellation : null,
    noiseSuppression:
      typeof settings.noiseSuppression === 'boolean' ? settings.noiseSuppression : null,
    autoGainControl:
      typeof settings.autoGainControl === 'boolean' ? settings.autoGainControl : null,
    contentHint: track?.contentHint || '',
  };
};

export const audioQualityLabel = (summary = {}) => {
  if (!summary?.sampleRate) return 'Broadcast quality';
  const khz = Math.round(summary.sampleRate / 100) / 10;
  return `${khz} kHz capture`;
};
