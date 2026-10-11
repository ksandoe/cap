import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // The Admin App is always served under /admin-app/ (deployed demo hosts both
  // SPAs on the API origin; locally this becomes localhost:3002/admin-app/).
  base: '/admin-app/',
  plugins: [react()],
  server: {
    port: 3002,
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
