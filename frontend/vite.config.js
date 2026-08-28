import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: localBackendProxy,
  },
  // The Cloudflare presentation tunnel stays pointed at port 5173. Preview
  // serves the optimized bundle while this local-only proxy keeps browser API
  // and Socket.IO traffic on the same public hostname.
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: localBackendProxy,
  },
})
