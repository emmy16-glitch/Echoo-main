import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

const localBackendProxy = {
  '/api': {
    target: 'http://127.0.0.1:5017',
    changeOrigin: true,
  },
  '/socket.io': {
    target: 'http://127.0.0.1:5017',
    changeOrigin: true,
    ws: true,
  },
  '/uploads': {
    target: 'http://127.0.0.1:5017',
    changeOrigin: true,
  },
}

// Project-specific dev port, NOT Vite's 5173 default: this repo is developed
// on a shared multi-user machine where 5173/5174 are routinely owned by other
// people's servers. 5273 was verified free there and is unlikely to collide
// with common defaults. Override per-run with VITE_PORT if ever needed.
const localPort = Number(process.env.VITE_PORT || '5273');

export default defineConfig({
  plugins: [react()],
  // Relative asset base so the production bundle loads from ANY origin:
  // domain root on the web, AND file:// inside the Echoo Desktop shell
  // (Electron loadFile). Absolute '/assets/...' refs resolve to file:///assets
  // under file:// and 404 — that was the packaged-app blank window. Dev server
  // serving is unaffected (base only rewrites build output).
  base: './',
  server: {
    host: '0.0.0.0',
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
    host: '0.0.0.0',
    port: localPort,
    strictPort: false,
    allowedHosts: true,
    proxy: localBackendProxy,
  },
})
