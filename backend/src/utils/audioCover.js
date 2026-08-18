const AUDIO_COVER_VARIANT_COUNT = 96;

const PALETTES = {
  Pop: [
    ['#190B2D', '#FF4DA6', '#7C3AED', '#FCE7F3'],
    ['#0F172A', '#22D3EE', '#2563EB', '#E0F2FE'],
    ['#25100A', '#FF8A3D', '#F43F5E', '#FFF1E8'],
  ],
  'Hip-Hop': [
    ['#080808', '#FACC15', '#EF4444', '#FFF7CC'],
    ['#101010', '#A3E635', '#22C55E', '#F2FCE4'],
    ['#150D1D', '#F97316', '#A855F7', '#FFE8D8'],
  ],
  'R&B': [
    ['#160B1C', '#A855F7', '#EC4899', '#F5E8FF'],
    ['#071A20', '#14B8A6', '#3B82F6', '#E8FFFB'],
    ['#1D1117', '#FB7185', '#C084FC', '#FFEAF0'],
  ],
  Electronic: [
    ['#06101C', '#00E5FF', '#5B5BFF', '#DDFBFF'],
    ['#08150F', '#34D399', '#22D3EE', '#E4FFF4'],
    ['#100A24', '#8B5CF6', '#F472B6', '#F3E8FF'],
  ],
  Spiritual: [
    ['#111827', '#D4AF37', '#3B82F6', '#FFF6D6'],
    ['#09211C', '#E1B85A', '#14B8A6', '#FFF7DD'],
    ['#1A1830', '#F5C563', '#8B5CF6', '#FFF2D0'],
  ],
  Podcast: [
    ['#0C1B2A', '#2F80ED', '#56CCF2', '#E7F5FF'],
    ['#1B1724', '#8B5CF6', '#EC4899', '#F2E9FF'],
    ['#151A1E', '#F59E0B', '#64748B', '#FFF5DA'],
  ],
  Other: [
    ['#111827', '#2563EB', '#60A5FA', '#EFF6FF'],
    ['#171717', '#F59E0B', '#F97316', '#FFF7E8'],
    ['#10201C', '#10B981', '#22D3EE', '#E9FFF8'],
  ],
};

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

const normalizeGenre = (genre = 'Other') => {
  if (PALETTES[genre]) return genre;
  if (['Rock', 'Metal'].includes(genre)) return 'Hip-Hop';
  if (['Jazz', 'Classical', 'Country', 'Reggae'].includes(genre)) return 'R&B';
  if (['Educational', 'Comedy', 'Storytelling'].includes(genre)) return 'Podcast';
  return 'Other';
};

const titleLines = (value = '') => {
  const words = String(value || 'Untitled Audio').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if ((candidate.length <= 18 || !current) && lines.length < 2) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  if (lines.length > 3) {
    return [lines[0], lines[1], lines.slice(2).join(' ')];
  }
  return lines.slice(0, 3);
};

const fitFont = (lines) => {
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const widthSize = Math.floor(610 / (longest * 0.56));
  const max = lines.length >= 3 ? 72 : lines.length === 2 ? 88 : 106;
  return Math.max(38, Math.min(max, widthSize));
};

const decoration = (variant, accent, secondary, soft) => {
  switch (variant % 6) {
    case 0:
      return `<circle cx="675" cy="160" r="220" fill="none" stroke="${soft}" stroke-width="4" opacity=".18"/><circle cx="675" cy="160" r="145" fill="none" stroke="${accent}" stroke-width="14" opacity=".18"/>`;
    case 1:
      return `<path d="M430 30 L820 420 M365 10 L760 405 M500 -25 L845 320" stroke="${soft}" stroke-width="28" opacity=".12"/>`;
    case 2:
      return `<g opacity=".18" fill="${soft}">${Array.from({ length: 42 }, (_, index) => `<circle cx="${440 + (index % 7) * 52}" cy="${55 + Math.floor(index / 7) * 55}" r="6"/>`).join('')}</g>`;
    case 3:
      return `<path d="M410 415 C465 205 520 610 575 415 C630 205 685 610 740 415 C795 205 850 610 905 415" fill="none" stroke="${accent}" stroke-width="22" opacity=".2"/>`;
    case 4:
      return `<g opacity=".16"><rect x="475" y="80" width="48" height="430" rx="24" fill="${soft}"/><rect x="555" y="155" width="48" height="355" rx="24" fill="${secondary}"/><rect x="635" y="35" width="48" height="475" rx="24" fill="${soft}"/><rect x="715" y="215" width="48" height="295" rx="24" fill="${accent}"/></g>`;
    default:
      return `<path d="M420 85 C570 -30 790 25 900 195 C765 250 625 365 445 665" fill="none" stroke="${soft}" stroke-width="95" opacity=".11"/>`;
  }
};

export function createGeneratedAudioCover({
  title,
  artistName = 'Echoo Creator',
  genre = 'Other',
  variant = null,
} = {}) {
  const seed = `${title || ''}|${artistName || ''}|${genre || ''}`;
  const resolvedVariant = Number.isInteger(Number(variant))
    ? Math.abs(Number(variant)) % AUDIO_COVER_VARIANT_COUNT
    : hashString(seed) % AUDIO_COVER_VARIANT_COUNT;

  const family = normalizeGenre(genre);
  const palettes = PALETTES[family] || PALETTES.Other;
  const [background, accent, secondary, soft] = palettes[resolvedVariant % palettes.length];
  const lines = titleLines(title);
  const fontSize = fitFont(lines);
  const lineGap = Math.round(fontSize * 0.96);
  const baseY = 390 - ((lines.length - 1) * lineGap) / 2;
  const titleMarkup = lines
    .map(
      (line, index) =>
        `<text x="70" y="${Math.round(baseY + index * lineGap)}" font-family="system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="${fontSize}" font-weight="850" letter-spacing="-2.4" fill="#FFFFFF">${escapeXml(line)}</text>`
    )
    .join('');

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${background}"/>
        <stop offset=".58" stop-color="${secondary}" stop-opacity=".82"/>
        <stop offset="1" stop-color="${accent}" stop-opacity=".92"/>
      </linearGradient>
      <radialGradient id="light" cx="78%" cy="12%" r="82%">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity=".2"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000000" flood-opacity=".18"/>
      </filter>
    </defs>
    <rect width="800" height="800" rx="54" fill="url(#bg)"/>
    <rect width="800" height="800" rx="54" fill="url(#light)"/>
    ${decoration(resolvedVariant, accent, secondary, soft)}
    <g filter="url(#shadow)">
      <circle cx="84" cy="82" r="14" fill="#FFFFFF" opacity=".94"/>
      <path d="M79 74 L94 82 L79 90 Z" fill="${background}"/>
    </g>
    <text x="112" y="89" font-family="system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="20" font-weight="800" letter-spacing="4" fill="#FFFFFF" opacity=".86">ECHOO AUDIO</text>
    ${titleMarkup}
    <text x="72" y="682" font-family="system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="26" font-weight="700" fill="#FFFFFF" opacity=".9">${escapeXml(artistName)}</text>
    <rect x="70" y="712" width="${Math.min(245, Math.max(92, String(genre || 'Audio').length * 14 + 36))}" height="44" rx="22" fill="#FFFFFF" opacity=".13"/>
    <text x="92" y="741" font-family="system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="18" font-weight="750" letter-spacing="1.5" fill="#FFFFFF" opacity=".9">${escapeXml(String(genre || 'Audio').toUpperCase())}</text>
  </svg>`;

  return {
    dataUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    variant: resolvedVariant,
  };
}

export { AUDIO_COVER_VARIANT_COUNT };
