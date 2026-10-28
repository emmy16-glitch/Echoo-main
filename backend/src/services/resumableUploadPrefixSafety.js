// A MongoDB offset is an acknowledgement of durable prefix bytes. If the
// corresponding file shrinks or disappears after a restart, resuming from
// that offset would create zero-filled holes and a corrupt final recording.
// Never repair this by extending the file; retain the old data for recovery.
export const hasConfirmedUploadPrefix = (stat, confirmedOffset) =>
  Number.isSafeInteger(confirmedOffset) &&
  confirmedOffset >= 0 &&
  stat?.isFile?.() === true &&
  Number.isSafeInteger(stat.size) &&
  stat.size >= confirmedOffset;
