import TranscriptSegment from '../models/TranscriptSegment.js';

/**
 * Background transcript quality processing foundation.
 *
 * This service is intentionally separate from live transcription.
 * Live transcription creates fast draft segments while this pipeline
 * consumes completed recording chunks and improves accuracy in the background.
 */

export async function processTranscriptQualityChunk({
  broadcastId,
  audioChunk,
  draftSegments = [],
  transcribeChunk,
}) {
  if (!broadcastId) throw new Error('broadcastId is required');
  if (!audioChunk) throw new Error('audioChunk is required');
  if (typeof transcribeChunk !== 'function') {
    throw new Error('transcribeChunk provider is required');
  }

  const verifiedSegments = await transcribeChunk(audioChunk);

  const updates = verifiedSegments.map((segment) => ({
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: segment.text,
    confidence: segment.confidence ?? null,
  }));

  for (const verified of updates) {
    const draft = draftSegments.find((item) =>
      item.startMs <= verified.endMs && item.endMs >= verified.startMs
    );

    if (draft?._id) {
      await TranscriptSegment.updateOne(
        { _id: draft._id },
        {
          $set: {
            originalText: draft.originalText || draft.text,
            text: verified.text,
            confidence: verified.confidence,
            qualityVerified: true,
            qualityUpdatedAt: new Date(),
          },
          $inc: { revision: 1 },
        }
      );
    }
  }

  return {
    broadcastId,
    processedSegments: updates.length,
  };
}
