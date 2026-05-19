import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        screen: resolve(__dirname, 'index.html'),
        controller: resolve(__dirname, 'play/index.html'),
      },
    },
  },
});
