import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import scopeSimStyles from '@cap/sim-web/postcss-scope';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // The simulator's stylesheet is rewritten to apply only under .sim-root;
  // files outside packages/sim-web/src pass through untouched.
  css: { postcss: { plugins: [scopeSimStyles()] } },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:3001', rewrite: p => p.replace(/^\/api/, '') },
    },
  },
  resolve: {
    // Absolute path — relative aliases resolve against the importing file,
    // which breaks dev-server resolution from nested routes.
    alias: { '@cap/shared': path.resolve(__dirname, '../shared/src/index.ts') },
  },
});
