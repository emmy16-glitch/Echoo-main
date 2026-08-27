const MAX_TERMS = 100;
const MAX_TERM_LENGTH = 80;

const flatten = (value) => {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (value === undefined || value === null) return [];
  return [String(value)];
};

export const normalizeBroadcastVocabulary = (...sources) => {
  const seen = new Set();
  const terms = [];
  for (const raw of flatten(sources)) {
    const term = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TERM_LENGTH);
    if (!term) continue;
    const key = term.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length >= MAX_TERMS) break;
  }
  return terms;
};

export const buildBroadcastVocabulary = ({ broadcast, creator, station, extras = [] } = {}) =>
  normalizeBroadcastVocabulary(
    broadcast?.title,
    broadcast?.category,
    broadcast?.genre,
    broadcast?.tags,
    creator?.displayName,
    creator?.fullname,
    creator?.username,
    station?.name,
    extras
  );

export default buildBroadcastVocabulary;
