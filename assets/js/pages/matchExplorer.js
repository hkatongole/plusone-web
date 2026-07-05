import { matchRepository } from '../db/repositories/matchRepository.js';
import { teamBadge, leagueBadge } from '../components/badges.js';
import { formatDate, scoreline } from '../components/format.js';
import { storage } from '../db/storageAdapter.js';

export async function renderMatchList({ query }) {
  if (!storage.ready) {
    return `<div class="empty-state"><h2>No database loaded</h2><p>Import a .sqlite backup from the Home page first.</p></div>`;
  }

  const page = Number(query.page || 1);
  const league = query.league || null;
  const season = query.season || null;

  const { rows, total, totalPages } = matchRepository.filterMatches({ league, season, page, pageSize: 25 });
  const leagues = matchRepository.listLeagues();
  const seasons = matchRepository.listSeasons(league);

  return `
    <section class="page page--matches">
      <header class="page__header">
        <h1>Match Explorer</h1>
        <p class="page__subtitle">${total.toLocaleString()} matches on record</p>
      </header>

      <form class="filter-bar" id="match-filter-form">
        <label>League
          <select name="league">
            <option value="">All leagues</option>
            ${leagues.map((l) => `<option value="${l}" ${l === league ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <label>Season
          <select name="season">
            <option value="">All seasons</option>
            ${seasons.map((s) => `<option value="${s}" ${s === season ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>

      <table class="data-table">
        <thead>
          <tr><th>Date</th><th>League</th><th>Home</th><th></th><th>Away</th><th>GW</th></tr>
        </thead>
        <tbody>
          ${rows.map(matchRow).join('') || `<tr><td colspan="6">No matches match these filters.</td></tr>`}
        </tbody>
      </table>

      <nav class="pagination">
        ${page > 1 ? `<a href="#/matches?page=${page - 1}${league ? '&league=' + league : ''}${season ? '&season=' + season : ''}">&larr; Prev</a>` : ''}
        <span>Page ${page} of ${totalPages}</span>
        ${page < totalPages ? `<a href="#/matches?page=${page + 1}${league ? '&league=' + league : ''}${season ? '&season=' + season : ''}">Next &rarr;</a>` : ''}
      </nav>
    </section>
  `;
}

function matchRow(m) {
  return `
    <tr class="clickable-row" data-href="#/matches/${m.id}">
      <td>${formatDate(m.match_date)}</td>
      <td>${leagueBadge(m.league)} ${m.league}</td>
      <td>${teamBadge(m.home_team)} ${m.home_team}</td>
      <td class="data-table__score">${scoreline(m.home_score, m.away_score)}</td>
      <td>${teamBadge(m.away_team)} ${m.away_team}</td>
      <td>${m.gameweek ?? '\u2014'}</td>
    </tr>
  `;
}
