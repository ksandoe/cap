import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Deployed demo serves this app under /admin-app/ on the API origin.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: {
    port: 3002,
    proxy: {
      '/api': { target: 'http://localhost:3001', rewrite: p => p.replace(/^\/api/, '') },
    },
  },
  resolve: {
    alias: { '@cap/shared': '../shared/src' },
  },
});
