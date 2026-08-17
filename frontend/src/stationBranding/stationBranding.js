export const STATION_BRAND_VARIANT_COUNT = 512;

const PALETTE_FAMILIES = {
  faith: [
    ['#21170F', '#C79A3B', '#FFF5D6', '#F7E8BD'],
    ['#14213D', '#FCA311', '#FFF8EA', '#DDE7F7'],
    ['#3A1D14', '#D6A84B', '#FFF4DF', '#EACB8A'],
    ['#16251D', '#D4AF37', '#F7F3E8', '#BFD3C5'],
    ['#3B2416', '#E6B566', '#FFF7ED', '#F1D6AD'],
    ['#1D2333', '#C9A227', '#F8F4E8', '#D7DDEB'],
    ['#2C1732', '#E2B65E', '#FFF4F8', '#E9D0E7'],
    ['#0F2B2D', '#E1B85A', '#F5F4E8', '#BCD8D5'],
  ],
  business: [
    ['#071A35', '#2E6BFF', '#F4F8FF', '#9CB8F7'],
    ['#111827', '#60A5FA', '#F8FAFC', '#CBD5E1'],
    ['#16213E', '#0EA5E9', '#F0F9FF', '#93C5FD'],
    ['#172033', '#14B8A6', '#F0FDFA', '#99F6E4'],
    ['#1F2937', '#F59E0B', '#FFF7ED', '#FDE68A'],
    ['#102A43', '#38BDF8', '#F8FAFC', '#BAE6FD'],
    ['#1B263B', '#5BC0EB', '#F7FBFF', '#B6D7EA'],
    ['#0B132B', '#6FFFE9', '#F5FFFF', '#B8FFF4'],
  ],
  entertainment: [
    ['#2B0B12', '#FF3B30', '#FFF1F2', '#FFB4B0'],
    ['#1F1147', '#A855F7', '#FAF5FF', '#D8B4FE'],
    ['#3A0D00', '#F97316', '#FFF7ED', '#FDBA74'],
    ['#20124D', '#EC4899', '#FDF2F8', '#F9A8D4'],
    ['#0F172A', '#22D3EE', '#ECFEFF', '#A5F3FC'],
    ['#2D0A31', '#F43F5E', '#FFF1F2', '#FDA4AF'],
    ['#231942', '#9F86C0', '#F7F2FF', '#D0BCE7'],
    ['#251101', '#FF7A00', '#FFF6E8', '#FFC37A'],
  ],
  calm: [
    ['#123047', '#2A9D8F', '#F0FDFA', '#A7DAD3'],
    ['#16324F', '#4EA8DE', '#F5FBFF', '#B7DDF5'],
    ['#264653', '#E9C46A', '#FFF8E5', '#E8D8A7'],
    ['#243B53', '#7DD3FC', '#F0F9FF', '#BAE6FD'],
    ['#13315C', '#8EC5FC', '#F6FBFF', '#D3E7F7'],
    ['#203A43', '#4FD1C5', '#F0FFFD', '#BCEDE7'],
    ['#1D3557', '#A8DADC', '#F1FAEE', '#CDE8E5'],
    ['#355070', '#6D597A', '#F7F4FA', '#D7CBDD'],
  ],
  general: [
    ['#151515', '#F4D35E', '#FFF9E8', '#DDD2A4'],
    ['#0F172A', '#2563EB', '#F8FAFC', '#BFD2FF'],
    ['#1C1917', '#E76F51', '#FFF7ED', '#F1BAAA'],
    ['#171717', '#A3E635', '#F7FEE7', '#D9F99D'],
    ['#18181B', '#C084FC', '#FAF5FF', '#E9D5FF'],
    ['#111827', '#F472B6', '#FDF2F8', '#FBCFE8'],
    ['#0B1F33', '#FBBF24', '#FFFBEB', '#FDE68A'],
    ['#221F1F', '#60A5FA', '#EFF6FF', '#BFDBFE'],
  ],
};

const TYPOGRAPHY = [
  { family: 'Georgia, Times New Roman, serif', weight: 700, style: 'normal', spacing: '-1.8', transform: 'title' },
  { family: 'Arial Narrow, Helvetica Neue, Arial, sans-serif', weight: 900, style: 'normal', spacing: '-2.2', transform: 'upper' },
  { family: 'Trebuchet MS, Avenir Next, Arial, sans-serif', weight: 800, style: 'normal', spacing: '-1.6', transform: 'title' },
  { family: 'Palatino Linotype, Book Antiqua, Georgia, serif', weight: 700, style: 'italic', spacing: '-1.2', transform: 'title' },
  { family: 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif', weight: 800, style: 'normal', spacing: '0.2', transform: 'upper' },
  { family: 'Courier New, monospace', weight: 700, style: 'normal', spacing: '-1.1', transform: 'upper' },
  { family: 'Avenir Next, Segoe UI, Arial, sans-serif', weight: 800, style: 'normal', spacing: '-2', transform: 'title' },
  { family: 'Georgia, Times New Roman, serif', weight: 500, style: 'italic', spacing: '-1.5', transform: 'title' },
];

const CATEGORY_FAMILY = {
  'Faith & Spirituality': 'faith',
  Business: 'business',
  Technology: 'business',
  Education: 'business',
  'News & Politics': 'business',
  Entertainment: 'entertainment',
  Music: 'entertainment',
  Comedy: 'entertainment',
  Storytelling: 'entertainment',
  Sports: 'entertainment',
  'Health & Wellness': 'calm',
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

export const randomStationBrandVariant = (current = null) => {
  const safeCurrent = Number.isInteger(Number(current)) ? Number(current) : null;
  let next = Math.floor(Math.random() * STATION_BRAND_VARIANT_COUNT);
  if (safeCurrent !== null && next === safeCurrent) next = (next + 137) % STATION_BRAND_VARIANT_COUNT;
  return next;
};

const titleCase = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/(^|\s|[-/])\S/g, (match) => match.toUpperCase());

const transformTitle = (value, mode) => {
  if (mode === 'upper') return String(value || '').toUpperCase();
  return titleCase(value);
};

const splitTitle = (value, layout) => {
  const words = String(value || 'Echoo Station').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ['Echoo', 'Station'];
  if (words.length === 1) return [words[0]];
  if (words.length === 2) return layout % 2 === 0 ? words : [words.join(' ')];

  const middle = Math.ceil(words.length / 2);
  const first = words.slice(0, middle).join(' ');
  const second = words.slice(middle).join(' ');
  return second ? [first, second] : [first];
};

const patternSvg = (pattern, accent, soft) => {
  switch (pattern) {
    case 0:
      return `<circle cx="535" cy="90" r="150" fill="none" stroke="${soft}" stroke-width="2" opacity=".35"/><circle cx="535" cy="90" r="105" fill="none" stroke="${accent}" stroke-width="2" opacity=".25"/>`;
    case 1:
      return `<path d="M390 -20 L660 250 M440 -20 L710 250 M490 -20 L760 250" stroke="${soft}" stroke-width="14" opacity=".18"/>`;
    case 2:
      return `<g opacity=".2" fill="${soft}">${Array.from({ length: 30 }, (_, index) => `<circle cx="${350 + (index % 6) * 52}" cy="${28 + Math.floor(index / 6) * 52}" r="4"/>`).join('')}</g>`;
    case 3:
      return `<path d="M360 175 C395 70 430 280 465 175 C500 70 535 280 570 175 C605 70 640 280 675 175" fill="none" stroke="${accent}" stroke-width="12" opacity=".26"/>`;
    case 4:
      return `<g opacity=".15" stroke="${soft}" stroke-width="2"><path d="M360 0V360M420 0V360M480 0V360M540 0V360M600 0V360"/><path d="M320 60H640M320 120H640M320 180H640M320 240H640M320 300H640"/></g>`;
    case 5:
      return `<path d="M420 360 A250 250 0 0 1 670 110" fill="none" stroke="${soft}" stroke-width="34" opacity=".16"/><path d="M475 360 A195 195 0 0 1 670 165" fill="none" stroke="${accent}" stroke-width="8" opacity=".24"/>`;
    case 6:
      return `<g fill="${soft}" opacity=".22"><rect x="390" y="40" width="26" height="240" rx="13"/><rect x="438" y="90" width="26" height="190" rx="13"/><rect x="486" y="20" width="26" height="260" rx="13"/><rect x="534" y="120" width="26" height="160" rx="13"/><rect x="582" y="70" width="26" height="210" rx="13"/></g>`;
    default:
      return `<path d="M355 45 C430 0 550 20 660 95 C560 155 475 205 350 315" fill="none" stroke="${soft}" stroke-width="54" opacity=".13"/>`;
  }
};

export const resolveStationBranding = (station = {}) => {
  const explicit = Number(station?.branding?.variant);
  const fallback = hashString(station.id || station._id || station.name || 'echoo') % STATION_BRAND_VARIANT_COUNT;
  const variant = Number.isInteger(explicit) && explicit >= 0
    ? explicit % STATION_BRAND_VARIANT_COUNT
    : fallback;

  const paletteIndex = variant % 8;
  const typographyIndex = Math.floor(variant / 8) % 8;
  const layoutIndex = Math.floor(variant / 64) % 8;
  const patternIndex = Math.floor(variant / 8) % 8;
  const family = CATEGORY_FAMILY[station.category] || 'general';

  return {
    mode: station?.branding?.mode || (station.logo || station.coverArt ? 'custom' : 'generated'),
    variant,
    palette: PALETTE_FAMILIES[family][paletteIndex],
    typography: TYPOGRAPHY[typographyIndex],
    layout: layoutIndex,
    pattern: patternIndex,
    version: Number(station?.branding?.version) || 1,
  };
};

export const buildGeneratedStationBrandCoverUrl = (station = {}) => {
  const branding = resolveStationBranding(station);
  const [background, accent, foreground, soft] = branding.palette;
  const typography = branding.typography;
  const layout = branding.layout;
  const title = transformTitle(station.name || station.title || 'Echoo Station', typography.transform);
  const lines = splitTitle(title, layout);
  const category = escapeXml(station.category || 'Echoo Station');
  const anchor = [0, 3, 5].includes(layout) ? 'start' : [2, 6].includes(layout) ? 'end' : 'middle';
  const x = anchor === 'start' ? 58 : anchor === 'end' ? 582 : 320;
  const baseY = lines.length === 1 ? 185 : 150;
  const fontSize = lines.length === 1 ? (title.length > 18 ? 48 : 62) : (title.length > 24 ? 44 : 54);
  const lineGap = Math.round(fontSize * 0.95);
  const categoryX = anchor === 'start' ? 60 : anchor === 'end' ? 580 : 320;
  const decorative = patternSvg(branding.pattern, accent, soft);
  const titleMarkup = lines
    .slice(0, 3)
    .map((line, index) => `<text x="${x}" y="${baseY + index * lineGap}" text-anchor="${anchor}" font-family="${escapeXml(typography.family)}" font-size="${fontSize}" font-weight="${typography.weight}" font-style="${typography.style}" letter-spacing="${typography.spacing}" fill="${foreground}">${escapeXml(line)}</text>`)
    .join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${background}"/>
          <stop offset="1" stop-color="${accent}" stop-opacity=".78"/>
        </linearGradient>
        <radialGradient id="glow" cx="80%" cy="20%" r="75%">
          <stop offset="0" stop-color="${foreground}" stop-opacity=".18"/>
          <stop offset="1" stop-color="${background}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="640" height="360" rx="28" fill="url(#bg)"/>
      <rect width="640" height="360" rx="28" fill="url(#glow)"/>
      ${decorative}
      <circle cx="52" cy="48" r="10" fill="${accent}"/>
      <circle cx="72" cy="48" r="4" fill="${foreground}" opacity=".55"/>
      <text x="92" y="54" font-family="Avenir Next, Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" letter-spacing="2" fill="${foreground}" opacity=".8">ECHOO</text>
      ${titleMarkup}
      <text x="${categoryX}" y="318" text-anchor="${anchor}" font-family="Avenir Next, Segoe UI, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="1.4" fill="${foreground}" opacity=".78">${category.toUpperCase()}</text>
    </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};
