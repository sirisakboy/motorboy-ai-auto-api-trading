import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      target: 'es2022',
      cssCodeSplit: false,
      minify: 'esbuild',
      cssMinify: true,
      modulePreload: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          entryFileNames: 'assets/app.min.js',
          assetFileNames: (assetInfo) => {
            const assetName = assetInfo.names?.[0] ?? assetInfo.name ?? '';
            if (assetName.endsWith('.css')) {
              return 'assets/style.min.css';
            }
            return 'assets/[name][extname]';
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      proxy: {
        '/api/yahoo': {
          target: 'https://query1.finance.yahoo.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'application/json, text/plain, */*',
          },
        },
      },
    },
  };
});
