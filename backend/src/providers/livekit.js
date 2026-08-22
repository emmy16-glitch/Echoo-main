import { randomUUID } from 'crypto';
import {
  AccessToken,
  RoomServiceClient,
  EgressClient,
  IngressClient,
} from 'livekit-server-sdk';

// LiveKit participant JWT lifetime. Kept short enough that a leaked token is
// usable for only a bounded window, and long enough to survive a live session
// plus reconnect jitter. Both clients re-fetch tokens on every join or
// reconnect, so sessions longer than this simply reissue automatically.
function resolveTokenTtl() {
  return Number(process.env.LIVEKIT_TOKEN_TTL_MINUTES || 120) * 60;
}

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    const error = new Error(`${name} is not configured`);
    error.code = 'LIVEKIT_CONFIG_MISSING';
    error.status = 503;
    throw error;
  }
  return value;
}

function normalizeApiUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);

    if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
    if (parsed.protocol === 'wss:') parsed.protocol = 'https:';

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('LiveKit server URL must use ws://, wss://, http://, or https://');
    }

    return parsed.toString().replace(/\/$/, '');
  } catch (cause) {
    const error = new Error(
      `LIVEKIT_URL is invalid. Expected a LiveKit host such as wss://your-project.livekit.cloud. ${cause?.message || ''}`.trim()
    );
    error.code = 'LIVEKIT_CONFIG_INVALID';
    error.status = 503;
    throw error;
  }
}

function normalizeWebsocketUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);

    if (parsed.protocol === 'http:') parsed.protocol = 'ws:';
    if (parsed.protocol === 'https:') parsed.protocol = 'wss:';

    if (!['ws:', 'wss:'].includes(parsed.protocol)) {
      throw new Error('LiveKit public URL must use ws:// or wss://');
    }

    return parsed.toString().replace(/\/$/, '');
  } catch (cause) {
    const error = new Error(
      `LIVEKIT_PUBLIC_URL is invalid. Expected a websocket URL such as wss://your-project.livekit.cloud. ${cause?.message || ''}`.trim()
    );
    error.code = 'LIVEKIT_CONFIG_INVALID';
    error.status = 503;
    throw error;
  }
}

function roomNameFor(broadcastId) {
  return `echoo-broadcast-${broadcastId}`;
}

function getConfig() {
  const configuredUrl = requireEnv('LIVEKIT_URL');
  const apiKey = requireEnv('LIVEKIT_API_KEY');
  const apiSecret = requireEnv('LIVEKIT_API_SECRET');
  const apiUrl = normalizeApiUrl(configuredUrl);
  const publicUrl = normalizeWebsocketUrl(
    process.env.LIVEKIT_PUBLIC_URL || configuredUrl
  );

  return {
    url: configuredUrl,
    apiUrl,
    publicUrl,
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

function ingressClient() {
  const { apiUrl, apiKey, apiSecret } = getConfig();
  return new IngressClient(apiUrl, apiKey, apiSecret);
}

function serviceError(action, cause) {
  if (
    cause?.code === 'LIVEKIT_CONFIG_MISSING' ||
    cause?.code === 'LIVEKIT_CONFIG_INVALID'
  ) {
    return cause;
  }

  const detail = String(cause?.message || cause || '').trim();
  const error = new Error(
    `LiveKit ${action} failed. Check LIVEKIT_URL, LIVEKIT_PUBLIC_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET, and confirm this machine can reach the configured LiveKit project.${detail ? ` ${detail}` : ''}`
  );
  error.code = 'LIVEKIT_UNAVAILABLE';
  error.status = 503;
  error.cause = cause;
  return error;
}


// Factory overrides exist so test suites can substitute fake SDK clients
// without network access. Production code never assigns these.
let roomClientOverride = roomClient;
let egressClientOverride = egressClient;
let ingressClientOverride = ingressClient;

// eslint-disable-next-line no-unused-vars
function setClientOverrides({ room, egress, ingress } = {}) {
  if (room !== undefined) roomClientOverride = room;
  if (egress !== undefined) egressClientOverride = egress;
  if (ingress !== undefined) ingressClientOverride = ingress;
  return function clearClientOverrides() {
    roomClientOverride = roomClient;
    egressClientOverride = egressClient;
    ingressClientOverride = ingressClient;
  };
}

// Clients consumed below must route through the (possibly overridden)
// factories so tests can intercept SDK calls.
const LiveKitProvider = {
  getRoomName(broadcastId) {
    return roomNameFor(broadcastId);
  },

  getPublicUrl() {
    return getConfig().publicUrl;
  },

  getSafeConfiguration() {
    const { apiUrl, publicUrl } = getConfig();
    return {
      apiUrl,
      publicUrl,
      cloud: /\.livekit\.cloud$/i.test(new URL(apiUrl).hostname),
    };
  },

  async checkHealth() {
    try {
      const client = roomClientOverride();
      await client.listRooms([]);
      return {
        reachable: true,
        ...this.getSafeConfiguration(),
      };
    } catch (error) {
      throw serviceError('health check', error);
    }
  },

  async createRoom(broadcastId) {
    const name = roomNameFor(broadcastId);

    try {
      const client = roomClientOverride();
      const existing = await client.listRooms([name]);

      if (Array.isArray(existing) && existing.length > 0) {
        return existing[0];
      }

      return await client.createRoom({
        name,
        emptyTimeout: 10 * 60,
        maxParticipants: 5000,
        metadata: JSON.stringify({
          application: 'echoo',
          broadcastId: String(broadcastId),
          mediaType: 'audio',
        }),
      });
    } catch (error) {
      throw serviceError('room setup', error);
    }
  },

  async getParticipants(broadcastId) {
    const name = roomNameFor(broadcastId);

    try {
      return await roomClientOverride().listParticipants(name);
    } catch (error) {
      const message = String(error?.message || error || '');

      if (
        /not found|does not exist|room.*missing/i.test(message)
      ) {
        return [];
      }

      throw serviceError('participant lookup', error);
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
        userId: String(userId),
        broadcastId: String(broadcastId),
      }),
      ttl: resolveTokenTtl(),
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

    // A LiveKit participant identity must be unique inside a room. Never reuse
    // the raw account ID for listeners: doing so can evict a Creator using the
    // same account in another tab/device, and two listener devices can evict
    // each other. Keep the real account ID in metadata instead.
    const sessionSuffix = randomUUID().replace(/-/g, '').slice(0, 10);
    const listenerIdentity = `listener-${String(userId)}-${sessionSuffix}`;

    const token = new AccessToken(apiKey, apiSecret, {
      identity: listenerIdentity,
      name: String(displayName || 'Echoo Listener'),
      metadata: JSON.stringify({
        role: 'listener',
        userId: String(userId),
        broadcastId: String(broadcastId),
      }),
      ttl: resolveTokenTtl(),
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
    const client = egressClientOverride();

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
    return egressClientOverride().stopEgress(String(egressId));
  },

  async stopIngress(ingressId) {
    if (!ingressId) return null;

    try {
      return await ingressClientOverride().deleteIngress(String(ingressId));
    } catch (error) {
      // Removing a finished prerecorded ingress must never fail an end
      // broadcast request; the URL-input source cannot republish anything
      // once the room it publishes into is deleted anyway.
      console.warn(
        `LiveKit ingress cleanup warning for ${ingressId}:`,
        error?.message || error
      );
      return null;
    }
  },

  async endRoom(broadcastId) {
    const name = roomNameFor(broadcastId);

    try {
      await roomClientOverride().deleteRoom(name);
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

export { setClientOverrides };

export default LiveKitProvider;
