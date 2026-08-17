import {
  AccessToken,
  RoomServiceClient,
  EgressClient,
} from 'livekit-server-sdk';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function roomNameFor(broadcastId) {
  return `echoo-broadcast-${broadcastId}`;
}

function getConfig() {
  const url = requireEnv('LIVEKIT_URL');
  const apiKey = requireEnv('LIVEKIT_API_KEY');
  const apiSecret = requireEnv('LIVEKIT_API_SECRET');

  const apiUrl = url
    .replace(/^ws:/i, 'http:')
    .replace(/^wss:/i, 'https:');

  return {
    url,
    apiUrl,
    apiKey,
    apiSecret,
  };
}

function roomClient() {
  const { apiUrl, apiKey, apiSecret } = getConfig();
  return new RoomServiceClient(apiUrl, apiKey, apiSecret);
}

function egressClient() {
  const { apiUrl, apiKey, apiSecret } = getConfig();
  return new EgressClient(apiUrl, apiKey, apiSecret);
}

const LiveKitProvider = {
  getRoomName(broadcastId) {
    return roomNameFor(broadcastId);
  },

  getPublicUrl() {
    return (
      process.env.LIVEKIT_PUBLIC_URL ||
      requireEnv('LIVEKIT_URL')
    );
  },

  async createRoom(broadcastId) {
    const name = roomNameFor(broadcastId);
    const client = roomClient();
    const existing = await client.listRooms([name]);

    if (Array.isArray(existing) && existing.length > 0) {
      return existing[0];
    }

    return client.createRoom({
      name,
      emptyTimeout: 10 * 60,
      maxParticipants: 5000,
      metadata: JSON.stringify({
        application: 'echoo',
        broadcastId: String(broadcastId),
        mediaType: 'audio',
      }),
    });
  },

  async getParticipants(broadcastId) {
    const name = roomNameFor(broadcastId);

    try {
      return await roomClient().listParticipants(name);
    } catch (error) {
      const message = String(error?.message || error || '');

      if (
        /not found|does not exist|room.*missing/i.test(message)
      ) {
        return [];
      }

      throw error;
    }
  },

  async generateCreatorToken(
    broadcastId,
    userId,
    displayName = 'Echoo Creator'
  ) {
    const { apiKey, apiSecret } = getConfig();
    const roomName = roomNameFor(broadcastId);

    const token = new AccessToken(apiKey, apiSecret, {
      identity: String(userId),
      name: String(displayName || 'Echoo Creator'),
      metadata: JSON.stringify({
        role: 'creator',
        broadcastId: String(broadcastId),
      }),
      ttl: '6h',
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return token.toJwt();
  },

  async generateListenerToken(
    broadcastId,
    userId,
    displayName = 'Echoo Listener'
  ) {
    const { apiKey, apiSecret } = getConfig();
    const roomName = roomNameFor(broadcastId);

    const token = new AccessToken(apiKey, apiSecret, {
      identity: String(userId),
      name: String(displayName || 'Echoo Listener'),
      metadata: JSON.stringify({
        role: 'listener',
        broadcastId: String(broadcastId),
      }),
      ttl: '6h',
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: false,
      canSubscribe: true,
      canPublishData: false,
    });

    return token.toJwt();
  },

  async startEgress(broadcastId, title, ingestUrl) {
    const name = roomNameFor(broadcastId);
    const client = egressClient();

    if (!/^rtmps?:\/\//i.test(ingestUrl)) {
      throw new Error(
        `Echoo LiveKit egress currently expects an RTMP/RTMPS OME ingest URL. Received: ${ingestUrl}`
      );
    }

    return client.startRoomCompositeEgress(
      name,
      { urls: [ingestUrl] },
      { audioOnly: true }
    );
  },

  async stopEgress(egressId) {
    if (!egressId) return null;
    return egressClient().stopEgress(String(egressId));
  },

  async endRoom(broadcastId) {
    const name = roomNameFor(broadcastId);

    try {
      await roomClient().deleteRoom(name);
      return true;
    } catch (error) {
      console.warn(
        `LiveKit room cleanup warning for ${name}:`,
        error?.message || error
      );
      return false;
    }
  },
};

export default LiveKitProvider;
