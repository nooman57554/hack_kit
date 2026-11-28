import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const proxyTarget =
  process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:5000";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],

  server: {
    host: process.env.VITE_HOST || "127.0.0.1",
    port: 5173,

    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true
      },
      "/api-docs": {
        target: proxyTarget,
        changeOrigin: true
      },
      "/openapi.yaml": {
        target: proxyTarget,
        changeOrigin: true
      }
    }
  }
});