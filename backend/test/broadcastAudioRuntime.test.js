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
} from '../src/services/broadcastAudioReadiness.js';
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

test('API error normalizer maps database failures to stable client statuses', () => {
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
});
