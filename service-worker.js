const CACHE_NAME = 'plusone-shell-v2';
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
  './assets/js/pages/teamExplorer.js',
  './assets/js/pages/teamDetail.js',
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

// Network-first for the app shell, falling back to cache only when offline.
// (Previously this was cache-first, which meant the very first cached copy of
// the app would keep being served forever, even after files on disk changed,
// unless this service-worker.js file's own bytes changed too. Network-first
// means "online" always gets the current files; "offline" still gets the last
// good cached snapshot -- the actual PWA offline guarantee this app needs.)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
