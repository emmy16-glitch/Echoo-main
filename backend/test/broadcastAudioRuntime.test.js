import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import {
  escapeRegexLiteral,
  validateBroadcastListQuery,
} from '../src/middleware/broadcastQueryValidation.js';
import {
  isCreatorParticipant,
  isEchooProgramAudioTrack,
  parseParticipantMetadata,
  waitForCreatorProgramAudio,
} from '../src/services/broadcastAudioReadiness.js';
import { CreatorBroadcastLease } from '../src/services/creatorBroadcastLease.js';
import LiveKitProvider from '../src/providers/livekit.js';
import { matchesUploadedFileSignature } from '../src/routes/audioRoutes.js';
import { normalizeApiError } from '../src/app.js';
import {
  parseSingleByteRange,
} from '../src/controllers/audioStreamController.js';
import {
  audioStreamTtlSeconds,
  createAudioStreamToken,
  verifyAudioStreamToken,
} from '../src/services/audioStreamAccess.js';
import Audio from '../src/models/Audio.js';

const mockResponse = () => {
  const result = { statusCode: 200, body: null };
  return {
    result,
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
};

test('broadcast search text is escaped as a literal Mongo regex', () => {
  assert.equal(
    escapeRegexLiteral('news.*(live)+[x]?'),
    'news\\.\\*\\(live\\)\\+\\[x\\]\\?'
  );
});

test('broadcast query middleware rejects invalid IDs and date ranges', () => {
  const invalidIdResponse = mockResponse();
  let nextCalls = 0;
  validateBroadcastListQuery(
    { query: { stationId: 'not-an-object-id' } },
    invalidIdResponse,
    () => { nextCalls += 1; }
  );
  assert.equal(invalidIdResponse.result.statusCode, 400);
  assert.equal(invalidIdResponse.result.body.error.code, 'INVALID_STATION_ID');
  assert.equal(nextCalls, 0);

  const invalidDateResponse = mockResponse();
  validateBroadcastListQuery(
    {
      query: {
        startDate: '2026-08-20T12:00:00.000Z',
        endDate: '2026-08-19T12:00:00.000Z',
      },
    },
    invalidDateResponse,
    () => { nextCalls += 1; }
  );
  assert.equal(invalidDateResponse.result.statusCode, 400);
  assert.equal(invalidDateResponse.result.body.error.code, 'INVALID_DATE_RANGE');
});

test('broadcast query middleware normalizes literal search and continues', () => {
  const req = {
    query: {
      stationId: new mongoose.Types.ObjectId().toString(),
      status: 'live',
      type: 'live',
      search: 'DJ (night).*',
    },
  };
  const res = mockResponse();
  let called = false;

  validateBroadcastListQuery(req, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(req.query.search, 'DJ \\(night\\)\\.\\*');
});

test('creator participant matching is identity-safe and metadata-safe', () => {
  const userId = new mongoose.Types.ObjectId().toString();
  assert.equal(
    isCreatorParticipant({ identity: userId, metadata: '' }, userId),
    true
  );
  assert.equal(
    isCreatorParticipant(
      {
        identity: 'other-identity',
        metadata: JSON.stringify({ role: 'creator', userId }),
      },
      userId
    ),
    true
  );
  assert.equal(
    isCreatorParticipant(
      {
        identity: 'other-identity',
        metadata: JSON.stringify({ role: 'listener', userId }),
      },
      userId
    ),
    false
  );
  assert.deepEqual(parseParticipantMetadata({ metadata: '{bad json' }), {});
});

test('confirm-live accepts only the named Echoo post-master program track', () => {
  assert.equal(
    isEchooProgramAudioTrack({
      name: 'echoo-studio-mix',
      mimeType: 'audio/opus',
      muted: false,
    }, { allowSynthetic: false }),
    true
  );

  assert.equal(
    isEchooProgramAudioTrack({
      name: 'microphone',
      mimeType: 'audio/opus',
      muted: false,
    }, { allowSynthetic: false }),
    false
  );

  assert.equal(
    isEchooProgramAudioTrack({
      name: 'echoo-studio-mix',
      mimeType: 'audio/opus',
      muted: true,
    }, { allowSynthetic: false }),
    false
  );

  assert.equal(
    isEchooProgramAudioTrack({
      name: 'echoo-dev-test-audio',
      mimeType: 'audio/opus',
      muted: false,
    }, { allowSynthetic: false }),
    false
  );

  assert.equal(
    isEchooProgramAudioTrack({
      name: 'echoo-dev-test-audio',
      mimeType: 'audio/opus',
      muted: false,
    }, { allowSynthetic: true }),
    true
  );
});

test('audio readiness retries propagation and returns the creator program track', async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const original = LiveKitProvider.getParticipants;
  let calls = 0;

  LiveKitProvider.getParticipants = async () => {
    calls += 1;
    if (calls === 1) {
      return [{
        identity: userId,
        metadata: JSON.stringify({ role: 'creator', userId }),
        tracks: [{ name: 'microphone', mimeType: 'audio/opus', muted: false }],
      }];
    }
    return [{
      sid: 'PA_creator',
      identity: userId,
      metadata: JSON.stringify({ role: 'creator', userId }),
      tracks: [{
        sid: 'TR_program',
        name: 'echoo-studio-mix',
        mimeType: 'audio/opus',
        muted: false,
      }],
    }];
  };

  try {
    const result = await waitForCreatorProgramAudio('broadcast-id', userId, {
      maxAttempts: 3,
      initialDelayMs: 0,
      delayStepMs: 0,
    });
    assert.equal(calls, 2);
    assert.equal(result.participantSid, 'PA_creator');
    assert.equal(result.trackSid, 'TR_program');
    assert.equal(result.trackName, 'echoo-studio-mix');
  } finally {
    LiveKitProvider.getParticipants = original;
  }
});

test('creator broadcast lease schema enforces one active lease and automatic expiry', () => {
  const indexes = CreatorBroadcastLease.schema.indexes();
  assert.ok(
    indexes.some(([fields, options]) => fields.creator === 1 && options.unique === true),
    'creator lease must have a unique creator index'
  );
  assert.ok(
    indexes.some(([fields, options]) => fields.expiresAt === 1 && options.expireAfterSeconds === 0),
    'creator lease must have a TTL expiry index'
  );
});

test('uploaded file signature checks reject extension-only spoofing', () => {
  const wav = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
  ]);
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  assert.equal(
    matchesUploadedFileSignature({ originalname: 'master.wav' }, wav),
    true
  );
  assert.equal(
    matchesUploadedFileSignature({ originalname: 'fake.wav' }, Buffer.from('not-wave-data')),
    false
  );
  assert.equal(
    matchesUploadedFileSignature({ originalname: 'cover.png' }, png),
    true
  );
  assert.equal(
    matchesUploadedFileSignature({ originalname: 'cover.jpg' }, png),
    false
  );
});

test('audio byte-range parser supports full, open, suffix and bounded ranges', () => {
  assert.deepEqual(
    parseSingleByteRange(null, 1000),
    { start: 0, end: 999, partial: false }
  );
  assert.deepEqual(
    parseSingleByteRange('bytes=100-199', 1000),
    { start: 100, end: 199, partial: true }
  );
  assert.deepEqual(
    parseSingleByteRange('bytes=900-', 1000),
    { start: 900, end: 999, partial: true }
  );
  assert.deepEqual(
    parseSingleByteRange('bytes=-100', 1000),
    { start: 900, end: 999, partial: true }
  );
  assert.deepEqual(
    parseSingleByteRange('bytes=100-2000', 1000),
    { start: 100, end: 999, partial: true }
  );
  assert.equal(parseSingleByteRange('bytes=1000-', 1000), null);
  assert.equal(parseSingleByteRange('bytes=500-400', 1000), null);
  assert.equal(parseSingleByteRange('bytes=0-1,4-5', 1000), null);
  assert.equal(parseSingleByteRange('items=0-10', 1000), null);
});

test('audio stream tokens are scoped to one audio record and preserve owner scope', () => {
  const audioId = new mongoose.Types.ObjectId().toString();
  const otherAudioId = new mongoose.Types.ObjectId().toString();
  const ownerId = new mongoose.Types.ObjectId().toString();

  const publicSigned = createAudioStreamToken({
    audioId,
    access: 'public',
    duration: 3600,
  });
  const publicGrant = verifyAudioStreamToken(publicSigned.token, audioId);
  assert.equal(publicGrant.type, 'audio-stream');
  assert.equal(publicGrant.audioId, audioId);
  assert.equal(publicGrant.access, 'public');
  assert.throws(
    () => verifyAudioStreamToken(publicSigned.token, otherAudioId),
    (error) => error?.code === 'INVALID_AUDIO_STREAM_TOKEN'
  );

  const ownerSigned = createAudioStreamToken({
    audioId,
    access: 'owner',
    ownerId,
    duration: 120,
  });
  const ownerGrant = verifyAudioStreamToken(ownerSigned.token, audioId);
  assert.equal(ownerGrant.access, 'owner');
  assert.equal(ownerGrant.ownerId, ownerId);
  assert.ok(ownerSigned.ttl >= 15 * 60);
});

test('audio stream token TTL covers playback duration without becoming unbounded', () => {
  assert.ok(audioStreamTtlSeconds({ access: 'public', duration: 0 }) >= 15 * 60);
  assert.ok(audioStreamTtlSeconds({ access: 'owner', duration: 3600 }) >= 3600 + 15 * 60);
  assert.equal(
    audioStreamTtlSeconds({ access: 'public', duration: 24 * 60 * 60 }),
    12 * 60 * 60
  );
});

test('audio JSON hides storage keys and returns only scoped playback URLs', () => {
  const ownerId = new mongoose.Types.ObjectId();
  const publicAudio = new Audio({
    title: 'Public master',
    artist: ownerId,
    filename: 'secret-storage-name.wav',
    originalName: 'master.wav',
    fileSize: 1234,
    fileUrl: '/uploads/audio/secret-storage-name.wav',
    fileKey: 'secret-storage-name.wav',
    mimeType: 'audio/wav',
    duration: 300,
    isPublic: true,
  });

  const publicJson = publicAudio.toJSON();
  assert.equal(publicJson.filename, undefined);
  assert.equal(publicJson.fileKey, undefined);
  assert.match(
    publicJson.fileUrl,
    new RegExp(`^/api/audio/${publicAudio._id}/stream\\?token=`)
  );
  assert.doesNotMatch(publicJson.fileUrl, /uploads\/audio/);

  const privateAudio = new Audio({
    title: 'Private master',
    artist: ownerId,
    filename: 'private-storage-name.wav',
    originalName: 'private.wav',
    fileSize: 1234,
    fileUrl: '/uploads/audio/private-storage-name.wav',
    fileKey: 'private-storage-name.wav',
    mimeType: 'audio/wav',
    duration: 60,
    isPublic: false,
  });

  const privateJson = privateAudio.toJSON();
  assert.equal(privateJson.fileUrl, null);
  assert.equal(privateJson.filename, undefined);
  assert.equal(privateJson.fileKey, undefined);
});

test('API error normalizer maps database failures and hides unknown server details', () => {
  assert.deepEqual(
    normalizeApiError({ name: 'CastError', path: 'station' }),
    {
      status: 400,
      code: 'INVALID_VALUE',
      message: 'Invalid value for station',
    }
  );

  assert.deepEqual(
    normalizeApiError({ code: 11000 }),
    {
      status: 409,
      code: 'DUPLICATE_RESOURCE',
      message: 'A record with this unique value already exists.',
    }
  );

  assert.deepEqual(
    normalizeApiError({ status: 503, code: 'LIVEKIT_DOWN', message: 'LiveKit unavailable' }),
    {
      status: 503,
      code: 'LIVEKIT_DOWN',
      message: 'LiveKit unavailable',
    }
  );

  assert.deepEqual(
    normalizeApiError(new Error('database password should never reach client')),
    {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    }
  );
});
