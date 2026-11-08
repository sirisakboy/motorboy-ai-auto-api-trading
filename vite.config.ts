import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const poolsideKey = env.POOLSIDE_API_KEY || env.VITE_POOLSIDE_API_KEY || process.env.POOLSIDE_API_KEY || process.env.VITE_POOLSIDE_API_KEY || '';

  return {
    plugins: [react(), tailwindcss()],
    envPrefix: ['VITE_', 'POOLSIDE_'],
    define: {
      'process.env.POOLSIDE_API_KEY': JSON.stringify(poolsideKey),
      'process.env.VITE_POOLSIDE_API_KEY': JSON.stringify(poolsideKey),
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      // Required when the dev server is reached through a proxy/preview host
      // (Arena previews, tunnels, e2b sandboxes). Vite 6 blocks unknown Host
      // headers by default, which broke the live preview with a 403.
      allowedHosts: true,
      proxy: {
        '/api/yahoo': {
          target: 'https://query1.finance.yahoo.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
          },
        },
      },
    },
  };
});

