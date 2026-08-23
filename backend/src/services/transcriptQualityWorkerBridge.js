import { processTranscriptQualityChunk } from './transcriptQualityPipeline.js';

/**
 * Bridge used by broadcast workers when finalized recording chunks become
 * available during a live broadcast.
 *
 * The caller should provide chunks in chronological order. The bridge keeps
 * the existing BroadcastProcessingJob system as the owner of scheduling while
 * delegating transcript reconciliation to the quality pipeline.
 */
export async function enqueueTranscriptQualityChunk({
  broadcastId,
  chunkId,
  audioPath,
  startMs,
  endMs,
}) {
  return processTranscriptQualityChunk({
    broadcastId,
    chunkId,
    audioPath,
    startMs,
    endMs,
  });
}

export default enqueueTranscriptQualityChunk;
