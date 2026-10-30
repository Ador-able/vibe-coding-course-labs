import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./pages/', import.meta.url)),
  base: '/requests/',
  publicDir: '../public',
  build: { outDir: '../dist', emptyOutDir: true, rolldownOptions: { input: ["collaboration/index.html","context/index.html","decisions/index.html","disclosure/index.html","feedback/index.html","ask/index.html","latency/index.html","memory/index.html","message-history/index.html","quality/index.html","requests/index.html","streaming/index.html","structured/index.html","task-goals/index.html","task-examples/index.html","task-feedback/index.html","task-evaluation/index.html","tools/index.html","tool-results/index.html","control/index.html"].map(path => fileURLToPath(new URL('./pages/' + path, import.meta.url))) } },
});
