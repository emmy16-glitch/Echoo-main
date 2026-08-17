export const STATION_BRAND_VARIANT_COUNT = 512;
export const STATION_BRAND_VERSION = 1;

const toInteger = (value) => {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};

const isGeneratedCover = (value) =>
  typeof value === 'string' && value.startsWith('data:image/svg+xml');

export function normalizeStationBrandVariant(value, fallback = null) {
  const parsed = toInteger(value);
  if (parsed === null) return fallback;
  return Math.max(0, Math.min(STATION_BRAND_VARIANT_COUNT - 1, parsed));
}

export function randomStationBrandVariant(exclude = null) {
  const normalizedExclude = normalizeStationBrandVariant(exclude, null);
  let next = Math.floor(Math.random() * STATION_BRAND_VARIANT_COUNT);

  if (normalizedExclude !== null && STATION_BRAND_VARIANT_COUNT > 1 && next === normalizedExclude) {
    next = (next + 1 + Math.floor(Math.random() * (STATION_BRAND_VARIANT_COUNT - 1))) % STATION_BRAND_VARIANT_COUNT;
  }

  return next;
}

export function createStationBranding({
  hasCustomLogo = false,
  variant = null,
  previous = null,
} = {}) {
  const previousVariant = normalizeStationBrandVariant(previous?.variant, null);
  const requestedVariant = normalizeStationBrandVariant(variant, null);

  return {
    mode: hasCustomLogo ? 'custom' : 'generated',
    variant: requestedVariant ?? previousVariant ?? randomStationBrandVariant(),
    version: STATION_BRAND_VERSION,
  };
}

export function ensureStationBranding(station) {
  if (!station) return null;

  const hasCustomLogo = Boolean(station.coverArt) && !isGeneratedCover(station.coverArt);
  const next = createStationBranding({
    hasCustomLogo,
    variant: station.branding?.variant,
    previous: station.branding,
  });

  if (!station.branding) station.branding = {};
  station.branding.mode = hasCustomLogo ? 'custom' : (station.branding.mode || 'generated');
  station.branding.variant = next.variant;
  station.branding.version = STATION_BRAND_VERSION;
  return station.branding;
}
