import mongoose from 'mongoose';
import TranscriptSegment from '../models/TranscriptSegment.js';
import TranscriptSession from '../models/TranscriptSession.js';

const MAX_TEXT_LENGTH = 8000;
const SOURCE_TYPES = new Set([
  'host_microphone', 'guest_microphone', 'music', 'screen_share',
  'system_audio', 'final_mix', 'unknown',
]);
const PROVIDERS = new Set(['whisper-flow', 'parakeet', 'gemini-live', 'gemini-transcribe']);

const transcriptError = (status, code, message) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const asObjectId = (value, label) => {
  if (!value || !mongoose.isValidObjectId(value)) {
    throw transcriptError(400, `INVALID_${label.toUpperCase()}_ID`, `Invalid ${label} ID`);
  }
  return new mongoose.Types.ObjectId(value);
};

export const normalizeTranscriptSegmentInput = (input = {}) => {
  const text = String(input.text || '').trim();
  const providerSegmentId = String(input.providerSegmentId || '').trim().slice(0, 160);
  const sequence = Number(input.sequence);
  const startMs = Math.max(0, Math.floor(Number(input.startMs) || 0));
  const endMs = Math.max(startMs, Math.floor(Number(input.endMs) || startMs));

  if (!text || text.length > MAX_TEXT_LENGTH || !providerSegmentId) {
    throw transcriptError(400, 'VALIDATION_ERROR', 'A valid transcript segment ID and text are required');
  }
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw transcriptError(400, 'VALIDATION_ERROR', 'Transcript sequence must be a non-negative integer');
  }

  const confidenceValue = Number(input.confidence);
  const requestedSource = String(input.sourceType || '').trim().toLowerCase();
  const sourceType = SOURCE_TYPES.has(requestedSource) ? requestedSource : 'final_mix';
  const requestedProvider = String(input.provider || 'whisper-flow').trim().toLowerCase();
  if (!PROVIDERS.has(requestedProvider)) {
    throw transcriptError(400, 'INVALID_PROVIDER', 'Unsupported transcript provider');
  }
  return {
    providerSegmentId,
    sequence,
    startMs,
    endMs,
    speaker: String(input.speaker || 'Speaker').trim().slice(0, 120) || 'Speaker',
    sourceType,
    sourceLabel: String(
      input.sourceLabel || (sourceType === 'final_mix' ? 'Echoo final mix' : sourceType.replaceAll('_', ' '))
    ).trim().slice(0, 120),
    text,
    isFinal: Boolean(input.isFinal),
    confidence: Number.isFinite(confidenceValue)
      ? Math.max(0, Math.min(1, confidenceValue))
      : null,
    providerRevision: Math.max(0, Math.floor(Number(input.providerRevision) || 0)),
    provider: requestedProvider,
    language: String(input.language || 'en').trim().slice(0, 16),
  };
};

export async function persistTranscriptSegment({
  broadcastId,
  sessionId = null,
  input,
  io = null,
}) {
  const broadcastObjectId = asObjectId(broadcastId, 'broadcast');
  const sessionObjectId = sessionId ? asObjectId(sessionId, 'session') : null;
  const normalized = normalizeTranscriptSegmentInput(input);

  if (sessionObjectId) {
    const session = await TranscriptSession.findOne({
      _id: sessionObjectId,
      broadcastId: broadcastObjectId,
    }).select('provider status');
    if (!session) {
      throw transcriptError(409, 'SESSION_MISMATCH', 'Transcript session does not belong to this broadcast');
    }
    if (session.provider !== normalized.provider) {
      throw transcriptError(409, 'PROVIDER_MISMATCH', 'Transcript provider does not match its session');
    }
    if (session.status !== 'active') {
      throw transcriptError(409, 'SESSION_CLOSED', 'Transcript session is no longer active');
    }
    await TranscriptSession.updateOne(
      { _id: sessionObjectId },
      { $set: { lastActivityAt: new Date(), lastProviderSequence: normalized.sequence } }
    );
  }

  const segment = await TranscriptSegment.findOneAndUpdate(
    {
      broadcastId: broadcastObjectId,
      sessionId: sessionObjectId,
      providerSegmentId: normalized.providerSegmentId,
    },
    {
      $set: {
        sessionId: sessionObjectId,
        ...normalized,
        status: normalized.isFinal ? 'final' : 'partial',
      },
      $setOnInsert: {
        originalText: normalized.text,
        publicationStatus: 'draft',
      },
      $inc: { revision: 1, revisionNumber: 1 },
    },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
  );

  const payload = segment.toJSON();
  const creatorRoom = `broadcast:${broadcastObjectId}:creator`;
  io?.to(creatorRoom).emit('transcript:segment', payload);
  io?.to(creatorRoom).emit(
    segment.isFinal ? 'transcript_final' : 'transcript_partial',
    payload
  );
  if (segment.sequence === 0 || segment.isFinal) {
    console.info('[Echoo Transcript] draft segment emitted to creator', {
      broadcastId: String(broadcastObjectId),
      sessionId: sessionObjectId ? String(sessionObjectId) : null,
      segmentId: segment.providerSegmentId,
      status: segment.isFinal ? 'final' : 'partial',
      revision: segment.revision,
    });
  }
  if (segment.isFinal) {
    io?.to(creatorRoom).emit('transcript:finalized', {
      type: 'segment',
      broadcastId: String(broadcastObjectId),
      segment: payload,
    });
  }
  return segment;
}

export async function appendTranscriptSessionError(
  sessionId,
  { code = 'TRANSCRIPTION_ERROR', message, retryable = false } = {}
) {
  if (!sessionId || !message) return null;
  return TranscriptSession.findByIdAndUpdate(
    sessionId,
    {
      $push: {
        errorLog: {
          $each: [{ code, message: String(message).slice(0, 1000), retryable, at: new Date() }],
          $slice: -20,
        },
      },
      $set: { lastActivityAt: new Date() },
    },
    { returnDocument: 'after' }
  );
}

export async function finalizeConfirmedTranscript({ broadcastId, io = null }) {
  const id = asObjectId(broadcastId, 'broadcast');
  const [finalCount, partialCount] = await Promise.all([
    TranscriptSegment.countDocuments({ broadcastId: id, isFinal: true }),
    TranscriptSegment.countDocuments({ broadcastId: id, isFinal: false }),
  ]);

  const payload = {
    type: 'broadcast',
    broadcastId: String(id),
    finalCount,
    partialCount,
  };
  io?.to(`broadcast:${id}:creator`).emit('transcript:finalized', payload);
  console.info('[Echoo Transcript] broadcast transcript finalized', payload);
  return payload;
}

export default {
  persistTranscriptSegment,
  appendTranscriptSessionError,
  finalizeConfirmedTranscript,
  normalizeTranscriptSegmentInput,
};
