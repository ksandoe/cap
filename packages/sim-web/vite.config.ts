import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import scopeSimStyles from './postcss-scope.mjs';

export default defineConfig({
  plugins: [react()],
  // The stylesheet is scoped under .sim-root so the same CSS can be embedded in CAP's page.
  css: { postcss: { plugins: [scopeSimStyles()] } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4100' },
    },
  },
});
