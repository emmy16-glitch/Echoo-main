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
