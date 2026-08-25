import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const srcDir = resolve(__dirname, 'src');

export default defineConfig({
  root: srcDir,
  base: './',
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(srcDir, 'index.html'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('1.2.0'),
  },
  resolve: {
    alias: {
      '@': srcDir,
    },
  },
});
