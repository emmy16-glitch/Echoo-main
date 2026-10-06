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

for (const route of ['privacy-policy', 'delete-account']) {
  const routeDir = path.join(distDir, route);
  await mkdir(routeDir, { recursive: true });
  await copyFile(indexPath, path.join(routeDir, 'index.html'));
}
