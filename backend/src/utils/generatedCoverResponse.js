const GENERATED_SVG_PREFIX = 'data:image/svg+xml';
const MAX_GENERATED_COVER_BYTES = 256 * 1024;

export function sendGeneratedCover(res, value) {
  if (typeof value !== 'string' || !value.startsWith(GENERATED_SVG_PREFIX)) {
    return false;
  }

  const commaIndex = value.indexOf(',');
  if (commaIndex < 0) return false;

  try {
    const metadata = value.slice(0, commaIndex).toLowerCase();
    const payload = value.slice(commaIndex + 1);
    const image = metadata.includes(';base64')
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');

    if (!image.length || image.length > MAX_GENERATED_COVER_BYTES) return false;

    res.set({
      'Cache-Control': 'public, max-age=300',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(image);
    return true;
  } catch {
    return false;
  }
}
