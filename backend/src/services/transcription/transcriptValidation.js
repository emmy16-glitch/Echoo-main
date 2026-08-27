const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const repeatedPhraseScore = (text) => {
  const words = normalize(text).toLowerCase().split(' ').filter(Boolean);
  if (words.length < 12) return 0;
  const counts = new Map();
  for (let i = 0; i <= words.length - 4; i += 1) {
    const phrase = words.slice(i, i + 4).join(' ');
    counts.set(phrase, (counts.get(phrase) || 0) + 1);
  }
  return Math.max(0, ...counts.values()) / Math.max(1, words.length / 4);
};

export const validateTranscriptCandidate = ({ originalText, candidateText, previousEndMs = null, startMs = null, endMs = null } = {}) => {
  const original = normalize(originalText);
  const candidate = normalize(candidateText);
  if (!candidate) return { accepted: false, reason: 'empty_candidate' };
  if (!original) return { accepted: true, reason: 'no_original' };

  const ratio = candidate.length / Math.max(1, original.length);
  if (ratio < 0.35 || ratio > 3.25) {
    return { accepted: false, reason: 'extreme_length_change' };
  }
  if (repeatedPhraseScore(candidate) > 1.5) {
    return { accepted: false, reason: 'suspicious_repetition' };
  }
  if (Number.isFinite(Number(previousEndMs)) && Number.isFinite(Number(startMs)) && Number(startMs) + 100 < Number(previousEndMs)) {
    return { accepted: false, reason: 'backward_timestamp' };
  }
  if (Number.isFinite(Number(startMs)) && Number.isFinite(Number(endMs)) && Number(endMs) < Number(startMs)) {
    return { accepted: false, reason: 'invalid_time_range' };
  }

  const lower = candidate.toLowerCase();
  if (/^(sure|certainly|of course)[,! ]+(here|i can|the answer)/.test(lower)) {
    return { accepted: false, reason: 'model_answering_instead_of_transcribing' };
  }
  return { accepted: true, reason: 'accepted' };
};

export default validateTranscriptCandidate;
