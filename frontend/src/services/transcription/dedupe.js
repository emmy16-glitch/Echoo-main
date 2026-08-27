const tokens = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}'’-]+/gu, ' ')
  .trim()
  .split(/\s+/)
  .filter(Boolean);

export const dedupeOverlap = (previousText, nextText, { minWords = 2, maxWords = 24 } = {}) => {
  const previous = String(previousText || '').trim();
  const next = String(nextText || '').trim();
  if (!previous || !next) return next;

  const a = tokens(previous);
  const b = tokens(next);
  const maximum = Math.min(maxWords, a.length, b.length);
  let overlap = 0;
  for (let size = maximum; size >= minWords; size -= 1) {
    const tail = a.slice(a.length - size).join(' ');
    const head = b.slice(0, size).join(' ');
    if (tail === head) {
      overlap = size;
      break;
    }
  }
  if (!overlap) return next;

  // Remove only a confirmed multi-word prefix. Work from the original string so
  // punctuation/casing in Gemini's new segment is preserved as much as possible.
  let removed = 0;
  let index = 0;
  const wordPattern = /[\p{L}\p{N}'’-]+/gu;
  while (removed < overlap) {
    wordPattern.lastIndex = index;
    const match = wordPattern.exec(next);
    if (!match) return next;
    index = wordPattern.lastIndex;
    removed += 1;
  }
  while (index < next.length && /[\s,.;:!?—–-]/u.test(next[index])) index += 1;
  return next.slice(index).trim();
};

export const normalizeForDedupe = (value) => tokens(value).join(' ');
