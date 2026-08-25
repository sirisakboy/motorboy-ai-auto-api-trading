// Service Worker for Trading Engine Pro PWA
// Caches API responses and serves offline fallback data

const CACHE_NAME = 'trading-engine-pro-v1.2.0';
const API_CACHE = 'tep-api-cache-v1';
const ASSET_CACHE = 'tep-assets-v1';

// Assets to cache on install
const ASSETS = [
  '/',
  '/index.html',
  '/src/main.jsx',
  '/src/App.jsx',
  '/src/apiClient.js',
  '/src/index.css',
  '/assets/logo.png',
];

// API endpoints to cache
const API_ENDPOINTS = [
  'https://api.coingecko.com/api/v3/simple/price',
  'https://api.binance.com/api/v3/ticker/24hr',
  'https://open.er-api.com/v6/latest/USD',
  'https://api.frankfurter.app/latest',
  'https://api.binance.com/api/v3/klines',
  'https://api.binance.com/api/v3/depth',
];

// Install: cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(ASSET_CACHE).then((cache) => cache.addAll(ASSETS)),
      caches.open(API_CACHE).then((cache) => cache.addAll(API_ENDPOINTS)),
    ])
  );
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests — stale-while-revalidate (5 min cache)
  if (API_ENDPOINTS.some((endpoint) => url.href.startsWith(endpoint.split('?')[0]))) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request).then((networkResponse) => {
          caches.open(API_CACHE).then((cache) => {
            cache.put(event.request, networkResponse.clone());
          });
          return networkResponse;
        }).catch(() => cached);

        // Return cached immediately, then update from network
        return cached || networkFetch;
      })
    );
    return;
  }

  // Static assets — cache first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((name) => !['CACHE_NAME', 'API_CACHE', 'ASSET_CACHE'].includes(name) && caches.delete(name))
      )
    )
  );
});

// Real-time WebSocket messages are NOT cached (always live)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
