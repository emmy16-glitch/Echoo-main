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

// A retry delay must not retain an abort listener after its timer resolves.
 // Long recordings can hit many intermittent upload retries over several hours.
export const waitForUploadRetry = (ms, signal) => new Promise((resolve, reject) => {
  const abortError = () => new DOMException('Upload paused', 'AbortError');
  if (signal?.aborted) {
    reject(abortError());
    return;
  }
  const onAbort = () => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    reject(abortError());
  };
  const timer = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});
