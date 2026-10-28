// An encoder that dies during an active recording is a failed output even if
// FFmpeg returns code 0. End Broadcast is the only intentional clean exit.
export const encoderExitIsUnexpected = ({ code, signal, stopping = false } = {}) =>
  Boolean(signal) || (code !== 0 && code !== null) || !stopping;
