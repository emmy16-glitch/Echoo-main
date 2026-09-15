// dev-launcher.js — desktop `npm run dev` entrypoint.
//
// Waits for the Vite dev server (identity-marker gate, same as the
// main-process twin in src/main.js), then launches Electron in the
// foreground. Used by scripts/dev-all.sh:
//
//   (cd desktop && VITE_PORT=5273 ECHOO_DEV_URL=http://localhost:5273 npm run dev)
//
// Env:
//   ECHOO_DEV_URL / ECHOO_URL — dev server URL (default http://localhost:5273)
//   VITE_PORT                  — fallback dev port when no URL is given
//   DEV_WAIT_MS                — how long to wait (default 120000)
//   ECHOO_NO_SANDBOX=1         — launch Electron with --no-sandbox (hosts
//                                without a configured SUID sandbox helper)

const { spawn } = require('node:child_process');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');

const DEV_URL =
  process.env.ECHOO_DEV_URL ||
  process.env.ECHOO_URL ||
  `http://localhost:${Number(process.env.VITE_PORT || '5273')}`;
const WAIT_MS = Number(process.env.DEV_WAIT_MS || '120000');
const IDENTITY_MARKER = 'name="echoo-app"';

function fetchOnce(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { timeout: 4000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 200000) req.destroy();
      });
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function waitForDevServer() {
  const started = Date.now();
  for (;;) {
    const got = await fetchOnce(DEV_URL);
    if (got && got.status === 200 && got.body.includes(IDENTITY_MARKER)) {
      console.log(`[dev-launcher] dev server ready at ${DEV_URL}`);
      return;
    }
    if (Date.now() - started > WAIT_MS) {
      console.error(
        `[dev-launcher] dev server did not serve the Echoo marker at ${DEV_URL} within ${WAIT_MS}ms. ` +
          'Start the frontend first (cd frontend && npm run dev) or set ECHOO_DEV_URL.'
      );
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function main() {
  await waitForDevServer();
  const electronBin = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
  const args = ['.'];
  if (process.env.ECHOO_NO_SANDBOX === '1') args.push('--no-sandbox');
  const child = spawn(electronBin, args, {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env },
  });
  child.on('exit', (code, signal) => {
    process.exit(typeof code === 'number' ? code : 1);
  });
}

main().catch((error) => {
  console.error('[dev-launcher] failed:', error?.message || error);
  process.exit(1);
});
