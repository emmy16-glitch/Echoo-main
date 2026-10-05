import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = resolve(scriptDirectory, '..');

const requiredFiles = [
  'src/main.js',
  'src/preload.js',
  'src/offline.js',
  'offline.html',
  'assets/icon.png',
  'frontend-dist/index.html',
];

for (const relativePath of requiredFiles) {
  const absolutePath = join(desktopDirectory, relativePath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile() || statSync(absolutePath).size === 0) {
    throw new Error(`Required desktop bundle file is missing or empty: ${relativePath}`);
  }
}

const packageJson = JSON.parse(readFileSync(join(desktopDirectory, 'package.json'), 'utf8'));
if (packageJson.version !== '2.0.0') throw new Error('Desktop package version must be 2.0.0.');
if (packageJson.build?.productName !== 'Echoo') throw new Error('Installed product name must be Echoo.');
if (!String(packageJson.build?.win?.artifactName || '').includes('Echoo-Setup-')) {
  throw new Error('Windows installer artifact name is not configured.');
}

const rendererIndex = readFileSync(join(desktopDirectory, 'frontend-dist/index.html'), 'utf8');
if (/\b(?:src|href)="\/assets\//.test(rendererIndex)) {
  throw new Error('Packaged renderer still contains absolute asset paths.');
}

console.log('Echoo desktop bundle contract verified.');

