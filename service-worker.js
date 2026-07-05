const CACHE_NAME = 'plusone-shell-v1';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/tokens.css',
  './assets/css/styles.css',
  './assets/js/app.js',
  './assets/js/router/router.js',
  './assets/js/components/badges.js',
  './assets/js/components/format.js',
  './assets/js/db/storageAdapter.js',
  './assets/js/db/repositories/baseRepository.js',
  './assets/js/db/repositories/matchRepository.js',
  './assets/js/db/repositories/teamRepository.js',
  './assets/js/db/repositories/predictionRepository.js',
  './assets/js/pages/home.js',
  './assets/js/pages/matchExplorer.js',
  './assets/js/pages/matchDetail.js',
  './database/sql-wasm.js',
  './database/sql-wasm.wasm',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for the app shell; never intercept anything else (no sports data
// ever flows through the service worker -- it's local SQLite via sql.js, not fetch).
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
