import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const localPort = Number(process.env.VITE_PORT || "5173");

export default defineConfig({
  plugins: [react()],

  server: {
    host: "0.0.0.0",
    port: localPort,
    strictPort: false,

    proxy: {
      "/api": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true
      },

      "/socket.io": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        ws: true
      },

      "/uploads": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true
      }
    }
  }
});
