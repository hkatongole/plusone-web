import { leagueRepository } from '../db/repositories/leagueRepository.js';
import { teamRepository } from '../db/repositories/teamRepository.js';
import { playerRepository } from '../db/repositories/playerRepository.js';
import { teamBadge, leagueBadge } from '../components/badges.js';
import { formatPct, formatDate, scoreline, todayISO } from '../components/format.js';
import { storage } from '../db/storageAdapter.js';

const TABS = [
  { key: 'overview', label: 'Overview', path: '' },
  { key: 'standings', label: 'Standings', path: '/standings' },
  { key: 'fixtures', label: 'Fixtures', path: '/fixtures' },
  { key: 'results', label: 'Results', path: '/results' },
  { key: 'teams', label: 'Teams', path: '/teams' },
  { key: 'players', label: 'Players', path: '/players' },
  { key: 'statistics', label: 'Statistics', path: '/statistics' },
  { key: 'predictions', label: 'Predictions', path: '/predictions' },
  { key: 'odds', label: 'Odds', path: '/odds' },
  { key: 'seasons', label: 'Seasons', path: '/seasons' },
];

function notLoaded() {
  return `<div class="empty-state"><h2>No database loaded</h2><p>Import a .sqlite backup from the Home page first.</p></div>`;
}

function shell(league, activeTab, season, body) {
  const encoded = encodeURIComponent(league);
  const tabNav = TABS.map(
    (t) => `<a class="tab-nav__item ${t.key === activeTab ? 'tab-nav__item--active' : ''}"
                href="#/leagues/${encoded}${t.path}">${t.label}</a>`
  ).join('');

  return `
    <section class="page page--league-detail">
      <a class="back-link" href="#/leagues">&larr; Back to League Explorer</a>
      <header class="page__header league-detail__header">
        ${leagueBadge(league, { size: 'lg' })}
        <div>
          <h1>${league}</h1>
          <p class="page__subtitle">${season ? `Season ${season}` : 'No season on record'}</p>
        </div>
      </header>
      <nav class="tab-nav">${tabNav}</nav>
      ${body}
    </section>
  `;
}

function seasonFromQuery(league, query) {
  return query?.season || leagueRepository.latestSeason(league);
}

export async function renderLeagueOverview({ league, query }) {
  if (!storage.ready) return notLoaded();
  const season = seasonFromQuery(league, query);
  const ov = leagueRepository.overview(league, season);

  const body = `
    <div class="panel">
      <h3>Season Snapshot &middot; ${season ?? '\u2014'}</h3>
      <div class="stat-grid">
        <div class="stat"><span class="stat__value">${ov.teamCount ?? '\u2014'}</span><span class="stat__label">Teams</span></div>
        <div class="stat"><span class="stat__value">${ov.fixtureCount}</span><span class="stat__label">Fixtures</span></div>
        <div class="stat"><span class="stat__value">${ov.predictionCount ?? '\u2014'}</span><span class="stat__label">Predictions</span></div>
      </div>
    </div>
    <div class="panel">
      <h3>Quick Links</h3>
      <div class="quick-links">
        <a href="#/leagues/${encodeURIComponent(league)}/standings">Standings &rarr;</a>
        <a href="#/leagues/${encodeURIComponent(league)}/fixtures">Upcoming fixtures &rarr;</a>
        <a href="#/leagues/${encodeURIComponent(league)}/statistics">Season statistics &rarr;</a>
        <a href="#/leagues/${encodeURIComponent(league)}/predictions">Prediction distribution &rarr;</a>
      </div>
    </div>
  `;
  return shell(league, 'overview', season, body);
}

export async function renderLeagueStandings({ league, query }) {
  if (!storage.ready) return notLoaded();
  const season = seasonFromQuery(league, query);
  const rows = leagueRepository.standings(league, season);
  const seasons = leagueRepository.seasonsFor(league);

  const body = `
    <form class="filter-bar" id="league-season-form" data-league="${encodeURIComponent(league)}" data-target="standings">
      <label>Season
        <select name="season">
          ${seasons.map((s) => `<option value="${s}" ${s === season ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </label>
      <button type="submit">View</button>
    </form>
    <div class="panel">
      <h3>Standings &middot; ${season ?? '\u2014'}</h3>
      ${
        rows.length
          ? `<div class="table-scroll"><table class="data-table data-table--compact">
              <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (r) => `<tr class="clickable-row" data-href="#/teams/${encodeURIComponent(r.team)}">
                      <td>${r.position}</td>
                      <td>${teamBadge(r.team, { size: 'sm' })} ${r.team}</td>
                      <td>${r.games_played ?? '\u2014'}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td>
                      <td>${r.goals_scored ?? '\u2014'}</td><td>${r.goals_conceded ?? '\u2014'}</td>
                      <td>${r.goal_diff > 0 ? '+' : ''}${r.goal_diff}</td>
                      <td><strong>${r.points}</strong></td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table></div>`
          : `<p class="empty-state__inline">No standings data on record for this season (team_stats isn't populated for it).</p>`
      }
    </div>
  `;
  return shell(league, 'standings', season, body);
}

export async function renderLeagueFixtures({ league, query }) {
  if (!storage.ready) return notLoaded();
  const season = seasonFromQuery(league, query);
  const page = Number(query.page || 1);
  const { rows, total, totalPages } = leagueRepository.fixturesPage(league, todayISO(), { page, pageSize: 20 });

  const body = `
    <div class="panel">
      <h3>Fixtures <span class="panel__count">${total}</span></h3>
      ${
        rows.length
          ? `<div class="table-scroll"><table class="data-table data-table--compact">
              <thead><tr><th>Date</th><th>Home</th><th></th><th>Away</th><th>GW</th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (m) => `<tr class="clickable-row" data-href="#/matches/${m.id}">
                      <td>${formatDate(m.match_date)}</td><td>${m.home_team}</td><td>vs</td><td>${m.away_team}</td><td>${m.gameweek ?? '\u2014'}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table></div>
             ${pagination(`#/leagues/${encodeURIComponent(league)}/fixtures`, page, totalPages)}`
          : `<p class="empty-state__inline">No upcoming fixtures on record for this league.</p>`
      }
    </div>
  `;
  return shell(league, 'fixtures', season, body);
}

export async function renderLeagueResults({ league, query }) {
  if (!storage.ready) return notLoaded();
  const season = query.season || leagueRepository.latestSeason(league);
  const page = Number(query.page || 1);
  const seasons = leagueRepository.seasonsFor(league);
  const { rows, total, totalPages } = leagueRepository.resultsPage(league, { season, page, pageSize: 20 });

  const body = `
    <form class="filter-bar" id="league-results-filter-form" data-league="${encodeURIComponent(league)}">
      <label>Season
        <select name="season">
          <option value="">All seasons</option>
          ${seasons.map((s) => `<option value="${s}" ${s === season ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </label>
      <button type="submit">Apply</button>
    </form>
    <div class="panel">
      <h3>Results <span class="panel__count">${total}</span></h3>
      ${
        rows.length
          ? `<div class="table-scroll"><table class="data-table data-table--compact">
              <thead><tr><th>Date</th><th>Home</th><th></th><th>Away</th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (m) => `<tr class="clickable-row" data-href="#/matches/${m.id}">
                      <td>${formatDate(m.match_date)}</td><td>${m.home_team}</td>
                      <td class="data-table__score">${scoreline(m.home_score, m.away_score)}</td><td>${m.away_team}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table></div>
             ${pagination(resultsUrl(league, season), page, totalPages)}`
          : `<p class="empty-state__inline">No results match these filters.</p>`
      }
    </div>
  `;
  return shell(league, 'results', season, body);
}

export async function renderLeagueTeams({ league, query }) {
  if (!storage.ready) return notLoaded();
  const season = seasonFromQuery(league, query);
  const rows = teamRepository.directory({ league, season });

  const body = `
    <div class="panel">
      <h3>Teams &middot; ${season ?? '\u2014'} <span class="panel__count">${rows.length}</span></h3>
      ${
        rows.length
          ? `<div class="card-grid card-grid--compact">
              ${rows
                .map(
                  (t) => `<a class="team-card team-card--mini" href="#/teams/${encodeURIComponent(t.team)}">
                    ${teamBadge(t.team, { size: 'md' })} <span>${t.team}</span>
                    ${t.points != null ? `<span class="team-card__pts">${t.points} pts</span>` : ''}
                  </a>`
                )
                .join('')}
             </div>`
          : `<p class="empty-state__inline">No teams on record for this season.</p>`
      }
    </div>
  `;
  return shell(league, 'teams', season, body);
}

export async function renderLeaguePlayers({ league, query }) {
  if (!storage.ready) return notLoaded();
  const season = seasonFromQuery(league, query);
  const page = Number(query.page || 1);
  const { rows, total, totalPages } = playerRepository.directory({ league, season, page, pageSize: 25 });

  const body = `
    <div class="panel">
      <h3>Players &middot; ${season ?? '\u2014'} <span class="panel__count">${total}</span></h3>
      ${
        rows.length
          ? `<div class="table-scroll"><table class="data-table data-table--compact">
              <thead><tr><th>Player</th><th>Team</th><th>Pos</th><th>Goals</th><th>Assists</th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (p) => `<tr class="clickable-row" data-href="#/players/${encodeURIComponent(p.player)}">
                      <td>${p.player}</td><td>${p.team}</td><td>${p.position ?? '\u2014'}</td>
                      <td>${p.goals ?? '\u2014'}</td><td>${p.assists ?? '\u2014'}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table></div>
             ${pagination(`#/leagues/${encodeURIComponent(league)}/players`, page, totalPages)}`
          : `<p class="empty-state__inline">No players on record for this season.</p>`
      }
    </div>
  `;
  return shell(league, 'players', season, body);
}

export async function renderLeagueStatistics({ league, query }) {
  if (!storage.ready) return notLoaded();
  const season = seasonFromQuery(league, query);
  const stats = leagueRepository.statistics(league, season);
  const goalsPerMatch = stats.played ? (stats.total_goals / stats.played).toFixed(2) : null;
  const homeWinPct = stats.played ? stats.home_wins / stats.played : null;
  const awayWinPct = stats.played ? stats.away_wins / stats.played : null;
  const drawPct = stats.played ? stats.draws / stats.played : null;

  const body = `
    <div class="panel">
      <h3>Statistics &middot; ${season ?? '\u2014'}</h3>
      <div class="stat-grid">
        <div class="stat"><span class="stat__value">${stats.played}</span><span class="stat__label">Matches played</span></div>
        <div class="stat"><span class="stat__value">${stats.total_goals ?? '\u2014'}</span><span class="stat__label">Total goals</span></div>
        <div class="stat"><span class="stat__value">${goalsPerMatch ?? '\u2014'}</span><span class="stat__label">Goals/match</span></div>
        <div class="stat"><span class="stat__value">${formatPct(homeWinPct)}</span><span class="stat__label">Home win %</span></div>
        <div class="stat"><span class="stat__value">${formatPct(drawPct)}</span><span class="stat__label">Draw %</span></div>
        <div class="stat"><span class="stat__value">${formatPct(awayWinPct)}</span><span class="stat__label">Away win %</span></div>
      </div>
      ${
        stats.cardsCorners
          ? `<div class="stat-grid" style="margin-top:12px">
              <div class="stat"><span class="stat__value">${Number(stats.cardsCorners.avg_cards).toFixed(1)}</span><span class="stat__label">Cards/match</span></div>
              <div class="stat"><span class="stat__value">${Number(stats.cardsCorners.avg_corners).toFixed(1)}</span><span class="stat__label">Corners/match</span></div>
             </div>`
          : `<p class="empty-state__inline" style="margin-top:12px">Cards/corners data not available for this league (historical_results has no rows for it).</p>`
      }
    </div>
  `;
  return shell(league, 'statistics', season, body);
}

export async function renderLeaguePredictions({ league, query }) {
  if (!storage.ready) return notLoaded();
  const season = seasonFromQuery(league, query);
  const dist = leagueRepository.predictionDistribution(league, season);

  const body = `
    <div class="panel">
      <h3>Prediction Distribution &middot; ${season ?? '\u2014'}</h3>
      ${
        dist && dist.total
          ? `<div class="stat-grid">
              <div class="stat"><span class="stat__value">${dist.total}</span><span class="stat__label">Total predictions</span></div>
              <div class="stat"><span class="stat__value">${dist.graded}</span><span class="stat__label">Graded</span></div>
             </div>
             <h4 style="margin-top:16px;">By Consensus Pick</h4>
             <div class="double-chance__row">${dist.byOutcome.map((o) => `<span class="pill">${o.outcome}: ${o.n}</span>`).join('')}</div>
             <h4 style="margin-top:16px;">By Confidence Tier</h4>
             <div class="double-chance__row">${dist.byConfidence.map((c) => `<span class="pill pill--confidence-${c.confidence.toLowerCase()}">${c.confidence}: ${c.n}</span>`).join('')}</div>
             <p class="empty-state__inline" style="margin-top:16px;">Volume and distribution only &mdash; not an accuracy figure. See a team's Predictions tab or the match detail page for individual grading.</p>`
          : `<p class="empty-state__inline">No predictions on record for this league/season.</p>`
      }
    </div>
  `;
  return shell(league, 'predictions', season, body);
}

export async function renderLeagueOdds({ league, query }) {
  if (!storage.ready) return notLoaded();
  const season = seasonFromQuery(league, query);
  const page = Number(query.page || 1);
  const { rows, total, totalPages } = leagueRepository.oddsPage(league, { page, pageSize: 20 });

  const body = `
    <div class="panel">
      <h3>Odds <span class="panel__count">${total}</span></h3>
      ${
        rows.length
          ? `<div class="table-scroll"><table class="data-table data-table--compact">
              <thead><tr><th>Date</th><th>Match</th><th>B365 H/D/A</th><th>Avg H/D/A</th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (o) => `<tr>
                      <td>${formatDate(o.match_date)}</td><td>${o.home_team} vs ${o.away_team}</td>
                      <td>${o.b365_home ?? '\u2014'} / ${o.b365_draw ?? '\u2014'} / ${o.b365_away ?? '\u2014'}</td>
                      <td>${o.avg_home ?? '\u2014'} / ${o.avg_draw ?? '\u2014'} / ${o.avg_away ?? '\u2014'}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table></div>
             ${pagination(`#/leagues/${encodeURIComponent(league)}/odds`, page, totalPages)}`
          : `<p class="empty-state__inline">No odds on record for this league.</p>`
      }
    </div>
  `;
  return shell(league, 'odds', season, body);
}

export async function renderLeagueSeasons({ league }) {
  if (!storage.ready) return notLoaded();
  const seasons = leagueRepository.seasonsFor(league);

  const body = `
    <div class="panel">
      <h3>Seasons on Record</h3>
      ${
        seasons.length
          ? `<div class="table-scroll"><table class="data-table data-table--compact">
              <thead><tr><th>Season</th><th></th></tr></thead>
              <tbody>
                ${seasons
                  .map(
                    (s) => `<tr>
                      <td>${s}</td>
                      <td><a href="#/leagues/${encodeURIComponent(league)}/standings?season=${encodeURIComponent(s)}">View standings &rarr;</a></td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table></div>`
          : `<p class="empty-state__inline">No season history on record.</p>`
      }
    </div>
  `;
  return shell(league, 'seasons', seasons[0], body);
}

function resultsUrl(league, season) {
  const params = new URLSearchParams();
  if (season) params.set('season', season);
  const qs = params.toString();
  return `#/leagues/${encodeURIComponent(league)}/results${qs ? '?' + qs : ''}`;
}

function pagination(baseHref, page, totalPages) {
  const sep = baseHref.includes('?') ? '&' : '?';
  return `
    <nav class="pagination">
      ${page > 1 ? `<a href="${baseHref}${sep}page=${page - 1}">&larr; Prev</a>` : ''}
      <span>Page ${page} of ${totalPages}</span>
      ${page < totalPages ? `<a href="${baseHref}${sep}page=${page + 1}">Next &rarr;</a>` : ''}
    </nav>
  `;
}
