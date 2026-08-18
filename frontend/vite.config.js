import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const quickTunnelHosts = ['.trycloudflare.com']

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    allowedHosts: quickTunnelHosts,
    proxy: {
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
    },
  },
  preview: {
    allowedHosts: quickTunnelHosts,
  },
})
