import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// Backend target for the local /api, /socket.io and /uploads proxy.
// Default is the project-standard local backend (5017); staging or custom
// setups override per-run, e.g. VITE_BACKEND_PROXY_URL=http://127.0.0.1:5517.
// Dev/preview only — production bundles use same-origin VITE_API_URL instead.
const backendProxyTarget = (
  process.env.VITE_BACKEND_PROXY_URL || 'http://127.0.0.1:5017'
)
  .trim()
  .replace(/\/$/, '') || 'http://127.0.0.1:5017';

const localBackendProxy = {
  '/api': {
    target: backendProxyTarget,
    changeOrigin: true,
    // Forward the browser's address (X-Forwarded-For) so the backend's
    // per-IP rate limiters (e.g. LiveKit token issuance) see real clients
    // instead of lumping every tunnel/proxied user into one shared bucket.
    xfwd: true,
  },
  '/socket.io': {
    target: backendProxyTarget,
    changeOrigin: true,
    ws: true,
    xfwd: true,
  },
  '/uploads': {
    target: backendProxyTarget,
    changeOrigin: true,
    xfwd: true,
  },
}

// Project-specific dev port, NOT Vite's 5173 default: this repo is developed
// on a shared multi-user machine where 5173/5174 are routinely owned by other
// people's servers. 5273 was verified free there and is unlikely to collide
// with common defaults. Override per-run with VITE_PORT if ever needed.
const localPort = Number(process.env.VITE_PORT || '5273');
// Bind address for dev/preview servers. Default keeps LAN development
// working; staging/localhost-only runs set VITE_HOST=127.0.0.1.
const localHost = process.env.VITE_HOST || '0.0.0.0';

export default defineConfig({
  plugins: [react()],
  // Relative asset base so the production bundle loads from ANY origin:
  // domain root on the web, AND file:// inside the Echoo Desktop shell
  // (Electron loadFile). Absolute '/assets/...' refs resolve to file:///assets
  // under file:// and 404 — that was the packaged-app blank window. Dev server
  // serving is unaffected (base only rewrites build output).
  base: process.env.VITE_BUILD_BASE || './',
  server: {
    host: localHost,
    port: localPort,
    // strictPort is enforced via the `dev` script (`vite --strictPort`): a
    // squatted port must FAIL LOUDLY so the developer notices the conflict,
    // never silently fall back to 5174/5175/... behind Electron's back.
    // A `predev` port check (scripts/check-ports.sh) reports the occupant first.
    strictPort: false,
    allowedHosts: true,
    proxy: localBackendProxy,
  },
  // Preview uses the same configurable default and local API proxy.
  preview: {
    host: localHost,
    port: localPort,
    strictPort: false,
    allowedHosts: true,
    proxy: localBackendProxy,
  },
})
