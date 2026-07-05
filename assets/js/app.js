import { storage } from './db/storageAdapter.js';
import { Router } from './router/router.js';
import { renderHome } from './pages/home.js';
import { renderMatchList } from './pages/matchExplorer.js';
import { renderMatchDetail } from './pages/matchDetail.js';

// Single application bootstrap namespace (Section 13.9) -- the one allowed global.
window.PlusOne = window.PlusOne || {};

async function boot() {
  registerServiceWorker();

  const outlet = document.getElementById('app-outlet');
  const router = new Router(outlet);
  router
    .register('/', renderHome)
    .register('/matches', renderMatchList)
    .register('/matches/:id', renderMatchDetail);

  window.PlusOne.router = router;

  setSplashVisible(true);
  await storage.init().catch((err) => console.error('sql.js init failed:', err));
  const restored = await storage.restoreFromOPFS();
  setSplashVisible(false);

  updateFreshnessBadge();
  wireDbImport();
  router.start('/');

  if (restored) {
    console.info('Sports database restored from OPFS:', storage.getSummary());
  }
}

function setSplashVisible(visible) {
  const splash = document.getElementById('splash');
  if (splash) splash.hidden = !visible;
}

function updateFreshnessBadge() {
  const el = document.getElementById('db-status');
  if (!el) return;
  if (storage.ready) {
    const summary = storage.getSummary();
    el.textContent = `${summary.tables.length} tables loaded`;
    el.classList.add('db-status--ready');
  } else {
    el.textContent = 'No database loaded';
    el.classList.remove('db-status--ready');
  }
}

function wireDbImport() {
  document.addEventListener('change', async (e) => {
    if (e.target.id !== 'db-file-input') return;
    const file = e.target.files?.[0];
    if (!file) return;
    await handleImport(file);
  });

  // Drag-and-drop anywhere on the app shell (Section 2's import requirement).
  const shell = document.getElementById('app-shell');
  shell.addEventListener('dragover', (e) => e.preventDefault());
  shell.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) await handleImport(file);
  });
}

async function handleImport(file) {
  try {
    setSplashVisible(true);
    await storage.importFile(file);
    updateFreshnessBadge();
    window.PlusOne.router.navigate('/');
  } catch (err) {
    console.error('Import failed:', err);
    alert(err.message || 'Could not load that file.');
  } finally {
    setSplashVisible(false);
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }
}

// Click-through for table rows that carry a data-href (used by Match Explorer).
document.addEventListener('click', (e) => {
  const row = e.target.closest('[data-href]');
  if (row) location.hash = row.getAttribute('data-href');
});

// Filter bar submit -> re-navigate with query params (Match Explorer).
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'match-filter-form') return;
  e.preventDefault();
  const data = new FormData(e.target);
  const params = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (value) params.set(key, value);
  }
  location.hash = `#/matches?${params.toString()}`;
});

boot();
