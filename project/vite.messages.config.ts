import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/messages',
    rolldownOptions: { input: 'message-history.html' },
  },
});
