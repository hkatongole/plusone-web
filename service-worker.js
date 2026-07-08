const CACHE_NAME = 'plusone-shell-v2';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/fonts.css',
  './assets/css/tokens.css',
  './assets/css/styles.css',
  './assets/fonts/archivo-latin-500-normal.woff2',
  './assets/fonts/archivo-latin-700-normal.woff2',
  './assets/fonts/archivo-latin-900-normal.woff2',
  './assets/fonts/inter-latin-400-normal.woff2',
  './assets/fonts/inter-latin-500-normal.woff2',
  './assets/fonts/inter-latin-600-normal.woff2',
  './assets/fonts/inter-latin-700-normal.woff2',
  './assets/js/app.js',
  './assets/js/router/router.js',
  './assets/js/components/badges.js',
  './assets/js/components/format.js',
  './assets/js/db/storageAdapter.js',
  './assets/js/db/logoRepository.js',
  './assets/js/db/repositories/baseRepository.js',
  './assets/js/db/repositories/matchRepository.js',
  './assets/js/db/repositories/teamRepository.js',
  './assets/js/db/repositories/predictionRepository.js',
  './assets/js/db/repositories/playerRepository.js',
  './assets/js/db/repositories/leagueRepository.js',
  './assets/js/db/repositories/oddsRepository.js',
  './assets/js/components/csvExport.js',
  './assets/js/pages/home.js',
  './assets/js/pages/matchExplorer.js',
  './assets/js/pages/matchDetail.js',
  './assets/js/pages/teamExplorer.js',
  './assets/js/pages/teamDetail.js',
  './assets/js/pages/playerExplorer.js',
  './assets/js/pages/playerDetail.js',
  './assets/js/pages/leagueExplorer.js',
  './assets/js/pages/leagueDetail.js',
  './assets/js/pages/predictionOddsExplorer.js',
  './assets/js/pages/valueBets.js',
  './assets/js/pages/modelPerformance.js',
  './assets/js/components/chart.js',
  './database/sql-wasm.js',
  './database/sql-wasm.wasm',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
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
