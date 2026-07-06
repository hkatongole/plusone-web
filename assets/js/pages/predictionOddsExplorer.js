import { predictionRepository } from '../db/repositories/predictionRepository.js';
import { oddsRepository } from '../db/repositories/oddsRepository.js';
import { formatDate, formatPct } from '../components/format.js';
import { storage } from '../db/storageAdapter.js';

const TABS = [
  { key: 'predictions', label: 'Predictions' },
  { key: 'match_odds', label: 'Bookmaker Odds' },
  { key: 'fortebet_odds', label: 'Fortebet Odds' },
];

export async function renderPredictionOddsExplorer({ query }) {
  if (!storage.ready) {
    return `<div class="empty-state"><h2>No database loaded</h2><p>Import a .sqlite backup from the Home page first.</p></div>`;
  }

  const tab = TABS.some((t) => t.key === query.tab) ? query.tab : 'predictions';
  const isMember = query.view === 'member';

  const tabNav = TABS.map(
    (t) => `<a class="tab-nav__item ${t.key === tab ? 'tab-nav__item--active' : ''}"
                href="#/predictions?${withParam(query, 'tab', t.key)}">${t.label}</a>`
  ).join('');

  let body;
  if (tab === 'match_odds') body = renderMatchOddsTab(query, isMember);
  else if (tab === 'fortebet_odds') body = renderFortebetOddsTab(query, isMember);
  else body = renderPredictionsTab(query, isMember);

  return `
    <section class="page page--prediction-explorer">
      <header class="page__header">
        <h1>Prediction &amp; Odds Explorer</h1>
        <p class="page__subtitle">Browse, filter, and export every prediction and odds row on record.</p>
      </header>
      <nav class="tab-nav">${tabNav}</nav>
      ${accessBanner(query, isMember)}
      ${body}
    </section>
  `;
}

/** Guest/member toggle is a UI preview only -- this build has no account system,
 *  so it never gates real data (Section 4 item 6: display-tier distinction only,
 *  same underlying query either way). Labeled honestly rather than pretending
 *  there's real access control behind it. */
function accessBanner(query, isMember) {
  if (isMember) {
    return `
      <div class="access-banner access-banner--member">
        <span><strong>Previewing member view</strong> &mdash; all columns and export enabled.</span>
        <a href="#/predictions?${withParam(query, 'view', 'guest')}">Back to guest view</a>
        <span class="access-banner__note">No account system exists in this build; this toggle only previews the intended UI difference.</span>
      </div>
    `;
  }
  return `
    <div class="access-banner access-banner--guest">
      <span><strong>Guest view</strong> &mdash; a limited subset of columns, no export or saved views.</span>
      <a href="#/predictions?${withParam(query, 'view', 'member')}">Preview member view</a>
      <span class="access-banner__note">Log in / create an account isn't available yet &mdash; this build has no account system.</span>
    </div>
  `;
}

function renderPredictionsTab(query, isMember) {
  const page = Number(query.page || 1);
  const league = query.league || null;
  const status = query.status || null;
  const market = query.market || null;
  const confidence = query.confidence || null;
  const engine = query.engine || 'consensus';
  const engineCorrect = query.engineCorrect || null;

  const { rows, total, totalPages } = predictionRepository.filterPredictions({
    league, status, market, confidence, engine, engineCorrect, page, pageSize: 25,
  });
  const leagues = predictionRepository.distinctLeagues();
  const markets = predictionRepository.distinctMarkets();
  const confidences = predictionRepository.distinctConfidences();

  const cols = isMember
    ? ['Date', 'League', 'Home', 'Away', 'Consensus', 'DC', 'ML', 'Legacy', 'Confidence', 'Status', 'Result']
    : ['Date', 'League', 'Home', 'Away', 'Consensus', 'Confidence', 'Status'];

  return `
    <form class="filter-bar" id="prediction-explorer-filter-form" data-tab="predictions">
      <label>League
        <select name="league"><option value="">All</option>${leagues.map((l) => opt(l, league)).join('')}</select>
      </label>
      <label>Status
        <select name="status"><option value="">All</option>${opt('graded', status)}${opt('pending', status)}</select>
      </label>
      <label>Market (pick)
        <select name="market"><option value="">All</option>${markets.map((m) => opt(m, market)).join('')}</select>
      </label>
      <label>Confidence
        <select name="confidence"><option value="">All</option>${confidences.map((c) => opt(c, confidence)).join('')}</select>
      </label>
      <label>Engine
        <select name="engine">${['consensus', 'dc', 'ml', 'legacy'].map((e) => opt(e, engine)).join('')}</select>
      </label>
      <label>Correctness
        <select name="engineCorrect">
          <option value="">Any</option>
          <option value="true" ${engineCorrect === 'true' ? 'selected' : ''}>Correct</option>
          <option value="false" ${engineCorrect === 'false' ? 'selected' : ''}>Incorrect</option>
        </select>
      </label>
      <button type="submit">Apply</button>
    </form>

    <div class="explorer-toolbar">
      <span class="panel__count">${total.toLocaleString()} predictions</span>
      ${
        isMember
          ? `<button type="button" class="export-btn" data-export="predictions"
              data-league="${league ?? ''}" data-status="${status ?? ''}" data-market="${market ?? ''}"
              data-confidence="${confidence ?? ''}" data-engine="${engine}" data-engine-correct="${engineCorrect ?? ''}">
              Export CSV</button>`
          : `<span class="export-btn export-btn--disabled" title="Export requires the member view preview">Export CSV (member only)</span>`
      }
    </div>

    <div class="table-scroll">
      <table class="data-table data-table--compact">
        <thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>
          ${
            rows
              .map((p) => {
                const cells = [
                  formatDate(p.match_date),
                  p.league,
                  p.home_team,
                  p.away_team,
                  p.consensus_outcome ?? '\u2014',
                ];
                if (isMember) {
                  cells.push(p.dc_outcome ?? '\u2014', p.ml_outcome ?? '\u2014', p.legacy_outcome ?? '\u2014');
                }
                cells.push(p.confidence ?? '\u2014', p.status ?? '\u2014');
                if (isMember) {
                  cells.push(
                    p.actual_outcome
                      ? `${p.actual_outcome}${p.consensus_correct != null ? ` (${p.consensus_correct ? 'correct' : 'incorrect'})` : ''}`
                      : '\u2014'
                  );
                }
                return `<tr class="clickable-row" data-href="#/matches/${p.match_id}">${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
              })
              .join('') || `<tr><td colspan="${cols.length}">No predictions match these filters.</td></tr>`
          }
        </tbody>
      </table>
    </div>
    ${pagination('predictions', query, page, totalPages)}
  `;
}

function renderMatchOddsTab(query, isMember) {
  const page = Number(query.page || 1);
  const league = query.league || null;
  const { rows, total, totalPages } = oddsRepository.matchOddsQuery({ league, page, pageSize: 25 });
  const leagues = oddsRepository.distinctMatchOddsLeagues();

  const cols = isMember
    ? ['Date', 'League', 'Home', 'Away', 'B365 H/D/A', 'Pinnacle H/D/A', 'Avg H/D/A', 'Max H/D/A', 'O/U 2.5']
    : ['Date', 'League', 'Home', 'Away', 'Avg H/D/A'];

  return `
    <form class="filter-bar" id="prediction-explorer-filter-form" data-tab="match_odds">
      <label>League
        <select name="league"><option value="">All</option>${leagues.map((l) => opt(l, league)).join('')}</select>
      </label>
      <button type="submit">Apply</button>
    </form>

    <div class="explorer-toolbar">
      <span class="panel__count">${total.toLocaleString()} odds rows</span>
      ${
        isMember
          ? `<button type="button" class="export-btn" data-export="match_odds" data-league="${league ?? ''}">Export CSV</button>`
          : `<span class="export-btn export-btn--disabled" title="Export requires the member view preview">Export CSV (member only)</span>`
      }
    </div>

    <div class="table-scroll">
      <table class="data-table data-table--compact">
        <thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>
          ${
            rows
              .map((o) => {
                const cells = [formatDate(o.match_date), o.league, o.home_team, o.away_team];
                if (isMember) {
                  cells.push(
                    triple(o.b365_home, o.b365_draw, o.b365_away),
                    triple(o.pinnacle_home, o.pinnacle_draw, o.pinnacle_away),
                    triple(o.avg_home, o.avg_draw, o.avg_away),
                    triple(o.max_home, o.max_draw, o.max_away),
                    o.avg_over25 != null ? `${o.avg_over25} / ${o.avg_under25 ?? '\u2014'}` : '\u2014'
                  );
                } else {
                  cells.push(triple(o.avg_home, o.avg_draw, o.avg_away));
                }
                return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
              })
              .join('') || `<tr><td colspan="${cols.length}">No odds rows match these filters.</td></tr>`
          }
        </tbody>
      </table>
    </div>
    ${pagination('match_odds', query, page, totalPages)}
  `;
}

function renderFortebetOddsTab(query, isMember) {
  const page = Number(query.page || 1);
  const league = query.league || null;
  const { rows, total, totalPages } = oddsRepository.fortebetOddsQuery({ league, page, pageSize: 25 });
  const leagues = oddsRepository.distinctFortebetLeagues();

  const cols = isMember
    ? ['Date', 'League', 'Home', 'Away', 'Home/Draw/Away Odds', 'Scraped']
    : ['Date', 'League', 'Home', 'Away', 'Home/Draw/Away Odds'];

  return `
    <form class="filter-bar" id="prediction-explorer-filter-form" data-tab="fortebet_odds">
      <label>League
        <select name="league"><option value="">All</option>${leagues.map((l) => opt(l, league)).join('')}</select>
      </label>
      <button type="submit">Apply</button>
    </form>

    <div class="explorer-toolbar">
      <span class="panel__count">${total.toLocaleString()} odds rows</span>
      ${
        isMember
          ? `<button type="button" class="export-btn" data-export="fortebet_odds" data-league="${league ?? ''}">Export CSV</button>`
          : `<span class="export-btn export-btn--disabled" title="Export requires the member view preview">Export CSV (member only)</span>`
      }
    </div>

    <div class="table-scroll">
      <table class="data-table data-table--compact">
        <thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>
          ${
            rows
              .map((o) => {
                const cells = [formatDate(o.match_date), o.league, o.home_team, o.away_team, triple(o.home_odds, o.draw_odds, o.away_odds)];
                if (isMember) cells.push(formatDate(o.scraped_at));
                return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
              })
              .join('') ||
            `<tr><td colspan="${cols.length}">No Fortebet odds on record${league ? ' for this league' : ''}.</td></tr>`
          }
        </tbody>
      </table>
    </div>
    ${pagination('fortebet_odds', query, page, totalPages)}
  `;
}

function triple(a, b, c) {
  if (a == null && b == null && c == null) return '\u2014';
  return `${a ?? '\u2014'} / ${b ?? '\u2014'} / ${c ?? '\u2014'}`;
}

function opt(value, current) {
  return `<option value="${value}" ${value === current ? 'selected' : ''}>${value}</option>`;
}

function withParam(query, key, value) {
  const params = new URLSearchParams(Object.entries(query).filter(([k]) => k !== 'page'));
  params.set(key, value);
  return params.toString();
}

function pagination(tab, query, page, totalPages) {
  const base = { ...query, tab };
  const urlFor = (p) => {
    const params = new URLSearchParams(Object.entries(base));
    params.set('page', String(p));
    return `#/predictions?${params.toString()}`;
  };
  return `
    <nav class="pagination">
      ${page > 1 ? `<a href="${urlFor(page - 1)}">&larr; Prev</a>` : ''}
      <span>Page ${page} of ${totalPages}</span>
      ${page < totalPages ? `<a href="${urlFor(page + 1)}">Next &rarr;</a>` : ''}
    </nav>
  `;
}
