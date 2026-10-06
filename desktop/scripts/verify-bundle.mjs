import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = resolve(scriptDirectory, '..');

const readPngDimensions = (absolutePath) => {
  const bytes = readFileSync(absolutePath);
  const pngSignature = '89504e470d0a1a0a';
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error(`Windows icon is not a valid PNG: ${absolutePath}`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
};

const requiredFiles = [
  'src/main.js',
  'src/preload.js',
  'src/offline.js',
  'offline.html',
  'splash.html',
  'assets/generated/icon.ico',
  'assets/generated/icon.png',
  'assets/generated/tray-icon.png',
  'frontend-dist/index.html',
];

for (const relativePath of requiredFiles) {
  const absolutePath = join(desktopDirectory, relativePath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile() || statSync(absolutePath).size === 0) {
    throw new Error(`Required desktop bundle file is missing or empty: ${relativePath}`);
  }
}

const windowsIconPath = join(desktopDirectory, 'assets', 'generated', 'icon.png');
const windowsIcon = readPngDimensions(windowsIconPath);
if (windowsIcon.width < 256 || windowsIcon.height < 256) {
  throw new Error(
    `Windows installer icon must be at least 256x256 pixels; received ${windowsIcon.width}x${windowsIcon.height}.`
  );
}

const packageJson = JSON.parse(readFileSync(join(desktopDirectory, 'package.json'), 'utf8'));
if (packageJson.version !== '2.0.1') throw new Error('Desktop package version must be 2.0.1.');
if (packageJson.build?.productName !== 'Echoo') throw new Error('Installed product name must be Echoo.');
if (!String(packageJson.build?.win?.artifactName || '').includes('Echoo-Setup-')) {
  throw new Error('Windows installer artifact name is not configured.');
}

const rendererIndex = readFileSync(join(desktopDirectory, 'frontend-dist/index.html'), 'utf8');
if (/\b(?:src|href)="\/assets\//.test(rendererIndex)) {
  throw new Error('Packaged renderer still contains absolute asset paths.');
}

console.log('Echoo desktop bundle contract verified.');

