// Browser recovery is made from 48-kHz stereo 24-bit PCM. The timeline
// metadata must match the physical samples; otherwise a partial/truncated
// upload could be labelled as several minutes of protected audio.
export const recoveryChunkDurationMatches = ({
  pcmBytes, startMs, endMs, sampleRate = 48000,
  channels = 2, bitDepth = 24, toleranceMs = 30,
} = {}) => {
  const bytesPerFrame = channels * (bitDepth / 8);
  if (!Number.isFinite(pcmBytes) || pcmBytes <= 0 ||
      !Number.isInteger(pcmBytes) || !Number.isInteger(bytesPerFrame) ||
      pcmBytes % bytesPerFrame !== 0 ||
      !Number.isFinite(startMs) || !Number.isFinite(endMs) ||
      endMs <= startMs || !Number.isFinite(sampleRate) || sampleRate <= 0) return false;
  const actualMs = (pcmBytes / (sampleRate * bytesPerFrame)) * 1000;
  return Math.abs((endMs - startMs) - actualMs) <= toleranceMs;
};
