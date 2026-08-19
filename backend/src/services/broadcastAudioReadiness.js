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
    const participants = await LiveKitProvider.getParticipants(broadcastId);
    const creator = participants.find((participant) =>
      isCreatorParticipant(participant, userId)
    );

    if (creator) {
      const tracks = Array.isArray(creator.tracks) ? creator.tracks : [];
      const programAudio = tracks.find((track) =>
        isEchooProgramAudioTrack(track)
      );

      if (programAudio) {
        return {
          participantSid: creator.sid || null,
          participantIdentity: creator.identity || null,
          trackSid: programAudio.sid || null,
          trackName: programAudio.name || null,
          mimeType: programAudio.mimeType || null,
        };
      }
    }

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
