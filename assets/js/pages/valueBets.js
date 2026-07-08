import { predictionRepository } from '../db/repositories/predictionRepository.js';
import { teamBadge, leagueBadge } from '../components/badges.js';
import { formatDate, todayISO, scoreline } from '../components/format.js';
import { storage } from '../db/storageAdapter.js';

const TIERS = ['Low', 'Medium', 'High'];

export async function renderValueBets({ query }) {
  if (!storage.ready) {
    return `<div class="empty-state"><h2>No database loaded</h2><p>Import a .sqlite backup from the Home page first.</p></div>`;
  }

  const minConfidenceTier = TIERS.includes(query.confidence) ? query.confidence : 'Medium';
  const minValueGapPct = Number(query.gap ?? 0);
  const scope = query.scope === 'upcoming' ? 'upcoming' : 'all';
  const league = query.league || null;

  const rows = predictionRepository.valueBets({
    minConfidenceTier,
    minValueGap: minValueGapPct / 100,
    fromDate: scope === 'upcoming' ? todayISO() : undefined,
    limit: 100,
  });
  const filtered = league ? rows.filter((r) => r.league === league) : rows;
  const leagues = predictionRepository.distinctLeagues();
  const maxGap = predictionRepository.maxValueGap();

  return `
    <section class="page page--value-bets">
      <header class="page__header">
        <h1>Value &amp; Safe Bets</h1>
        <p class="page__subtitle">Predictions where confidence and value gap both clear the thresholds below &mdash; recomputed live from stored data on every change, never a cached or static list.</p>
      </header>

      <form class="filter-bar" id="value-bets-filter-form">
        <label>Min. confidence
          <select name="confidence">
            ${TIERS.map((t) => `<option value="${t}" ${t === minConfidenceTier ? 'selected' : ''}>${t}+</option>`).join('')}
          </select>
        </label>
        <label>Min. value gap
          <select name="gap">
            ${[0, 5, 10, 15, 20, 25].map((g) => `<option value="${g}" ${g === minValueGapPct ? 'selected' : ''}>${g}%+</option>`).join('')}
          </select>
        </label>
        <label>Scope
          <select name="scope">
            <option value="all" ${scope === 'all' ? 'selected' : ''}>All dates</option>
            <option value="upcoming" ${scope === 'upcoming' ? 'selected' : ''}>Upcoming only</option>
          </select>
        </label>
        <label>League
          <select name="league">
            <option value="">All leagues</option>
            ${leagues.map((l) => `<option value="${l}" ${l === league ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>

      <p class="panel__count" style="display:block;margin-bottom:12px;">${filtered.length} prediction${filtered.length === 1 ? '' : 's'} clear these thresholds</p>

      <div class="card-grid">
        ${filtered.map(betCard).join('') || emptyState(minValueGapPct, maxGap, scope)}
      </div>
    </section>
  `;
}

function betCard(p) {
  const maxGap = Math.max(p.value_gap_home ?? 0, p.value_gap_draw ?? 0, p.value_gap_away ?? 0);
  return `
    <article class="match-card">
      <div class="match-card__league">${leagueBadge(p.league)} <span>${p.league}</span></div>
      <div class="match-card__teams">
        <div class="match-card__team">${teamBadge(p.home_team)} <span>${p.home_team}</span></div>
        <div class="match-card__score">${scoreline(p.actual_home_score, p.actual_away_score)}</div>
        <div class="match-card__team">${teamBadge(p.away_team)} <span>${p.away_team}</span></div>
      </div>
      <div class="match-card__meta">
        <span>${formatDate(p.match_date)}</span>
      </div>
      <div class="match-card__prediction">
        <span class="pill pill--pick">${p.consensus_outcome ?? '\u2014'}</span>
        <span class="pill pill--confidence-${String(p.confidence ?? '').toLowerCase()}">${p.confidence ?? '\u2014'} confidence</span>
        ${maxGap > 0 ? `<span class="pill pill--value">Value gap ${Math.round(maxGap * 100)}%</span>` : ''}
      </div>
      <a class="match-card__link" href="#/matches/${p.match_id}">Full breakdown &rarr;</a>
    </article>
  `;
}

/** Honest, specific empty state -- if the requested gap threshold exceeds the
 *  highest value gap actually present in the loaded data, say so explicitly
 *  rather than a generic "no results" that reads like a bug. */
function emptyState(requestedGapPct, maxGap, scope) {
  const maxGapPct = maxGap != null ? Math.round(maxGap * 100) : null;
  const gapNote =
    maxGapPct != null && requestedGapPct > maxGapPct
      ? `The highest value gap on record in this database is ${maxGapPct}% &mdash; try lowering the threshold.`
      : 'Try lowering the confidence or value gap threshold.';
  const scopeNote = scope === 'upcoming' ? ' Also try "All dates" if this database has no fixtures on or after today.' : '';
  return `
    <div class="empty-state">
      <h3>No predictions clear these thresholds</h3>
      <p>${gapNote}${scopeNote}</p>
    </div>
  `;
}
