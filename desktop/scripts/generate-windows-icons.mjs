import { deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = resolve(scriptDirectory, '..');
const repositoryDirectory = resolve(desktopDirectory, '..');
const sourceSvgPath = join(repositoryDirectory, 'frontend', 'src', 'Components', 'Assets', 'echoo-mark-transparent.svg');
const outputDirectory = join(desktopDirectory, 'assets', 'generated');
const iconPngPath = join(outputDirectory, 'icon.png');
const trayPngPath = join(outputDirectory, 'tray-icon.png');
const iconIcoPath = join(outputDirectory, 'icon.ico');

const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];
const SUPERSAMPLE = 4;
const ART_OCCUPANCY = 0.82;

function readNumber(attributes, name) {
  const match = attributes.match(new RegExp(`${name}="([^"]+)"`));
  if (!match) throw new Error(`Echoo mark is missing ${name}.`);
  const value = Number(match[1]);
  if (!Number.isFinite(value)) throw new Error(`Echoo mark has invalid ${name}.`);
  return value;
}

function parseHexColor(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) throw new Error(`Unsupported Echoo mark color: ${value}`);
  const raw = Number.parseInt(match[1], 16);
  return [(raw >> 16) & 0xff, (raw >> 8) & 0xff, raw & 0xff];
}

function parseCanonicalMark(svg) {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1]?.trim().split(/\s+/).map(Number);
  if (!viewBox || viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value))) {
    throw new Error('Echoo mark must define a numeric four-value viewBox.');
  }

  const ellipses = [...svg.matchAll(/<ellipse\b([^>]*)\/>/g)].map((match) => {
    const attributes = match[1];
    const transform = /transform="rotate\(([-+\d.]+)\s+([-+\d.]+)\s+([-+\d.]+)\)"/.exec(attributes);
    const fill = /fill="([^"]+)"/.exec(attributes)?.[1];
    if (!transform || !fill) throw new Error('Echoo mark ellipse must define rotate(...) and fill.');
    return {
      cx: readNumber(attributes, 'cx'),
      cy: readNumber(attributes, 'cy'),
      rx: readNumber(attributes, 'rx'),
      ry: readNumber(attributes, 'ry'),
      rotation: Number(transform[1]) * Math.PI / 180,
      color: parseHexColor(fill),
    };
  });

  if (ellipses.length !== 2) {
    throw new Error(`Expected the canonical Echoo mark to contain exactly two ellipses, found ${ellipses.length}.`);
  }

  return { viewBox, ellipses };
}

function ellipseBounds(ellipse) {
  const cos = Math.cos(ellipse.rotation);
  const sin = Math.sin(ellipse.rotation);
  const halfWidth = Math.sqrt((ellipse.rx * cos) ** 2 + (ellipse.ry * sin) ** 2);
  const halfHeight = Math.sqrt((ellipse.rx * sin) ** 2 + (ellipse.ry * cos) ** 2);
  return {
    left: ellipse.cx - halfWidth,
    top: ellipse.cy - halfHeight,
    right: ellipse.cx + halfWidth,
    bottom: ellipse.cy + halfHeight,
  };
}

function markBounds(ellipses) {
  const boxes = ellipses.map(ellipseBounds);
  return boxes.reduce((acc, box) => ({
    left: Math.min(acc.left, box.left),
    top: Math.min(acc.top, box.top),
    right: Math.max(acc.right, box.right),
    bottom: Math.max(acc.bottom, box.bottom),
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
}

function coverageAtPoint(x, y, ellipse) {
  const dx = x - ellipse.cx;
  const dy = y - ellipse.cy;
  const cos = Math.cos(-ellipse.rotation);
  const sin = Math.sin(-ellipse.rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return (localX * localX) / (ellipse.rx * ellipse.rx) + (localY * localY) / (ellipse.ry * ellipse.ry) <= 1;
}

function rasterizeMark(size, mark) {
  const bounds = markBounds(mark.ellipses);
  const markWidth = bounds.right - bounds.left;
  const markHeight = bounds.bottom - bounds.top;
  const targetExtent = size * ART_OCCUPANCY;
  const scale = Math.min(targetExtent / markWidth, targetExtent / markHeight);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const samples = SUPERSAMPLE * SUPERSAMPLE;
  const pixels = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let outR = 0;
      let outG = 0;
      let outB = 0;
      let outA = 0;

      for (const ellipse of mark.ellipses) {
        let covered = 0;
        for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
          for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
            const canvasX = px + (sx + 0.5) / SUPERSAMPLE;
            const canvasY = py + (sy + 0.5) / SUPERSAMPLE;
            const sourceX = (canvasX - size / 2) / scale + centerX;
            const sourceY = (canvasY - size / 2) / scale + centerY;
            if (coverageAtPoint(sourceX, sourceY, ellipse)) covered += 1;
          }
        }

        const sourceAlpha = covered / samples;
        if (sourceAlpha <= 0) continue;
        const destinationAlpha = outA;
        const combinedAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
        if (combinedAlpha <= 0) continue;
        outR = (ellipse.color[0] * sourceAlpha + outR * destinationAlpha * (1 - sourceAlpha)) / combinedAlpha;
        outG = (ellipse.color[1] * sourceAlpha + outG * destinationAlpha * (1 - sourceAlpha)) / combinedAlpha;
        outB = (ellipse.color[2] * sourceAlpha + outB * destinationAlpha * (1 - sourceAlpha)) / combinedAlpha;
        outA = combinedAlpha;
      }

      const offset = (py * size + px) * 4;
      pixels[offset] = Math.round(outR);
      pixels[offset + 1] = Math.round(outG);
      pixels[offset + 2] = Math.round(outB);
      pixels[offset + 3] = Math.round(outA * 255);
    }
  }

  return pixels;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1);
    scanlines[rowOffset] = 0;
    rgba.copy(scanlines, rowOffset + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  const directory = Buffer.alloc(frames.length * 16);
  let offset = header.length + directory.length;
  frames.forEach(({ size, png }, index) => {
    const entry = index * 16;
    directory[entry] = size === 256 ? 0 : size;
    directory[entry + 1] = size === 256 ? 0 : size;
    directory[entry + 2] = 0;
    directory[entry + 3] = 0;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...frames.map((frame) => frame.png)]);
}

const svg = readFileSync(sourceSvgPath, 'utf8');
const mark = parseCanonicalMark(svg);
mkdirSync(outputDirectory, { recursive: true });

const frames = ICON_SIZES.map((size) => ({
  size,
  png: encodePng(size, size, rasterizeMark(size, mark)),
}));
const appPng = encodePng(512, 512, rasterizeMark(512, mark));
const trayPng = encodePng(128, 128, rasterizeMark(128, mark));

writeFileSync(iconPngPath, appPng);
writeFileSync(trayPngPath, trayPng);
writeFileSync(iconIcoPath, encodeIco(frames));

console.log(`Generated Echoo Windows branding from ${sourceSvgPath}`);
console.log(`ICO frames: ${ICON_SIZES.join(', ')} px`);
