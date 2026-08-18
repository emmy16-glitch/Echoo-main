const PALETTES = [
  ['#0F172A', '#2563EB', '#22D3EE', '#EFF6FF'],
  ['#180B26', '#A855F7', '#EC4899', '#F5E8FF'],
  ['#211006', '#F97316', '#F43F5E', '#FFF1E8'],
  ['#071A16', '#10B981', '#14B8A6', '#E8FFF8'],
  ['#151515', '#FACC15', '#F97316', '#FFF7D6'],
  ['#0E1325', '#6366F1', '#8B5CF6', '#EEF2FF'],
];

const escapeXml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const hashString = (value = '') => {
  let hash = 2166136261;
  for (let index = 0; index < String(value).length; index += 1) {
    hash ^= String(value).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

const splitTitle = (title = '') => {
  const words = String(title || 'Echoo Audio').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if ((candidate.length <= 18 || !current) && lines.length < 2) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  if (lines.length > 3) return [lines[0], lines[1], lines.slice(2).join(' ')];
  return lines.slice(0, 3);
};

export const buildGeneratedAudioCoverUrl = (track = {}) => {
  const title = track.title || 'Echoo Audio';
  const artist =
    track.artistName ||
    track.artist?.displayName ||
    track.artist?.username ||
    track.subtitle ||
    'Echoo Creator';
  const genre = track.genre || 'Audio';
  const variant = Number.isInteger(Number(track.coverArtVariant))
    ? Number(track.coverArtVariant)
    : hashString(`${title}|${artist}|${genre}`);
  const [background, accent, secondary, soft] = PALETTES[Math.abs(variant) % PALETTES.length];
  const lines = splitTitle(title);
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const fontSize = Math.max(42, Math.min(lines.length > 2 ? 72 : 96, Math.floor(600 / (longest * 0.56))));
  const gap = Math.round(fontSize * 0.98);
  const firstY = 390 - ((lines.length - 1) * gap) / 2;
  const titleMarkup = lines
    .map((line, index) => `<text x="72" y="${Math.round(firstY + index * gap)}" font-family="system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="${fontSize}" font-weight="850" letter-spacing="-2.2" fill="#fff">${escapeXml(line)}</text>`)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${background}"/><stop offset=".6" stop-color="${secondary}" stop-opacity=".88"/><stop offset="1" stop-color="${accent}"/></linearGradient>
      <radialGradient id="l" cx="80%" cy="15%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="800" height="800" rx="52" fill="url(#g)"/><rect width="800" height="800" rx="52" fill="url(#l)"/>
    <circle cx="690" cy="140" r="220" fill="none" stroke="${soft}" stroke-width="28" opacity=".12"/>
    <circle cx="690" cy="140" r="138" fill="none" stroke="#fff" stroke-width="3" opacity=".16"/>
    <path d="M430 560 C510 340 580 730 650 520 C720 320 780 665 850 470" fill="none" stroke="#fff" stroke-width="19" opacity=".13"/>
    <circle cx="85" cy="82" r="15" fill="#fff" opacity=".96"/><path d="M80 74 L95 82 L80 90 Z" fill="${background}"/>
    <text x="115" y="89" font-family="system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="20" font-weight="800" letter-spacing="4" fill="#fff" opacity=".88">ECHOO AUDIO</text>
    ${titleMarkup}
    <text x="72" y="686" font-family="system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="26" font-weight="700" fill="#fff" opacity=".9">${escapeXml(artist)}</text>
    <text x="72" y="738" font-family="system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="17" font-weight="800" letter-spacing="2" fill="#fff" opacity=".72">${escapeXml(String(genre).toUpperCase())}</text>
  </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export default buildGeneratedAudioCoverUrl;
