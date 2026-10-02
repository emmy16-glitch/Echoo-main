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

const findProgramAudioInParticipants = (
  participants,
  userId,
  expectedTrackSid = ''
) => {
  const expectedSid = String(expectedTrackSid || '').trim();
  for (const participant of Array.isArray(participants) ? participants : []) {
    if (!isCreatorParticipant(participant, userId)) continue;
    const tracks = Array.isArray(participant.tracks) ? participant.tracks : [];
    const track = tracks.find((candidate) => {
      if (!isEchooProgramAudioTrack(candidate)) return false;
      if (!expectedSid) return true;
      return String(candidate?.sid || '').trim() === expectedSid;
    });
    if (track) return { participant, track };
  }
  return null;
};

export async function findCreatorProgramAudio(broadcastId, userId) {
  const participants = await LiveKitProvider.getParticipants(broadcastId);
  return findProgramAudioInParticipants(participants, userId);
}

export async function findCreatorProgramAudioByTrackSid(
  broadcastId,
  userId,
  trackSid
) {
  const sid = String(trackSid || '').trim();
  if (!sid) return null;
  const participants = await LiveKitProvider.getParticipants(broadcastId);
  return findProgramAudioInParticipants(participants, userId, sid);
}

export async function creatorProgramAudioIsPresent(broadcastId, userId) {
  return Boolean(await findCreatorProgramAudio(broadcastId, userId));
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
    const match = await findCreatorProgramAudio(broadcastId, userId);

    if (match) {
      return {
        participantSid: match.participant?.sid || null,
        participantIdentity: match.participant?.identity || null,
        trackSid: match.track?.sid || null,
        trackName: match.track?.name || null,
        mimeType: match.track?.mimeType || null,
      };
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
