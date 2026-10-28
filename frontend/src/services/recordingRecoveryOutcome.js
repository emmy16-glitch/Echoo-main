// HTTP 200 confirms a finalization request was handled, not that Echoo
// actually has a complete replay. An incomplete result must remain retryable.
export const recoveryUploadConfirmed = ({ replay, chunkErrors = [] } = {}) =>
  replay?.status === 'ready' &&
  Boolean(replay?.audioId) &&
  Array.isArray(chunkErrors) &&
  chunkErrors.length === 0;
