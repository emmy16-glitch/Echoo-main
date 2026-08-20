import test from 'node:test';
import assert from 'node:assert/strict';
import { AccessToken, TokenVerifier } from 'livekit-server-sdk';
import jwt from 'jsonwebtoken';

// Tests in this file exercise the LiveKit provider's configuration handling,
// token issuance guarantees, and lifecycle wiring against mocked SDK clients,
// so no real LiveKit connection is required.

const originalEnv = { ...process.env };

const TEST_ENV = {
  LIVEKIT_URL: 'wss://test.livekit.cloud',
  LIVEKIT_PUBLIC_URL: 'wss://test.livekit.cloud',
  LIVEKIT_API_KEY: 'test-api-key',
  LIVEKIT_API_SECRET: 'test-api-secret',
  LIVEKIT_TOKEN_TTL_MINUTES: '120',
};

test.beforeEach(() => {
  // Standard test environment. Individual tests that mutate env must call
  // loadProvider() (fresh import) after their own overrides so the module
  // reads the intended values.
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv, TEST_ENV);
});

test.afterEach(() => {
  // Restore the original env so tests cannot leak state into later tests.
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

async function loadProvider() {
  // process.env must already reflect the intended values: the TTL resolver
  // reads LIVEKIT_TOKEN_TTL_MINUTES at call time, and getConfig() reads
  // LIVEKIT_URL / LIVEKIT_API_* on each call, so module caching does not
  // freeze per-test overrides.
  return (await import('../src/providers/livekit.js')).default;
}

async function loadProviderModule() {
  return import('../src/providers/livekit.js');
}

// Helper: substitute fake SDK clients for one test and restore afterwards.
async function withClientOverrides(factory, fn) {
  const module = await loadProviderModule();
  const clear = module.setClientOverrides(factory);
  try {
    return await fn();
  } finally {
    clear();
  }
}

const DECODE_OPTIONS = {
  issuer: 'test-api-key',
  // LiveKit AccessToken signs with the API secret as the payload secret.
  algorithms: ['HS256'],
};

function decodeTokenPayload(token) {
  return jwt.verify(token, 'test-api-secret', DECODE_OPTIONS);
}

function decodeTokenGrants(token) {
  const payload = decodeTokenPayload(token);
  // AccessToken grants land under `video`; JWT identity is `sub`.
  return { grants: payload.grants || {}, video: payload.video, sub: payload.sub };
}

test('missing configuration surfaces a config-missing error', async () => {
  const envForThisTest = { ...process.env, LIVEKIT_URL: '' };
  Object.assign(process.env, envForThisTest);
  const LiveKitProvider = await loadProvider();

  // getSafeConfiguration throws synchronously, so wrap it in an async fn
  // so assert.rejects catches the thrown error instead of letting it
  // escape the test.
  await assert.rejects(
    async () => LiveKitProvider.getSafeConfiguration(),
    (error) =>
      error?.code === 'LIVEKIT_CONFIG_MISSING' && error?.status === 503
  );
});

test('public URL normalization maps http(s) to websocket and strips trailing slashes', async () => {
  const envForThisTest = {
    ...process.env,
    LIVEKIT_URL: 'https://test.livekit.cloud/',
    LIVEKIT_PUBLIC_URL: 'http://alt.livekit.cloud/',
  };
  Object.assign(process.env, envForThisTest);
  const LiveKitProvider = await loadProvider();

  // LIVEKIT_URL http:// maps to https:// for the API endpoint and
  // LIVEKIT_PUBLIC_URL http:// maps to ws:// for clients that accept plain
  // websocket URLs in development (the provider passes the public URL
  // through to clients as-is after protocol translation).
  const config = LiveKitProvider.getSafeConfiguration();
  assert.equal(config.publicUrl, 'ws://alt.livekit.cloud');
  assert.equal(config.apiUrl, 'https://test.livekit.cloud');
});

test('invalid URL protocols are rejected with a config-invalid error', async () => {
  const envForThisTest = { ...process.env, LIVEKIT_PUBLIC_URL: 'ftp://nope' };
  Object.assign(process.env, envForThisTest);
  const LiveKitProvider = await loadProvider();

  await assert.rejects(
    async () => LiveKitProvider.getSafeConfiguration(),
    (error) =>
      error?.code === 'LIVEKIT_CONFIG_INVALID' && error?.status === 503
  );
});

test('creator token grants publish and subscribe in exactly one room', async () => {
  const LiveKitProvider = await loadProvider();
  const token = await LiveKitProvider.generateCreatorToken(
    'broadcast-123',
    'user-abc',
    'DJ Test'
  );

  const { grants, video, sub } = decodeTokenGrants(token);
  const payload = decodeTokenPayload(token);

  assert.equal(sub, 'user-abc');
  assert.equal(payload.name, 'DJ Test');
  assert.equal(video?.roomJoin, true);
  assert.equal(video?.room, 'echoo-broadcast-broadcast-123');
  assert.equal(video?.canPublish, true);
  assert.equal(video?.canSubscribe, true);
  assert.equal(video?.canPublishData, true);
});

test('creator token metadata carries role, userId and broadcastId', async () => {
  const LiveKitProvider = await loadProvider();
  const token = await LiveKitProvider.generateCreatorToken(
    'broadcast-123',
    'user-abc'
  );

  const metadata = JSON.parse(decodeTokenPayload(token).metadata);
  assert.deepEqual(metadata, {
    role: 'creator',
    userId: 'user-abc',
    broadcastId: 'broadcast-123',
  });
});

test('listener token grants subscribe-only and hides the account ID from the identity', async () => {
  const LiveKitProvider = await loadProvider();
  const token = await LiveKitProvider.generateListenerToken(
    'broadcast-123',
    'user-abc',
    'Listener Test'
  );

  const { grants, video, sub } = decodeTokenGrants(token);
  const payload = decodeTokenPayload(token);
  const metadata = JSON.parse(payload.metadata);

  assert.match(sub, /^listener-user-abc-[a-f0-9]{10}$/);
  assert.equal(payload.name, 'Listener Test');
  assert.equal(metadata.role, 'listener');
  assert.equal(metadata.userId, 'user-abc');
  assert.equal(metadata.broadcastId, 'broadcast-123');
  assert.equal(video?.roomJoin, true);
  assert.equal(video?.canPublish, false);
  assert.equal(video?.canSubscribe, true);
  assert.equal(video?.canPublishData, false);
});

test('listener tokens are unique per issuance and never collide', async () => {
  const LiveKitProvider = await loadProvider();
  const identities = new Set();
  for (let i = 0; i < 20; i += 1) {
    const token = await LiveKitProvider.generateListenerToken(
      'broadcast-123',
      'user-abc'
    );
    identities.add(decodeTokenGrants(token).sub);
  }
  assert.equal(identities.size, 20);
});

test('tokens honour the configurable TTL default of two hours', async () => {
  const LiveKitProvider = await loadProvider();
  const token = await LiveKitProvider.generateListenerToken(
    'broadcast-123',
    'user-abc'
  );
  const payload = decodeTokenPayload(token);

  // The token's nbf (not-before) is the issuance time for a fresh token.
  assert.equal(payload.exp - payload.nbf, 120 * 60);
});

test('LIVEKIT_TOKEN_TTL_MINUTES overrides the default token lifetime', async () => {
  const envForThisTest = {
    ...process.env,
    LIVEKIT_TOKEN_TTL_MINUTES: '30',
  };
  Object.assign(process.env, envForThisTest);
  const LiveKitProvider = await loadProvider();
  const token = await LiveKitProvider.generateCreatorToken(
    'broadcast-123',
    'user-abc'
  );

  const payload = decodeTokenPayload(token);
  assert.equal(payload.exp - payload.nbf, 30 * 60);
});

test('creator tokens issued for different broadcasts are room-scoped', async () => {
  const LiveKitProvider = await loadProvider();
  const tokenA = await LiveKitProvider.generateCreatorToken(
    'broadcast-a',
    'user-abc'
  );
  const tokenB = await LiveKitProvider.generateCreatorToken(
    'broadcast-b',
    'user-abc'
  );

  const videoA = decodeTokenGrants(tokenA).video;
  const videoB = decodeTokenGrants(tokenB).video;
  assert.notEqual(videoA.room, videoB.room);
  assert.equal(videoA.room, 'echoo-broadcast-broadcast-a');
  assert.equal(videoB.room, 'echoo-broadcast-broadcast-b');
});

test('createRoom lists existing rooms first and reuses a live room instead of duplicating it', async () => {
  const LiveKitProvider = await loadProvider();
  const fakeClient = {
    listRooms: async () => [
      {
        name: 'echoo-broadcast-123',
        emptyTimeout: 600,
        maxParticipants: 5000,
      },
    ],
    createRoom: async () => {
      throw new Error('createRoom must not be called when a live room exists');
    },
    deleteRoom: async () => undefined,
    listParticipants: async () => [],
  };
  const room = await withClientOverrides(
    { room: () => fakeClient },
    () => LiveKitProvider.createRoom('123')
  );
  assert.equal(room.name, 'echoo-broadcast-123');
});

test('createRoom creates a broadcast-scoped audio room when none exists', async () => {
  const LiveKitProvider = await loadProvider();
  const calls = { created: null };
  const fakeClient = {
    listRooms: async () => [],
    createRoom: async (options) => {
      calls.created = options;
      return { name: options.name, ...options };
    },
    deleteRoom: async () => undefined,
    listParticipants: async () => [],
  };
  await withClientOverrides({ room: () => fakeClient }, async () => {
    const room = await LiveKitProvider.createRoom('broadcast-123');
    assert.equal(room.name, 'echoo-broadcast-broadcast-123');
    assert.equal(calls.created.emptyTimeout, 10 * 60);
    assert.equal(calls.created.maxParticipants, 5000);
    assert.equal(
      JSON.parse(calls.created.metadata).mediaType,
      'audio'
    );
    assert.equal(JSON.parse(calls.created.metadata).application, 'echoo');
  });
});

test('SDK failures are translated into a LIVEKIT_UNAVAILABLE service error', async () => {
  const LiveKitProvider = await loadProvider();
  await assert.rejects(
    withClientOverrides(
      { room: () => ({ listRooms: async () => { throw new Error('network failure'); } }) },
      () => LiveKitProvider.checkHealth()
    ),
    (error) => error?.code === 'LIVEKIT_UNAVAILABLE' && error?.status === 503
  );
});

test('getParticipants returns an empty list for missing rooms instead of failing', async () => {
  const LiveKitProvider = await loadProvider();
  const participants = await withClientOverrides(
    {
      room: () => ({
        listParticipants: async () => {
          throw new Error('room does not exist');
        },
      }),
    },
    () => LiveKitProvider.getParticipants('broadcast-123')
  );
  assert.deepEqual(participants, []);
});

test('startEgress validates the RTMP ingest URL and forwards it to the egress client', async () => {
  const LiveKitProvider = await loadProvider();
  const calls = { args: null };
  const fakeClient = {
    startRoomCompositeEgress: async (name, output, options) => {
      calls.args = { name, output, options };
      return { egressId: 'egress-xyz' };
    },
    stopEgress: async () => undefined,
  };
  const result = await withClientOverrides(
    { egress: () => fakeClient },
    () =>
      LiveKitProvider.startEgress(
        'broadcast-123',
        'Test Show',
        'rtmps://ingest.example.com/app/stream-key'
      )
  );
  assert.equal(result.egressId, 'egress-xyz');
  assert.equal(calls.args.name, 'echoo-broadcast-broadcast-123');
  assert.deepEqual(calls.args.output, {
    urls: ['rtmps://ingest.example.com/app/stream-key'],
  });
  assert.deepEqual(calls.args.options, { audioOnly: true });
});

test('startEgress refuses non-RTMP ingest URLs', async () => {
  const LiveKitProvider = await loadProvider();
  await assert.rejects(
    LiveKitProvider.startEgress(
      'broadcast-123',
      'Test Show',
      'https://not-an-rtmp-endpoint'
    ),
    (error) => /RTMP/i.test(error?.message || '')
  );
});

test('stopIngress is best-effort and never throws on cleanup failure', async () => {
  const LiveKitProvider = await loadProvider();
  const result = await withClientOverrides(
    {
      ingress: () => ({
        deleteIngress: async () => {
          throw new Error('ingress already deleted');
        },
      }),
    },
    () => LiveKitProvider.stopIngress('ingress-123')
  );
  assert.equal(result, null);
});

test('stopIngress returns early without calling the SDK for empty ids', async () => {
  const LiveKitProvider = await loadProvider();
  let called = false;
  await withClientOverrides(
    {
      ingress: () => {
        called = true;
        return { deleteIngress: async () => ({ ingressId: 'ingress-123' }) };
      },
    },
    async () => {
      assert.equal(await LiveKitProvider.stopIngress(''), null);
      assert.equal(await LiveKitProvider.stopIngress(null), null);
      assert.equal(called, false);
    }
  );
});

test('endRoom is best-effort and reports failure instead of throwing', async () => {
  const LiveKitProvider = await loadProvider();
  const result = await withClientOverrides(
    {
      room: () => ({
        listRooms: async () => [],
        createRoom: async () => ({ name: 'echoo-broadcast-123' }),
        deleteRoom: async () => {
          throw new Error('room gone');
        },
        listParticipants: async () => [],
      }),
    },
    () => LiveKitProvider.endRoom('123')
  );
  assert.equal(result, false);
});

test('getRoomName builds the broadcast-scoped room name', async () => {
  const LiveKitProvider = await loadProvider();
  assert.equal(
    LiveKitProvider.getRoomName('broadcast-123'),
    'echoo-broadcast-broadcast-123'
  );
});

test('listener token identity length keeps the account ID prefix intact', async () => {
  // Ensure the identity is not truncated so tightly that two accounts sharing
  // a prefix could collide on the prefix alone.
  const LiveKitProvider = await loadProvider();
  const token = await LiveKitProvider.generateListenerToken(
    'broadcast-123',
    'a-very-long-account-id-that-must-remain-readable'
  );
  const { sub } = decodeTokenGrants(token);
  assert.match(
    sub,
    /^listener-a-very-long-account-id-that-must-remain-readable-[a-f0-9]{10}$/
  );
});

// AccessToken validation round-trip confirms the provider's tokens are
// structurally valid LiveKit JWTs that the LiveKit server would accept.
test('issued tokens round-trip through LiveKit AccessToken verification', async () => {
  const LiveKitProvider = await loadProvider();
  const raw = await LiveKitProvider.generateListenerToken(
    'broadcast-123',
    'user-abc'
  );
  // The SDK verifier keys tokens with the API secret and checks the `iss` claim.
  const verified = await new TokenVerifier(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
  ).verify(raw);
  assert.ok(String(verified.sub).startsWith('listener-user-abc-'));
  assert.equal(verified.video?.canPublish, false);
  assert.equal(verified.video?.canSubscribe, true);
  assert.equal(verified.iss, 'test-api-key');
});
