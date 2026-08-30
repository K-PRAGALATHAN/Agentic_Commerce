import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy /api → backend so the frontend has no hardcoded host.
// Target is env-driven: localhost for native dev, http://backend:4000 in Docker.
const backend = process.env.BACKEND_URL ?? 'http://localhost:4000';
const agent = process.env.AGENT_URL ?? 'http://localhost:8010';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: backend, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/agent': { target: agent, changeOrigin: true, rewrite: (p) => p.replace(/^\/agent/, '') },
      // Uploaded product images. No rewrite — the stored URL is already the backend path.
      '/uploads': { target: backend, changeOrigin: true },
    },
  },
});
