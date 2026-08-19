import LiveKitProvider from '../providers/livekit.js';

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const isCreator = (participant, userId) => {
  if (String(participant?.identity || '') === String(userId || '')) return true;

  try {
    const metadata = participant?.metadata
      ? JSON.parse(participant.metadata)
      : {};
    return metadata.role === 'creator' && String(metadata.userId || '') === String(userId || '');
  } catch {
    return false;
  }
};

const isAudioTrack = (track) => {
  const mimeType = String(track?.mimeType || '').toLowerCase();
  const name = String(track?.name || '').toLowerCase();

  // The current Echoo publisher names the program feed echoo-studio-mix.
  // mimeType covers LiveKit/protocol variations without relying on a numeric
  // TrackType enum value.
  return (
    mimeType.startsWith('audio/') ||
    name === 'echoo-studio-mix' ||
    name === 'echoo-dev-test-audio'
  );
};

export async function requireCreatorAudioPublished(req, res, next) {
  try {
    const { broadcastId } = req.params;
    const maxAttempts = 7;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const participants = await LiveKitProvider.getParticipants(broadcastId);
      const creator = participants.find((participant) =>
        isCreator(participant, req.userId)
      );

      if (creator) {
        const audioTracks = Array.isArray(creator.tracks)
          ? creator.tracks.filter(isAudioTrack)
          : [];
        const activeAudio = audioTracks.find((track) => track?.muted !== true);

        if (activeAudio) {
          req.livekitCreatorAudio = {
            participantSid: creator.sid || null,
            trackSid: activeAudio.sid || null,
            trackName: activeAudio.name || null,
            mimeType: activeAudio.mimeType || null,
          };
          next();
          return;
        }
      }

      if (attempt < maxAttempts - 1) {
        await wait(250 + attempt * 200);
      }
    }

    return res.status(409).json({
      error: {
        code: 'CREATOR_AUDIO_NOT_PUBLISHED',
        message:
          'The creator is connected, but Echoo has not received the studio audio track yet. Confirm the Host Mic and Master Output meters are moving, then try Go Live again.',
      },
    });
  } catch (error) {
    next(error);
  }
}

export default requireCreatorAudioPublished;
