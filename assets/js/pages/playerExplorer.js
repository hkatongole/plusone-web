import { playerRepository } from '../db/repositories/playerRepository.js';
import { teamBadge, playerSilhouette } from '../components/badges.js';
import { formatNationality } from '../components/format.js';
import { storage } from '../db/storageAdapter.js';

export async function renderPlayerDirectory({ query }) {
  if (!storage.ready) {
    return `<div class="empty-state"><h2>No database loaded</h2><p>Import a .sqlite backup from the Home page first.</p></div>`;
  }

  const league = query.league || null;
  const season = query.season || 'latest';
  const position = query.position || null;
  const search = query.search || null;
  const page = Number(query.page || 1);

  const { rows, total, totalPages } = playerRepository.directory({
    league, season: season === 'latest' ? null : season, position, search, page, pageSize: 30,
  });
  const leagues = playerRepository.distinctLeagues();
  const positions = playerRepository.distinctPositions();

  return `
    <section class="page page--players">
      <header class="page__header">
        <h1>Player Explorer</h1>
        <p class="page__subtitle">${total.toLocaleString()} players on record</p>
      </header>

      <form class="filter-bar" id="player-filter-form">
        <label>Search
          <input type="text" name="search" value="${search ?? ''}" placeholder="Player name" />
        </label>
        <label>League
          <select name="league">
            <option value="">All leagues</option>
            ${leagues.map((l) => `<option value="${l}" ${l === league ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <label>Position
          <select name="position">
            <option value="">All positions</option>
            ${positions.map((p) => `<option value="${p}" ${p === position ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </label>
        <label>Season
          <select name="season">
            <option value="latest" ${season === 'latest' ? 'selected' : ''}>Latest season</option>
            <option value="all" ${season === 'all' ? 'selected' : ''}>All seasons</option>
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>

      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr><th></th><th>Player</th><th>Team</th><th>Pos</th><th>Nat.</th><th>Age</th><th>Apps</th><th>Goals</th><th>Assists</th></tr>
          </thead>
          <tbody>
            ${rows.map(playerRow).join('') || `<tr><td colspan="9">No players match these filters.</td></tr>`}
          </tbody>
        </table>
      </div>

      <nav class="pagination">
        ${page > 1 ? `<a href="${navUrl({ league, season, position, search, page: page - 1 })}">&larr; Prev</a>` : ''}
        <span>Page ${page} of ${totalPages}</span>
        ${page < totalPages ? `<a href="${navUrl({ league, season, position, search, page: page + 1 })}">Next &rarr;</a>` : ''}
      </nav>
    </section>
  `;
}

function playerRow(p) {
  return `
    <tr class="clickable-row" data-href="#/players/${encodeURIComponent(p.player)}">
      <td>${playerSilhouette({ size: 'sm' })}</td>
      <td>${p.player}</td>
      <td>${teamBadge(p.team, { size: 'sm' })} ${p.team}</td>
      <td>${p.position ?? '\u2014'}</td>
      <td>${formatNationality(p.nationality)}</td>
      <td>${p.age ?? '\u2014'}</td>
      <td>${p.games ?? '\u2014'}</td>
      <td>${p.goals ?? '\u2014'}</td>
      <td>${p.assists ?? '\u2014'}</td>
    </tr>
  `;
}

function navUrl({ league, season, position, search, page }) {
  const params = new URLSearchParams();
  if (league) params.set('league', league);
  if (season && season !== 'latest') params.set('season', season);
  if (position) params.set('position', position);
  if (search) params.set('search', search);
  if (page && page !== 1) params.set('page', String(page));
  const qs = params.toString();
  return `#/players${qs ? '?' + qs : ''}`;
}
