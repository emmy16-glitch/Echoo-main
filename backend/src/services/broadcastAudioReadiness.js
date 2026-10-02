import LiveKitProvider from '../providers/livekit.js';

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const parseParticipantMetadata = (participant) => {
  try {
    return participant?.metadata ? JSON.parse(participant.metadata) : {};
  } catch {
    return {};
  }
};

export const isCreatorParticipant = (participant, userId) => {
  if (String(participant?.identity || '') === String(userId || '')) return true;
  const metadata = parseParticipantMetadata(participant);
  return (
    metadata.role === 'creator' &&
    String(metadata.userId || '') === String(userId || '')
  );
};

export const isEchooProgramAudioTrack = (
  track,
  { allowSynthetic = process.env.NODE_ENV !== 'production' } = {}
) => {
  const name = String(track?.name || '').trim().toLowerCase();
  const mimeType = String(track?.mimeType || '').trim().toLowerCase();
  const expectedName =
    name === 'echoo-studio-mix' ||
    (allowSynthetic && name === 'echoo-dev-test-audio');

  if (!expectedName || track?.muted === true) return false;
  return !mimeType || mimeType.startsWith('audio/');
};

export async function getCreatorProgramAudio(broadcastId, userId) {
  const participants = await LiveKitProvider.getParticipants(broadcastId);
  const creator = participants.find((participant) =>
    isCreatorParticipant(participant, userId)
  );
  if (!creator) return null;

  const tracks = Array.isArray(creator.tracks) ? creator.tracks : [];
  const programAudio = tracks.find((track) => isEchooProgramAudioTrack(track));
  if (!programAudio) return null;

  return {
    participantSid: creator.sid || null,
    participantIdentity: creator.identity || null,
    trackSid: programAudio.sid || null,
    trackName: programAudio.name || null,
    mimeType: programAudio.mimeType || null,
  };
}

export async function creatorProgramAudioIsPresent(broadcastId, userId) {
  return Boolean(await getCreatorProgramAudio(broadcastId, userId));
}

export async function waitForCreatorProgramAudioToStop(
  broadcastId,
  userId,
  { maxWaitMs = 2500, pollMs = 100 } = {}
) {
  const deadline = Date.now() + Math.max(250, Number(maxWaitMs) || 2500);
  const interval = Math.max(50, Number(pollMs) || 100);

  while (Date.now() < deadline) {
    try {
      if (!await creatorProgramAudioIsPresent(broadcastId, userId)) return true;
    } catch {
      // End Broadcast must remain fail-safe even if LiveKit presence lookup is
      // temporarily unavailable. Resource cleanup below will still run.
      return false;
    }
    await wait(interval);
  }
  return false;
}

export async function waitForCreatorProgramAudio(
  broadcastId,
  userId,
  {
    maxAttempts = 7,
    initialDelayMs = 250,
    delayStepMs = 200,
  } = {}
) {
  const attempts = Math.max(1, Math.min(12, Number(maxAttempts) || 7));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const programAudio = await getCreatorProgramAudio(broadcastId, userId);
    if (programAudio) return programAudio;

    if (attempt < attempts - 1) {
      await wait(initialDelayMs + attempt * delayStepMs);
    }
  }

  const error = new Error(
    'Echoo has not received the post-master studio mix yet. Confirm the Host Mic and Audience Output meters are moving, then try Go Live again.'
  );
  error.code = 'CREATOR_AUDIO_NOT_PUBLISHED';
  error.status = 409;
  throw error;
}
