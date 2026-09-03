import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

const localBackendProxy = {
  '/api': {
    target: 'http://127.0.0.1:5001',
    changeOrigin: true,
  },
  '/socket.io': {
    target: 'http://127.0.0.1:5001',
    changeOrigin: true,
    ws: true,
  },
  '/uploads': {
    target: 'http://127.0.0.1:5001',
    changeOrigin: true,
  },
}

const localPort = Number(process.env.VITE_PORT || '5173');

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: localPort,
    // Do not prevent local development when another checkout already owns the
    // default port. Vite reports the fallback URL (normally 5174) on startup.
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
