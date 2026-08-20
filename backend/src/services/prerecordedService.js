import Broadcast from '../models/Broadcast.js';
import Audio from '../models/Audio.js';
import Station from '../models/Station.js';
import LiveKitProvider from '../providers/livekit.js';
import OvenMediaProvider from '../providers/ovenmedia.js';
import { createAudioStreamToken } from '../services/audioStreamAccess.js';

/**
 * Publish a prerecorded (type: 'recorded') scheduled broadcast to listeners.
 *
 * The prerecorded audio file is pulled into the broadcast's LiveKit room by a
 * LiveKit `URL_INPUT` ingress, which streams the signed, owner-scoped playback
 * URL from the protected `/api/audio/:id/stream` endpoint. When OME relay is
 * enabled, a room-composite egress forwards the mixed program to OME.
 *
 * Expected Broadcast fields (see the Broadcast model):
 * - type: 'recorded' for prerecorded broadcasts
 * - scheduledAudioId: ObjectId ref to the Audio track to play (the schema is
 *   intentionally flexible, so the field is resolved defensively here)
 * - status transitions: scheduled -> starting -> live -> completed/failed
 */
const PRERECORDED_STATUS = 'recorded';

const ingressClient = () => {
  const { IngressClient } = (() => {
    // livekit-server-sdk exports IngressClient alongside RoomServiceClient and
    // EgressClient; import it lazily so models that never touch prerecorded
    // broadcasts do not pay for the extra module.
    let cached = null;
    return {
      get IngressClient() {
        if (!cached) {
          cached = require('livekit-server-sdk').IngressClient;
        }
        return cached;
      },
    };
  })();
  const { apiUrl, apiKey, apiSecret } = (() => {
    // Mirror LiveKitProvider's getConfig without re-exporting it.
    const url = String(process.env.LIVEKIT_URL || '').trim();
    return {
      apiUrl: url
        .replace(/^ws:\/\//i, 'http://')
        .replace(/^wss:\/\//i, 'https://')
        .replace(/\/$/, ''),
      apiKey: String(process.env.LIVEKIT_API_KEY || '').trim(),
      apiSecret: String(process.env.LIVEKIT_API_SECRET || '').trim(),
    };
  })();
  return new IngressClient(apiUrl, apiKey, apiSecret);
};

/**
 * Build an absolute, signed, owner-scoped playback URL for the track. The
 * signed URL is scoped to the track owner so private recordings can be
 * published by their creator without ever exposing a permanent file path.
 */
const ownerPlaybackUrl = async (audio, broadcast) => {
  if (!audio?._id) {
    const error = new Error('The scheduled audio track is missing');
    error.code = 'PRERECORDED_AUDIO_MISSING';
    error.status = 400;
    throw error;
  }
  if (String(audio.artist || '') !== String(broadcast.creator || '')) {
    const error = new Error(
      'The scheduled track does not belong to this broadcast creator'
    );
    error.code = 'PRERECORDED_AUDIO_FORBIDDEN';
    error.status = 403;
    throw error;
  }
  const base = (() => {
    const configured = String(process.env.ECHOO_API_PUBLIC_URL || '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    // Fall back to the self-host so scheduled ingestion still works even when
    // the public URL is not configured (the /stream endpoint authorizes every
    // request against current visibility, so a leaked URL still cannot open a
    // private or deleted track).
    const port = Number(process.env.PORT || '5001');
    const host =
      process.env.ECHOO_API_HOST ||
      (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '127.0.0.1');
    return `http://${host}:${port}`;
  })();
  const { token } = createAudioStreamToken({
    audioId: audio._id,
    access: 'owner',
    ownerId: String(broadcast.creator || ''),
    duration: audio.duration,
  });
  const path = `/api/audio/${encodeURIComponent(String(audio._id))}/stream?token=${encodeURIComponent(token)}`;
  return `${base}${path}`;
};

/**
 * Resolve the scheduled audio track. The Broadcast schema keeps scheduled
 * audio flexible (`scheduledAudioId` is not a hard schema field), so a track
 * id stored in `scheduledAudioId`, `audioId` or `recordingUrl` (legacy) is
 * accepted.
 */
const resolveScheduledAudio = async (broadcast) => {
  const audioId =
    String(broadcast.scheduledAudioId || broadcast.audioId || '').trim() ||
    String(broadcast.recordingUrl || '').trim();
  if (!audioId) return null;
  return Audio.findOne({ _id: audioId, isDeleted: false }).select(
    '_id artist title duration isPublic filename fileSize'
  );
};

const mediaRelayMode = () =>
  String(process.env.MEDIA_RELAY_MODE || 'livekit-only').trim().toLowerCase();

const roomNameFor = (broadcastId) => `echoo-broadcast-${broadcastId}`;

const ingestParticipantIdentity = (broadcastId) =>
  `echoo-prerecorded-ingest-${broadcastId}`;

export async function processPrerecordedBroadcast(broadcastId) {
  try {
    const broadcast = await Broadcast.findById(broadcastId).populate(
      'station',
      'name'
    );

    if (!broadcast) {
      const error = new Error('Broadcast not found');
      error.code = 'BROADCAST_NOT_FOUND';
      error.status = 404;
      throw error;
    }

    if (broadcast.type !== PRERECORDED_STATUS) {
      const error = new Error(
        `Broadcast type must be "${PRERECORDED_STATUS}" to publish prerecorded audio. Received: ${broadcast.type}`
      );
      error.code = 'INVALID_BROADCAST_TYPE';
      error.status = 400;
      throw error;
    }

    const audio = await resolveScheduledAudio(broadcast);
    if (!audio) {
      const error = new Error(
        'No scheduled audio track is attached to this broadcast'
      );
      error.code = 'PRERECORDED_AUDIO_MISSING';
      error.status = 400;
      throw error;
    }

    if (broadcast.status !== 'scheduled' && broadcast.status !== 'failed') {
      const error = new Error(
        `Cannot publish a prerecorded broadcast with status ${broadcast.status}`
      );
      error.code = 'INVALID_BROADCAST_STATE';
      error.status = 409;
      throw error;
    }

    const playbackUrl = await ownerPlaybackUrl(audio, broadcast);

    // 1. Prepare the LiveKit room for the broadcast.
    const room = await LiveKitProvider.createRoom(broadcastId);

    broadcast.status = 'starting';
    broadcast.failureReason = null;
    broadcast.livekitRoomName = room.name;
    broadcast.startedAt = null;
    broadcast.endedAt = null;
    broadcast.listenerCount = 0;
    await broadcast.save();

    // 2. Attach the scheduled track as a URL-input ingress so LiveKit pulls
    // the signed audio stream into the room as program audio.
    let ingressId = null;
    try {
      const ingress = await ingressClient().createIngress(2 /* URL_INPUT */, {
        name: `echoo-prerecorded-${broadcastId}`,
        roomName: roomNameFor(broadcastId),
        participantIdentity: ingestParticipantIdentity(broadcastId),
        participantName: `${broadcast.title} (prerecorded)`,
        participantMetadata: JSON.stringify({
          application: 'echoo',
          broadcastId: String(broadcastId),
          role: 'prerecorded-ingest',
          audioId: String(audio._id),
        }),
        url: playbackUrl,
        enableTranscoding: true,
        audio: {
          name: 'echoo-studio-mix',
          bitrate: 96000,
          disableDtx: false,
        },
        video: { isVideo: false },
      });
      ingressId = ingress?.ingressId || null;
    } catch (cause) {
      throw Object.assign(
        new Error(`LiveKit prerecorded ingress setup failed: ${cause?.message || cause}`),
        { code: 'PRERECORDED_INGRESS_FAILED', status: 503, cause }
      );
    }

    // 3. Relay the mixed program to OME only when OME is actually configured.
    // Echoo currently runs livekit-only (LIVEKIT_URL/LIVEKIT_PUBLIC_URL), and
    // OME_API_AUTH is not set in the environment templates, so the OME egress
    // path stays dormant until a real OME deployment is configured.
    let egressId = null;
    const liveKitOnly =
      mediaRelayMode() === 'livekit-only' ||
      !String(process.env.OME_API_AUTH || '').trim();
    if (!liveKitOnly) {
      const ingestUrl = OvenMediaProvider.getIngestUrl(broadcastId, 'rtmp');
      const egress = await LiveKitProvider.startEgress(
        broadcastId,
        broadcast.title,
        ingestUrl
      );
      egressId = egress?.egressId || null;
    }

    broadcast.livekitIngressId = ingressId;
    broadcast.livekitEgressId = egressId;
    broadcast.status = 'live';
    broadcast.startedAt = broadcast.startedAt || new Date();
    await broadcast.save();

    // 4. Wait for the ingress to publish program audio into the room.
    let audioReady = false;
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const participants = await LiveKitProvider.getParticipants(broadcastId);
      audioReady = participants.some((participant) =>
        String(participant?.identity || '') ===
        ingestParticipantIdentity(broadcastId)
      );
      if (audioReady) break;
    }

    if (!audioReady) {
      broadcast.status = 'failed';
      broadcast.failureReason =
        'Prerecorded ingress did not publish program audio in time';
      await broadcast.save();
      throw Object.assign(
        new Error('Prerecorded ingress did not publish program audio in time'),
        { code: 'PRERECORDED_INGRESS_TIMEOUT', status: 504 }
      );
    }

    // 5. Mark the station live once the prerecorded program is actually
    // publishing into the room, matching the live broadcast lifecycle.
    if (broadcast.station) {
      await Station.findByIdAndUpdate(broadcast.station, {
        isLive: true,
        listenerCount: 0,
      });
    }

    return {
      success: true,
      broadcast,
      audio: { id: audio._id, title: audio.title },
      ingressId,
      egressId,
      mediaMode: liveKitOnly ? 'livekit-direct' : 'livekit-ome',
      message: 'Prerecorded broadcast is now live',
    };
  } catch (error) {
    console.error('Prerecorded broadcast error:', error);

    const broadcast = await Broadcast.findById(broadcastId);
    if (broadcast) {
      broadcast.status = 'failed';
      broadcast.failureReason =
        String(error?.message || '') || 'Prerecorded broadcast failed';
      await broadcast.save();
    }

    throw error;
  }
}

export default {
  processPrerecordedBroadcast,
  resolveScheduledAudio,
};
