// A long resumable upload can outlive its access token. Retry an unauthorized
// chunk once after refreshing the session; never advance the upload offset or
// silently repeat a chunk for any other response.
export async function postChunkWithAuthRetry(sendChunk, refreshAccessToken, signal) {
  const first = await sendChunk();
  if (first?.status !== 401 || signal?.aborted) return first;

  const refreshedToken = await refreshAccessToken().catch(() => '');
  if (!refreshedToken || signal?.aborted) return first;
  return sendChunk();
}
