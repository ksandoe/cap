import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const scopeSim = () => ({
  postcssPlugin: "scope-sim",
  Once(root: any) {
    const file: string = root.source?.input?.file ?? "";
    if (!file.includes("sim.scoped-source")) return;
    const SCOPE = ".sim-root";
    root.walkRules((rule: any) => {
      let p = rule.parent;
      while (p && p.type !== "root") {
        if (p.type === "atrule" && /keyframes$/i.test(p.name)) return;
        p = p.parent;
      }
      rule.selectors = rule.selectors.map((raw: string) => {
        const s = raw.trim();
        if (s === "body" || s === "html" || s === ":root") return SCOPE;
        if (s === "*") return SCOPE + ", " + SCOPE + " *";
        if (s.startsWith("body ")) return SCOPE + " " + s.slice(5);
        return SCOPE + " " + s;
      });
    });
  },
});

export default defineConfig({
  define: { "import.meta.env.VITE_LOCAL_STORAGE_MODE": JSON.stringify("true") },
  css: { postcss: { plugins: [scopeSim()] } },
  plugins: [react()],
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
