import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./pages/', import.meta.url)),
  base: '/mechanics/',
  publicDir: '../public',
  build: { outDir: '../dist', emptyOutDir: true, rolldownOptions: { input: ["attention/index.html","generation/index.html","tokens/index.html","sampling/index.html","vectors/index.html"].map(path => fileURLToPath(new URL('./pages/' + path, import.meta.url))) } },
});
