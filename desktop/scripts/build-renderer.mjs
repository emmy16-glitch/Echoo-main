import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = resolve(scriptDirectory, '..');
const repositoryDirectory = resolve(desktopDirectory, '..');
const frontendDirectory = join(repositoryDirectory, 'frontend');
const outputDirectory = join(desktopDirectory, 'frontend-dist');
const viteCli = join(frontendDirectory, 'node_modules', 'vite', 'bin', 'vite.js');

const publicAppOrigin = String(
  process.env.ECHOO_DESKTOP_PUBLIC_ORIGIN || 'https://echoo.digi02.org'
).replace(/\/$/, '');
const apiUrl = String(
  process.env.ECHOO_DESKTOP_API_URL || `${publicAppOrigin}/api`
).replace(/\/$/, '');

if (!/^https:\/\//i.test(apiUrl)) {
  throw new Error('ECHOO_DESKTOP_API_URL must be a public HTTPS URL.');
}

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

if (!existsSync(viteCli)) {
  throw new Error('Frontend dependencies are missing. Run `npm ci --prefix frontend` first.');
}

const result = spawnSync(
  process.execPath,
  [viteCli, 'build', '--outDir', outputDirectory, '--emptyOutDir'],
  {
    cwd: frontendDirectory,
    env: {
      ...process.env,
      VITE_API_URL: apiUrl,
      VITE_PUBLIC_APP_ORIGIN: publicAppOrigin,
      VITE_BUILD_BASE: './',
      VITE_DESKTOP_RUNTIME: 'true',
      VITE_SYNTHETIC_AUDIO: 'false',
    },
    stdio: 'inherit',
  }
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const indexPath = join(outputDirectory, 'index.html');
if (!existsSync(indexPath)) {
  throw new Error(`Desktop renderer build did not produce ${indexPath}`);
}

const index = readFileSync(indexPath, 'utf8');
if (!index.includes('name="echoo-app"')) {
  throw new Error('Desktop renderer is missing the Echoo identity marker.');
}
if (/\b(?:src|href)="\/assets\//.test(index)) {
  throw new Error('Desktop renderer contains absolute asset paths and cannot boot from the packaged local app origin.');
}

for (const requiredAsset of ['assets/icon.png', 'assets/tray-icon.png']) {
  const assetPath = join(desktopDirectory, requiredAsset);
  if (!existsSync(assetPath)) {
    throw new Error(`Required Windows desktop asset is missing: ${requiredAsset}`);
  }
}

console.log(`Echoo desktop renderer built for ${apiUrl}`);

