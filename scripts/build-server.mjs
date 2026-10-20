import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';

for (const name of ['layout.css', 'theme.css', 'markdown.css']) await copyFile(`shared/${name}`, `dist/home/${name}`);

await build({
  entryPoints: ['shared/lab-shell.ts'], outfile: 'dist/home/navigation.js', bundle: true,
  platform: 'browser', format: 'iife', target: 'es2022', loader: { '.css': 'text' },
});

await build({
  entryPoints: ['src/start.ts'], outfile: 'dist/server.mjs', bundle: true,
  platform: 'node', format: 'esm', target: 'node24',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
