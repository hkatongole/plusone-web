import { matchRepository } from '../db/repositories/matchRepository.js';
import { teamBadge, leagueBadge } from '../components/badges.js';
import { formatPct, formatDateTime, dataAsOfLabel, todayISO, scoreline } from '../components/format.js';
import { storage } from '../db/storageAdapter.js';

export async function renderHome() {
  if (!storage.ready) {
    return emptyDbState();
  }

  let dateStr = todayISO();
  let fixtures = matchRepository.fixturesForDate(dateStr);

  // This backup may not contain fixtures for "today" specifically (Section 2 notes
  // row counts/date ranges vary a lot between exports) -- fall forward to the
  // nearest date that actually has matches rather than rendering a false empty state.
  let usedFallbackDate = false;
  if (fixtures.length === 0) {
    const nextDate = matchRepository.nextFixtureDate(dateStr);
    if (nextDate) {
      dateStr = nextDate;
      fixtures = matchRepository.fixturesForDate(dateStr);
      usedFallbackDate = true;
    }
  }

  const asOf = matchRepository.dataAsOf();

  const cards = fixtures.map(fixtureCard).join('') || `
    <div class="empty-state">
      <h3>No fixtures found</h3>
      <p>This database has no upcoming or scheduled matches recorded.</p>
    </div>
  `;

  return `
    <section class="page page--home">
      <header class="page__header">
        <h1>Today's Predictions</h1>
        <p class="page__subtitle">
          ${usedFallbackDate ? `No fixtures for today \u2014 showing the next date with matches: ` : ''}
          <strong>${formatDateTime(dateStr)}</strong>
        </p>
        <p class="data-as-of">${dataAsOfLabel(asOf)}</p>
      </header>
      <div class="card-grid">${cards}</div>
    </section>
  `;
}

function fixtureCard(row) {
  const hasConsensus = row.pred_consensus_outcome !== undefined && row.pred_consensus_outcome !== null;
  const confidence = row.pred_confidence;
  const valueGaps = [row.pred_value_gap_home, row.pred_value_gap_draw, row.pred_value_gap_away].filter(
    (v) => v !== undefined && v !== null
  );
  const maxValueGap = valueGaps.length ? Math.max(...valueGaps) : null;

  return `
    <article class="match-card">
      <div class="match-card__league">${leagueBadge(row.league)} <span>${escapeText(row.league)}</span></div>
      <div class="match-card__teams">
        <div class="match-card__team">${teamBadge(row.home_team)} <span>${escapeText(row.home_team)}</span></div>
        <div class="match-card__score">${scoreline(row.home_score, row.away_score)}</div>
        <div class="match-card__team">${teamBadge(row.away_team)} <span>${escapeText(row.away_team)}</span></div>
      </div>
      <div class="match-card__meta">
        <span>${formatDateTime(row.start_time || row.match_date)}</span>
        ${row.gameweek ? `<span>GW ${row.gameweek}</span>` : ''}
      </div>
      ${
        hasConsensus
          ? `<div class="match-card__prediction">
              <span class="pill pill--pick">${escapeText(row.pred_consensus_outcome)}</span>
              ${confidence ? `<span class="pill pill--confidence-${String(confidence).toLowerCase()}">${escapeText(confidence)} confidence</span>` : ''}
              ${maxValueGap !== null ? `<span class="pill pill--value">Value gap ${formatPct(maxValueGap)}</span>` : ''}
            </div>`
          : `<div class="match-card__prediction match-card__prediction--none">No prediction on record yet</div>`
      }
      <a class="match-card__link" href="#/matches/${row.id}">Full breakdown &rarr;</a>
    </article>
  `;
}

function emptyDbState() {
  return `
    <section class="page page--empty">
      <div class="empty-state empty-state--onboarding">
        <h1>Load your sports database</h1>
        <p>Import a PlusOne <code>.sqlite</code> backup to see today's fixtures, predictions, and value bets.</p>
        <label class="file-drop">
          <input type="file" id="db-file-input" accept=".sqlite,.db" />
          <span>Choose a .sqlite file, or drag one here</span>
        </label>
      </div>
    </section>
  `;
}

function escapeText(s) {
  return (s ?? '').toString().replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}
