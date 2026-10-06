import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
const indexPath = path.join(distDir, 'index.html');

const html = await readFile(indexPath, 'utf8');

// Hosted builds use an absolute Vite base and can safely reuse index.html from
// nested route directories. Packaged desktop/file:// builds use relative
// assets, so skip this static-host compatibility step there.
const usesRelativeAssets =
  /(?:src|href)=["']\.\//.test(html);

if (usesRelativeAssets) {
  process.exit(0);
}

const staticRoutes = [
  'login',
  'register',
  'reset-password',
  'privacy-policy',
  'delete-account',
  'creator-studio',
  'creator-studio/channels',
  'creator-studio/recordings',
  'creator-studio/collections',
  'creator-studio/schedule-events',
  'creator-studio/broadcast-settings',
  'creator-studio/analytics',
  'creator-studio/audio',
  'creator-studio/audience',
  'creator-studio/discover',
  'creator-studio/explore-live',
  'creator-studio/settings',
  'creator-studio/notifications',
  'listen',
  'listen/following',
  'listen/search',
  'listen/live',
  'listen/channels',
  'listen/stations',
  'listen/categories',
  'listen/library',
  'listen/library/following',
  'listen/playlist',
  'listen/saved-moments',
  'listen/history',
  'listen/downloads',
  'listen/notifications',
  'listen/profile',
  'listen/settings',
];

for (const route of staticRoutes) {
  const routeDir = path.join(distDir, route);
  await mkdir(routeDir, { recursive: true });
  await copyFile(indexPath, path.join(routeDir, 'index.html'));
}
