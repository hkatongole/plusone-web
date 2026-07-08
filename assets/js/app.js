import { storage } from './db/storageAdapter.js';
import { Router } from './router/router.js';
import { renderHome } from './pages/home.js';
import { renderMatchList } from './pages/matchExplorer.js';
import { renderMatchDetail } from './pages/matchDetail.js';
import { renderTeamDirectory } from './pages/teamExplorer.js';
import {
  renderTeamOverview,
  renderTeamFixtures,
  renderTeamResults,
  renderTeamStatistics,
  renderTeamSquad,
  renderTeamPredictions,
  renderTeamOdds,
  renderTeamHistory,
} from './pages/teamDetail.js';
import { renderPlayerDirectory } from './pages/playerExplorer.js';
import {
  renderPlayerOverview,
  renderPlayerStatistics,
  renderPlayerMatches,
  renderPlayerSeasons,
  renderPlayerTeams,
} from './pages/playerDetail.js';
import { renderLeagueDirectory } from './pages/leagueExplorer.js';
import {
  renderLeagueOverview,
  renderLeagueStandings,
  renderLeagueFixtures,
  renderLeagueResults,
  renderLeagueTeams,
  renderLeaguePlayers,
  renderLeagueStatistics,
  renderLeaguePredictions,
  renderLeagueOdds,
  renderLeagueSeasons,
} from './pages/leagueDetail.js';
import { renderPredictionOddsExplorer } from './pages/predictionOddsExplorer.js';
import { renderValueBets } from './pages/valueBets.js';
import { renderModelPerformance } from './pages/modelPerformance.js';
import { predictionRepository } from './db/repositories/predictionRepository.js';
import { oddsRepository } from './db/repositories/oddsRepository.js';
import { toCsv, downloadCsv } from './components/csvExport.js';

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
      .register('/matches/:id', renderMatchDetail)
      .register('/teams', renderTeamDirectory)
      .register('/teams/:team', renderTeamOverview)
      .register('/teams/:team/fixtures', renderTeamFixtures)
      .register('/teams/:team/results', renderTeamResults)
      .register('/teams/:team/statistics', renderTeamStatistics)
      .register('/teams/:team/players', renderTeamSquad)
      .register('/teams/:team/predictions', renderTeamPredictions)
      .register('/teams/:team/odds', renderTeamOdds)
      .register('/teams/:team/history', renderTeamHistory)
      .register('/players', renderPlayerDirectory)
      .register('/players/:player', renderPlayerOverview)
      .register('/players/:player/statistics', renderPlayerStatistics)
      .register('/players/:player/matches', renderPlayerMatches)
      .register('/players/:player/seasons', renderPlayerSeasons)
      .register('/players/:player/teams', renderPlayerTeams)
      .register('/leagues', renderLeagueDirectory)
      .register('/leagues/:league', renderLeagueOverview)
      .register('/leagues/:league/standings', renderLeagueStandings)
      .register('/leagues/:league/fixtures', renderLeagueFixtures)
      .register('/leagues/:league/results', renderLeagueResults)
      .register('/leagues/:league/teams', renderLeagueTeams)
      .register('/leagues/:league/players', renderLeaguePlayers)
      .register('/leagues/:league/statistics', renderLeagueStatistics)
      .register('/leagues/:league/predictions', renderLeaguePredictions)
      .register('/leagues/:league/odds', renderLeagueOdds)
      .register('/leagues/:league/seasons', renderLeagueSeasons)
      .register('/predictions', renderPredictionOddsExplorer)
      .register('/value-bets', renderValueBets)
      .register('/model-performance', renderModelPerformance);
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
    updateNavActiveState();
    window.addEventListener('hashchange', updateNavActiveState);
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

function updateNavActiveState() {
  const path = (location.hash.slice(1) || '/').split('?')[0];
  document.querySelectorAll('[data-nav]').forEach((el) => {
    const nav = el.getAttribute('data-nav');
    const isActive = nav === '/' ? path === '/' : path === nav || path.startsWith(nav + '/');
    el.classList.toggle('nav-active', isActive);
  });
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
  if (row) {
    location.hash = row.getAttribute('data-href');
    return;
  }

  const exportBtn = e.target.closest('[data-export]');
  if (exportBtn) handleExport(exportBtn);
});

function handleExport(btn) {
  const kind = btn.dataset.export;
  const league = btn.dataset.league || null;

  if (kind === 'predictions') {
    const rows = predictionRepository.exportRows({
      league,
      status: btn.dataset.status || null,
      market: btn.dataset.market || null,
      confidence: btn.dataset.confidence || null,
      engine: btn.dataset.engine || 'consensus',
      engineCorrect: btn.dataset.engineCorrect || null,
    });
    const cols = [
      { key: 'match_date', label: 'Date' }, { key: 'league', label: 'League' },
      { key: 'home_team', label: 'Home' }, { key: 'away_team', label: 'Away' },
      { key: 'consensus_outcome', label: 'Consensus' }, { key: 'dc_outcome', label: 'DC' },
      { key: 'ml_outcome', label: 'ML' }, { key: 'legacy_outcome', label: 'Legacy' },
      { key: 'confidence', label: 'Confidence' }, { key: 'status', label: 'Status' },
      { key: 'actual_outcome', label: 'Actual Result' }, { key: 'consensus_correct', label: 'Consensus Correct' },
    ];
    downloadCsv('predictions.csv', toCsv(rows, cols));
  } else if (kind === 'match_odds') {
    const rows = oddsRepository.exportMatchOdds({ league });
    downloadCsv('match_odds.csv', toCsv(rows));
  } else if (kind === 'fortebet_odds') {
    const rows = oddsRepository.exportFortebetOdds({ league });
    downloadCsv('fortebet_odds.csv', toCsv(rows));
  }
}

// Filter bar submit -> re-navigate with query params (Match Explorer).
document.addEventListener('submit', (e) => {
  const id = e.target.id;
  if (!['match-filter-form', 'team-filter-form', 'team-results-filter-form', 'player-filter-form', 'league-season-form', 'league-results-filter-form', 'prediction-explorer-filter-form', 'value-bets-filter-form'].includes(id)) return;
  e.preventDefault();
  const data = new FormData(e.target);
  const params = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  if (id === 'match-filter-form') {
    location.hash = `#/matches${qs ? '?' + qs : ''}`;
  } else if (id === 'team-filter-form') {
    location.hash = `#/teams${qs ? '?' + qs : ''}`;
  } else if (id === 'team-results-filter-form') {
    const team = e.target.dataset.team;
    location.hash = `#/teams/${team}/results${qs ? '?' + qs : ''}`;
  } else if (id === 'player-filter-form') {
    location.hash = `#/players${qs ? '?' + qs : ''}`;
  } else if (id === 'league-season-form') {
    const league = e.target.dataset.league;
    const target = e.target.dataset.target;
    location.hash = `#/leagues/${league}/${target}${qs ? '?' + qs : ''}`;
  } else if (id === 'league-results-filter-form') {
    const league = e.target.dataset.league;
    location.hash = `#/leagues/${league}/results${qs ? '?' + qs : ''}`;
  } else if (id === 'prediction-explorer-filter-form') {
    // Preserve tab/view from the current URL -- the form itself only carries filters.
    const current = new URLSearchParams(location.hash.split('?')[1] || '');
    params.set('tab', e.target.dataset.tab);
    if (current.get('view')) params.set('view', current.get('view'));
    location.hash = `#/predictions?${params.toString()}`;
  } else if (id === 'value-bets-filter-form') {
    location.hash = `#/value-bets${qs ? '?' + qs : ''}`;
  }
});

boot();
