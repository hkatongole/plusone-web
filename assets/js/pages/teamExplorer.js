import { teamRepository } from '../db/repositories/teamRepository.js';
import { teamBadge, leagueBadge } from '../components/badges.js';
import { formatPct } from '../components/format.js';
import { storage } from '../db/storageAdapter.js';

export async function renderTeamDirectory({ query }) {
  if (!storage.ready) {
    return `<div class="empty-state"><h2>No database loaded</h2><p>Import a .sqlite backup from the Home page first.</p></div>`;
  }

  const league = query.league || null;
  const season = query.season || 'latest';
  const rows = teamRepository.directory({ league, season: season === 'latest' ? null : season });

  const leagues = [...new Set(rows.map((r) => r.league))].sort();
  // Build the league filter from the full (unfiltered) directory so switching leagues works,
  // not just the currently-filtered set.
  const allLeagues = league ? teamRepository.directory({ season: season === 'latest' ? null : season }) : rows;
  const leagueOptions = [...new Set(allLeagues.map((r) => r.league))].sort();

  return `
    <section class="page page--teams">
      <header class="page__header">
        <h1>Team Explorer</h1>
        <p class="page__subtitle">${rows.length.toLocaleString()} teams${league ? ` in ${league}` : ''}${rows[0]?.season ? ` &middot; ${rows[0].season}` : ''}</p>
      </header>

      <form class="filter-bar" id="team-filter-form" data-nav-base="/teams">
        <label>League
          <select name="league">
            <option value="">All leagues</option>
            ${leagueOptions.map((l) => `<option value="${l}" ${l === league ? 'selected' : ''}>${l}</option>`).join('')}
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

      <div class="card-grid">
        ${rows.map(teamCard).join('') || `<div class="empty-state"><p>No teams match these filters.</p></div>`}
      </div>
    </section>
  `;
}

function teamCard(t) {
  return `
    <article class="team-card clickable-row" data-href="#/teams/${encodeURIComponent(t.team)}">
      <div class="team-card__header">
        ${teamBadge(t.team, { size: 'lg' })}
        <div>
          <h3>${t.team}</h3>
          <div class="team-card__league">${leagueBadge(t.league)} ${t.league}${t.season ? ` &middot; ${t.season}` : ''}</div>
        </div>
      </div>
      ${
        t.points != null
          ? `<div class="team-card__stats">
              <span><strong>${t.points}</strong> pts</span>
              <span>${t.wins ?? 0}W ${t.draws ?? 0}D ${t.losses ?? 0}L</span>
              ${t.win_rate != null ? `<span>${formatPct(t.win_rate)} win rate</span>` : ''}
             </div>`
          : `<p class="team-card__no-stats">No season stats on record</p>`
      }
    </article>
  `;
}
