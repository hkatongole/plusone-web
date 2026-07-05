import { teamRepository } from '../db/repositories/teamRepository.js';
import { teamBadge, leagueBadge } from '../components/badges.js';
import { formatPct, formatDate, scoreline, todayISO } from '../components/format.js';
import { storage } from '../db/storageAdapter.js';

const TABS = [
  { key: 'overview', label: 'Overview', path: '' },
  { key: 'fixtures', label: 'Fixtures', path: '/fixtures' },
  { key: 'results', label: 'Results', path: '/results' },
  { key: 'statistics', label: 'Statistics', path: '/statistics' },
  { key: 'players', label: 'Squad', path: '/players' },
  { key: 'predictions', label: 'Predictions', path: '/predictions' },
  { key: 'odds', label: 'Odds', path: '/odds' },
  { key: 'history', label: 'History', path: '/history' },
];

function notLoaded() {
  return `<div class="empty-state"><h2>No database loaded</h2><p>Import a .sqlite backup from the Home page first.</p></div>`;
}

function shell(team, activeTab, latestStats, body) {
  const encoded = encodeURIComponent(team);
  const tabNav = TABS.map(
    (t) => `<a class="tab-nav__item ${t.key === activeTab ? 'tab-nav__item--active' : ''}"
                href="#/teams/${encoded}${t.path}">${t.label}</a>`
  ).join('');

  return `
    <section class="page page--team-detail">
      <a class="back-link" href="#/teams">&larr; Back to Team Explorer</a>
      <header class="page__header team-detail__header">
        ${teamBadge(team, { size: 'lg' })}
        <div>
          <h1>${team}</h1>
          ${
            latestStats
              ? `<p class="page__subtitle">${leagueBadge(latestStats.league)} ${latestStats.league} &middot; ${latestStats.season}</p>`
              : `<p class="page__subtitle">No current-season stats on record</p>`
          }
        </div>
      </header>
      <nav class="tab-nav">${tabNav}</nav>
      ${body}
    </section>
  `;
}

export async function renderTeamOverview({ team }) {
  if (!storage.ready) return notLoaded();
  const stats = teamRepository.statsFor(team);
  const form = teamRepository.recentForm(team, 5);
  const upcoming = teamRepository.upcomingFixtures(team, todayISO(), 5);

  const body = `
    ${
      stats
        ? `<div class="panel">
            <h3>Current Season Snapshot</h3>
            <div class="stat-grid">
              <div class="stat"><span class="stat__value">${stats.points}</span><span class="stat__label">Points</span></div>
              <div class="stat"><span class="stat__value">${stats.wins}-${stats.draws}-${stats.losses}</span><span class="stat__label">W-D-L</span></div>
              <div class="stat"><span class="stat__value">${formatPct(stats.win_rate)}</span><span class="stat__label">Win rate</span></div>
              <div class="stat"><span class="stat__value">${stats.goals_per_game ?? '\u2014'}</span><span class="stat__label">Goals/game</span></div>
              <div class="stat"><span class="stat__value">${stats.conceded_per_game ?? '\u2014'}</span><span class="stat__label">Conceded/game</span></div>
            </div>
           </div>`
        : `<div class="empty-state"><p>No season stats on record for this team.</p></div>`
    }

    <div class="panel">
      <h3>Recent Form</h3>
      ${
        form.length
          ? `<div class="form-strip">${form
              .map((m) => {
                const isHome = m.home_team === team;
                const teamScore = isHome ? m.home_score : m.away_score;
                const oppScore = isHome ? m.away_score : m.home_score;
                const outcome = teamScore > oppScore ? 'W' : teamScore === oppScore ? 'D' : 'L';
                const opponent = isHome ? m.away_team : m.home_team;
                return `<a class="form-chip form-chip--${outcome.toLowerCase()}" href="#/matches/${m.id}" title="${scoreline(m.home_score, m.away_score)} vs ${opponent}">${outcome}</a>`;
              })
              .join('')}</div>`
          : `<p class="empty-state__inline">No completed matches on record.</p>`
      }
    </div>

    <div class="panel">
      <h3>Upcoming Fixtures</h3>
      ${
        upcoming.length
          ? `<table class="data-table data-table--compact">
              <thead><tr><th>Date</th><th>Home</th><th></th><th>Away</th></tr></thead>
              <tbody>
                ${upcoming
                  .map(
                    (m) => `<tr class="clickable-row" data-href="#/matches/${m.id}">
                      <td>${formatDate(m.match_date)}</td><td>${m.home_team}</td><td>vs</td><td>${m.away_team}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table>`
          : `<p class="empty-state__inline">No upcoming fixtures on record.</p>`
      }
    </div>
  `;
  return shell(team, 'overview', stats, body);
}

export async function renderTeamFixtures({ team, query }) {
  if (!storage.ready) return notLoaded();
  const stats = teamRepository.statsFor(team);
  const page = Number(query.page || 1);
  const { rows, total, totalPages } = teamRepository.fixturesPage(team, todayISO(), { page, pageSize: 20 });

  const body = `
    <div class="panel">
      <h3>Fixtures <span class="panel__count">${total}</span></h3>
      ${
        rows.length
          ? `<table class="data-table data-table--compact">
              <thead><tr><th>Date</th><th>League</th><th>Home</th><th></th><th>Away</th><th>Pick</th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (m) => `<tr class="clickable-row" data-href="#/matches/${m.id}">
                      <td>${formatDate(m.match_date)}</td>
                      <td>${m.league}</td>
                      <td>${m.home_team}</td><td>vs</td><td>${m.away_team}</td>
                      <td>${m.pred_consensus_outcome ? `${m.pred_consensus_outcome}${m.pred_confidence ? ` (${m.pred_confidence})` : ''}` : '\u2014'}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table>
             ${pagination(`#/teams/${encodeURIComponent(team)}/fixtures`, page, totalPages)}`
          : `<p class="empty-state__inline">No upcoming fixtures on record.</p>`
      }
    </div>
  `;
  return shell(team, 'fixtures', stats, body);
}

export async function renderTeamResults({ team, query }) {
  if (!storage.ready) return notLoaded();
  const stats = teamRepository.statsFor(team);
  const page = Number(query.page || 1);
  const season = query.season || null;
  const opponent = query.opponent || null;
  const result = query.result || null;

  const seasons = teamRepository.seasonsFor(team);
  const { rows, total, totalPages } = teamRepository.resultsFor(team, { season, opponent, result, page, pageSize: 20 });

  const body = `
    <form class="filter-bar" id="team-results-filter-form" data-team="${encodeURIComponent(team)}">
      <label>Season
        <select name="season">
          <option value="">All seasons</option>
          ${seasons.map((s) => `<option value="${s}" ${s === season ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </label>
      <label>Result
        <select name="result">
          <option value="">Any result</option>
          <option value="win" ${result === 'win' ? 'selected' : ''}>Wins</option>
          <option value="draw" ${result === 'draw' ? 'selected' : ''}>Draws</option>
          <option value="loss" ${result === 'loss' ? 'selected' : ''}>Losses</option>
        </select>
      </label>
      <button type="submit">Apply</button>
    </form>

    <div class="panel">
      <h3>Results <span class="panel__count">${total}</span></h3>
      ${
        rows.length
          ? `<table class="data-table data-table--compact">
              <thead><tr><th>Date</th><th>Home</th><th></th><th>Away</th><th></th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (m) => `<tr class="clickable-row" data-href="#/matches/${m.id}">
                      <td>${formatDate(m.match_date)}</td>
                      <td>${m.home_team}</td>
                      <td class="data-table__score">${scoreline(m.home_score, m.away_score)}</td>
                      <td>${m.away_team}</td>
                      <td><span class="pill pill--${m.team_result === 'win' ? 'correct' : m.team_result === 'loss' ? 'incorrect' : ''}">${m.team_result}</span></td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table>
             ${pagination(resultsUrl(team, { season, opponent, result }), page, totalPages)}`
          : `<p class="empty-state__inline">No results match these filters.</p>`
      }
    </div>
  `;
  return shell(team, 'results', stats, body);
}

export async function renderTeamStatistics({ team }) {
  if (!storage.ready) return notLoaded();
  const history = teamRepository.seasonHistory(team);
  const stats = history[0] || null;
  if (!stats) {
    return shell(team, 'statistics', null, `<div class="empty-state"><p>No statistics on record for this team.</p></div>`);
  }

  // Render every numeric/team_stats column present -- adapts to whatever this
  // backup's schema actually has rather than assuming a fixed set (Section 2).
  const labels = {
    goals_scored: 'Goals scored', goals_conceded: 'Goals conceded',
    goals_per_game: 'Goals/game', conceded_per_game: 'Conceded/game',
    attack_strength: 'Attack strength', defence_weakness: 'Defence weakness',
    home_goals_pg: 'Home goals/game', away_goals_pg: 'Away goals/game',
    home_conceded_pg: 'Home conceded/game', away_conceded_pg: 'Away conceded/game',
    form_score: 'Form score', possession_avg: 'Possession %',
    shots_on_target_pg: 'Shots on target/game', xg_per_game: 'xG/game',
    xg_against_pg: 'xG against/game', clean_sheets: 'Clean sheets',
  };
  const rows = Object.entries(labels)
    .filter(([key]) => stats[key] != null)
    .map(([key, label]) => `<tr><td>${label}</td><td>${stats[key]}</td></tr>`)
    .join('');

  const body = `
    <div class="panel">
      <h3>Statistics &middot; ${stats.season}</h3>
      <table class="data-table data-table--compact">
        <tbody>
          <tr><td>Record</td><td>${stats.wins}W ${stats.draws}D ${stats.losses}L (${stats.games_played} played)</td></tr>
          <tr><td>Points</td><td>${stats.points}</td></tr>
          <tr><td>Win rate</td><td>${formatPct(stats.win_rate)}</td></tr>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
  return shell(team, 'statistics', stats, body);
}

export async function renderTeamSquad({ team }) {
  if (!storage.ready) return notLoaded();
  const stats = teamRepository.statsFor(team);
  const squad = teamRepository.squad(team, stats?.season);

  const body = `
    <div class="panel">
      <h3>Squad ${stats?.season ? `&middot; ${stats.season}` : ''} <span class="panel__count">${squad.length}</span></h3>
      ${
        squad.length
          ? `<table class="data-table data-table--compact">
              <thead><tr><th>Player</th><th>Pos</th><th>Nat.</th><th>Age</th><th>Apps</th><th>Goals</th><th>Assists</th></tr></thead>
              <tbody>
                ${squad
                  .map(
                    (p) => `<tr>
                      <td>${p.player}</td><td>${p.position ?? '\u2014'}</td><td>${p.nationality ?? '\u2014'}</td>
                      <td>${p.age ?? '\u2014'}</td><td>${p.games ?? '\u2014'}</td><td>${p.goals ?? '\u2014'}</td><td>${p.assists ?? '\u2014'}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table>`
          : `<p class="empty-state__inline">No squad information available for this team.</p>`
      }
    </div>
  `;
  return shell(team, 'players', stats, body);
}

export async function renderTeamPredictions({ team, query }) {
  if (!storage.ready) return notLoaded();
  const stats = teamRepository.statsFor(team);
  const page = Number(query.page || 1);
  const { rows, total, totalPages } = teamRepository.predictionsFor(team, { page, pageSize: 20 });

  const body = `
    <div class="panel">
      <h3>Predictions <span class="panel__count">${total}</span></h3>
      ${
        rows.length
          ? `<table class="data-table data-table--compact">
              <thead><tr><th>Date</th><th>Match</th><th>Pick</th><th>Confidence</th><th>Result</th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (p) => `<tr class="clickable-row" data-href="#/matches/${p.match_id}">
                      <td>${formatDate(p.match_date)}</td>
                      <td>${p.home_team} vs ${p.away_team}</td>
                      <td>${p.consensus_outcome ?? '\u2014'}</td>
                      <td>${p.confidence ?? '\u2014'}</td>
                      <td>${
                        p.consensus_correct != null
                          ? `<span class="pill pill--${p.consensus_correct ? 'correct' : 'incorrect'}">${p.consensus_correct ? 'Correct' : 'Incorrect'}</span>`
                          : '\u2014'
                      }</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table>
             ${pagination(`#/teams/${encodeURIComponent(team)}/predictions`, page, totalPages)}`
          : `<p class="empty-state__inline">No prediction records exist for this team.</p>`
      }
    </div>
  `;
  return shell(team, 'predictions', stats, body);
}

export async function renderTeamOdds({ team, query }) {
  if (!storage.ready) return notLoaded();
  const stats = teamRepository.statsFor(team);
  const page = Number(query.page || 1);
  const { rows, total, totalPages } = teamRepository.oddsFor(team, { page, pageSize: 20 });

  const body = `
    <div class="panel">
      <h3>Odds <span class="panel__count">${total}</span></h3>
      ${
        rows.length
          ? `<table class="data-table data-table--compact">
              <thead><tr><th>Date</th><th>Match</th><th>B365 H/D/A</th><th>Avg H/D/A</th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (o) => `<tr>
                      <td>${formatDate(o.match_date)}</td>
                      <td>${o.home_team} vs ${o.away_team}</td>
                      <td>${o.b365_home ?? '\u2014'} / ${o.b365_draw ?? '\u2014'} / ${o.b365_away ?? '\u2014'}</td>
                      <td>${o.avg_home ?? '\u2014'} / ${o.avg_draw ?? '\u2014'} / ${o.avg_away ?? '\u2014'}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table>
             ${pagination(`#/teams/${encodeURIComponent(team)}/odds`, page, totalPages)}`
          : `<p class="empty-state__inline">No historical odds found for this team.</p>`
      }
    </div>
  `;
  return shell(team, 'odds', stats, body);
}

export async function renderTeamHistory({ team }) {
  if (!storage.ready) return notLoaded();
  const history = teamRepository.seasonHistory(team);

  const body = `
    <div class="panel">
      <h3>Season-by-Season History</h3>
      ${
        history.length
          ? `<table class="data-table data-table--compact">
              <thead><tr><th>Season</th><th>League</th><th>Pts</th><th>W-D-L</th><th>GF-GA</th><th>Win rate</th></tr></thead>
              <tbody>
                ${history
                  .map(
                    (s) => `<tr>
                      <td>${s.season}</td><td>${s.league}</td><td>${s.points}</td>
                      <td>${s.wins}-${s.draws}-${s.losses}</td>
                      <td>${s.goals_scored ?? '\u2014'}-${s.goals_conceded ?? '\u2014'}</td>
                      <td>${formatPct(s.win_rate)}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table>`
          : `<p class="empty-state__inline">No historical seasons on record.</p>`
      }
    </div>
  `;
  return shell(team, 'history', history[0], body);
}

function resultsUrl(team, { season, opponent, result }) {
  const params = new URLSearchParams();
  if (season) params.set('season', season);
  if (opponent) params.set('opponent', opponent);
  if (result) params.set('result', result);
  const qs = params.toString();
  return `#/teams/${encodeURIComponent(team)}/results${qs ? '?' + qs : ''}`;
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
