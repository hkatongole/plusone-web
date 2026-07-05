import { storage } from './db/storageAdapter.js';
import { Router } from './router/router.js';
import { renderHome } from './pages/home.js';
import { renderMatchList } from './pages/matchExplorer.js';
import { renderMatchDetail } from './pages/matchDetail.js';

// Single application bootstrap namespace (Section 13.9) -- the one allowed global.
window.PlusOne = window.PlusOne || {};

/**
 * Boot-step logging. Kept as plain console output now that devtools console
 * access is available -- the on-screen panel this used to also write to was
 * only needed as a workaround for phone-only debugging without a console.
 */
function logStep(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

window.addEventListener('error', (e) => logStep(`window error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) =>
  logStep(`unhandled rejection: ${e.reason?.message || e.reason}`)
);

/** Never let a single slow/hung step (e.g. a WASM compile stall) freeze the splash forever. */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms waiting for: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function boot() {
  logStep('Booting PlusOne Analytics...');
  const outlet = document.getElementById('app-outlet');

  try {
    registerServiceWorker();

    const router = new Router(outlet);
    router
      .register('/', renderHome)
      .register('/matches', renderMatchList)
      .register('/matches/:id', renderMatchDetail);
    window.PlusOne.router = router;

    logStep('Initializing sql.js (WASM runtime)...');
    try {
      await withTimeout(storage.init(), 10000, 'sql.js init');
      logStep('sql.js ready.');
    } catch (err) {
      logStep(`sql.js init failed or timed out: ${err.message}`);
    }

    logStep('Checking for a previously saved database (OPFS)...');
    let restored = false;
    try {
      restored = await withTimeout(storage.restoreFromOPFS(), 6000, 'OPFS restore');
      logStep(restored ? 'Restored a saved database from OPFS.' : 'No saved database found (first run).');
    } catch (err) {
      logStep(`OPFS restore skipped: ${err.message}`);
    }

    setSplashVisible(false);
    updateFreshnessBadge();
    wireDbImport();
    router.start('/');
    logStep('App ready.');
  } catch (err) {
    logStep(`Boot failed: ${err.message}`);
    setSplashVisible(false); // never leave the user staring at a spinner forever
    outlet.innerHTML = `
      <div class="empty-state empty-state--error">
        <h2>Something went wrong starting the app</h2>
        <p>${err.message}</p>
        <p>Check the browser console for details.</p>
      </div>`;
  }
}

function setSplashVisible(visible) {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.hidden = !visible;
  splash.style.display = visible ? '' : 'none';
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
    logStep(`Importing ${file.name}...`);
    await storage.importFile(file);
    logStep('Import complete.');
    updateFreshnessBadge();
    window.PlusOne.router.navigate('/');
  } catch (err) {
    logStep(`Import failed: ${err.message}`);
    alert(err.message || 'Could not load that file.');
  } finally {
    setSplashVisible(false);
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      logStep(`Service worker registration failed (non-fatal): ${err.message}`);
    });
  } else {
    logStep('Service workers not available in this context (may be a non-secure origin).');
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
