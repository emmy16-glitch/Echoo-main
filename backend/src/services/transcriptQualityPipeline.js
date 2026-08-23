import TranscriptSegment from '../models/TranscriptSegment.js';

/**
 * Background transcript quality pipeline foundation.
 *
 * Purpose:
 * - Accept completed recording chunks while a broadcast is still live.
 * - Allow a slower/high accuracy transcription pass to run behind live audio.
 * - Compare improved output against draft transcript segments.
 *
 * This service intentionally does not affect LiveKit or listener playback.
 */

export async function reconcileTranscriptChunk({
  broadcastId,
  chunkStartMs,
  chunkEndMs,
  improvedSegments = [],
}) {
  if (!broadcastId) {
    throw new Error('broadcastId is required');
  }

  const updates = [];

  for (const improved of improvedSegments) {
    if (!improved.text || !Number.isFinite(improved.startMs)) continue;

    const existing = await TranscriptSegment.findOne({
      broadcastId,
      startMs: {
        $lte: improved.startMs + 1500,
        $gte: Math.max(0, improved.startMs - 1500),
      },
    });

    if (existing) {
      existing.originalText ||= existing.text;
      existing.text = improved.text;
      existing.confidence = improved.confidence ?? existing.confidence;
      existing.providerRevision = Number(existing.providerRevision || 0) + 1;
      existing.isFinal = true;
      await existing.save();
      updates.push(existing._id);
    }
  }

  return {
    broadcastId,
    chunkStartMs,
    chunkEndMs,
    updatedSegments: updates.length,
    segmentIds: updates,
  };
}

export async function processRecordedAudioChunk({
  broadcastId,
  audioChunk,
  transcriptionProvider,
}) {
  if (!transcriptionProvider?.transcribe) {
    throw new Error('A high accuracy transcription provider is required');
  }

  const improvedSegments = await transcriptionProvider.transcribe(audioChunk);

  return reconcileTranscriptChunk({
    broadcastId,
    chunkStartMs: audioChunk.startMs,
    chunkEndMs: audioChunk.endMs,
    improvedSegments,
  });
}
