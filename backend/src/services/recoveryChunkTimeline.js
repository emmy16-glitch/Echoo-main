// Validate media coverage independently of chunk numbering. Every numbered
// 10-second piece can be present while its timestamps contain a missing or
// duplicated section. Never turn that into a "complete" server replay.
export const inspectRecoveryChunkTimeline = (chunks = [], toleranceMs = 40) => {
  if (!Array.isArray(chunks) || !chunks.length) {
    return { valid: false, reason: 'empty-timeline', chunkIndex: 0 };
  }
  let previousEnd = 0;
  for (const [position, chunk] of chunks.entries()) {
    const index = Number(chunk?.chunkIndex);
    const start = Number(chunk?.startMs);
    const end = Number(chunk?.endMs);
    if (!Number.isInteger(index) || index !== position ||
        !Number.isFinite(start) || !Number.isFinite(end) || start < 0 ||
        end <= start || end - start > 60_000) {
      return { valid: false, reason: 'invalid-chunk-timing', chunkIndex: position };
    }
    if (Math.abs(start - previousEnd) > toleranceMs) {
      return {
        valid: false,
        reason: start > previousEnd ? 'timeline-gap' : 'timeline-overlap',
        chunkIndex: position,
      };
    }
    previousEnd = end;
  }
  return { valid: true, durationMs: previousEnd };
};
