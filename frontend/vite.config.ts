import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy /api → backend so the frontend has no hardcoded host.
// Target is env-driven: localhost for native dev, http://backend:4000 in Docker.
const backend = process.env.BACKEND_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: backend, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
});
