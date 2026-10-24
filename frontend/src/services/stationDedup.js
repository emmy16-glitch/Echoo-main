// Remove duplicate Channel cards without changing any Channel records.
// Prefer a live or more complete entry when the same logical Channel appears twice.
const idOf = (item) => String(item?.id || item?._id || '');
const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const ownerOf = (item) =>
  String(item?.owner?._id || item?.owner?.id || item?.ownerId || item?.creatorId ||
    (typeof item?.owner === 'string' ? item.owner : '') || '');
const channelKey = (item) => {
  const slug = normalize(item?.slug);
  if (slug) return `slug:${slug}`;
  const owner = ownerOf(item);
  const name = normalize(item?.name);
  if (owner && name) return `owner:${owner}:${name}`;
  if (name) return `name:${name}`;
  return idOf(item) ? `id:${idOf(item)}` : '';
};
const priority = (item) =>
  (item?.isLive ? 100 : 0) +
  (item?.brandCover || item?.coverArt ? 10 : 0) +
  (item?.description ? 1 : 0);

export function uniqueStations(stations = []) {
  const result = [];
  const positions = new Map();
  const ids = new Set();
  for (const station of stations) {
    if (!station || typeof station !== 'object') continue;
    const id = idOf(station);
    const key = channelKey(station);
    if (!key || (id && ids.has(id))) continue;
    if (id) ids.add(id);
    if (positions.has(key)) {
      const index = positions.get(key);
      if (priority(station) > priority(result[index])) result[index] = station;
      continue;
    }
    positions.set(key, result.length);
    result.push(station);
  }
  return result;
}
