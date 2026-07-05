import { playerRepository } from '../db/repositories/playerRepository.js';
import { teamBadge, leagueBadge, playerSilhouette } from '../components/badges.js';
import { formatNationality } from '../components/format.js';
import { storage } from '../db/storageAdapter.js';

const TABS = [
  { key: 'overview', label: 'Overview', path: '' },
  { key: 'statistics', label: 'Statistics', path: '/statistics' },
  { key: 'matches', label: 'Matches', path: '/matches' },
  { key: 'seasons', label: 'Seasons', path: '/seasons' },
  { key: 'teams', label: 'Teams', path: '/teams' },
];

function notLoaded() {
  return `<div class="empty-state"><h2>No database loaded</h2><p>Import a .sqlite backup from the Home page first.</p></div>`;
}

function shell(player, activeTab, current, body) {
  const encoded = encodeURIComponent(player);
  const tabNav = TABS.map(
    (t) => `<a class="tab-nav__item ${t.key === activeTab ? 'tab-nav__item--active' : ''}"
                href="#/players/${encoded}${t.path}">${t.label}</a>`
  ).join('');

  return `
    <section class="page page--player-detail">
      <a class="back-link" href="#/players">&larr; Back to Player Explorer</a>
      <header class="page__header player-detail__header">
        ${playerSilhouette({ size: 'lg' })}
        <div>
          <h1>${player}</h1>
          ${
            current
              ? `<p class="page__subtitle">
                  ${teamBadge(current.team, { size: 'sm' })} ${current.team}
                  &middot; ${current.position ?? '\u2014'}
                  &middot; ${formatNationality(current.nationality)}
                  &middot; ${leagueBadge(current.league)} ${current.league} ${current.season}
                 </p>`
              : `<p class="page__subtitle">No records on file for this player</p>`
          }
        </div>
      </header>
      <nav class="tab-nav">${tabNav}</nav>
      ${body}
    </section>
  `;
}

export async function renderPlayerOverview({ player }) {
  if (!storage.ready) return notLoaded();
  const current = playerRepository.latestRowFor(player);
  if (!current) {
    return shell(player, 'overview', null, `<div class="empty-state"><p>No records on file for this player.</p></div>`);
  }

  const body = `
    <div class="panel">
      <h3>Current Season Snapshot &middot; ${current.season}</h3>
      <div class="stat-grid">
        <div class="stat"><span class="stat__value">${current.games ?? '\u2014'}</span><span class="stat__label">Appearances</span></div>
        <div class="stat"><span class="stat__value">${current.games_starts ?? '\u2014'}</span><span class="stat__label">Starts</span></div>
        <div class="stat"><span class="stat__value">${current.goals ?? '\u2014'}</span><span class="stat__label">Goals</span></div>
        <div class="stat"><span class="stat__value">${current.assists ?? '\u2014'}</span><span class="stat__label">Assists</span></div>
        <div class="stat"><span class="stat__value">${current.minutes ?? '\u2014'}</span><span class="stat__label">Minutes</span></div>
        <div class="stat"><span class="stat__value">${current.age ?? '\u2014'}</span><span class="stat__label">Age</span></div>
      </div>
    </div>
    <div class="empty-state empty-state--inline-note">
      <p>Match-by-match appearances and prediction links aren't available for individual players in
      this database &mdash; it tracks season totals, not per-match player data. See the Seasons and
      Teams tabs for the full history on record.</p>
    </div>
  `;
  return shell(player, 'overview', current, body);
}

export async function renderPlayerStatistics({ player }) {
  if (!storage.ready) return notLoaded();
  const current = playerRepository.latestRowFor(player);
  if (!current) {
    return shell(player, 'statistics', null, `<div class="empty-state"><p>No records on file for this player.</p></div>`);
  }

  const labels = {
    games: 'Appearances', games_starts: 'Starts', minutes: 'Minutes',
    goals: 'Goals', assists: 'Assists',
    goals_per90: 'Goals per 90', assists_per90: 'Assists per 90',
    cards_yellow: 'Yellow cards', cards_red: 'Red cards',
  };
  const rows = Object.entries(labels)
    .filter(([key]) => current[key] != null)
    .map(([key, label]) => `<tr><td>${label}</td><td>${current[key]}</td></tr>`)
    .join('');

  const body = `
    <div class="panel">
      <h3>Statistics &middot; ${current.season}</h3>
      <table class="data-table data-table--compact"><tbody>${rows}</tbody></table>
    </div>
  `;
  return shell(player, 'statistics', current, body);
}

export async function renderPlayerMatches({ player }) {
  if (!storage.ready) return notLoaded();
  const current = playerRepository.latestRowFor(player);
  const { available } = playerRepository.matchAppearances(player);

  const body = `
    <div class="empty-state">
      <h3>Match-level data not available</h3>
      <p>${
        available
          ? 'No appearances found for this player.'
          : "This database only records season totals for players (games/goals/assists per season), not which specific matches they appeared in. A per-match appearances list would need the lineups table populated, which it isn't in this export."
      }</p>
    </div>
  `;
  return shell(player, 'matches', current, body);
}

export async function renderPlayerSeasons({ player }) {
  if (!storage.ready) return notLoaded();
  const rows = playerRepository.profileRows(player);
  const current = rows[0] || null;

  const body = `
    <div class="panel">
      <h3>Season-by-Season</h3>
      ${
        rows.length
          ? `<div class="table-scroll"><table class="data-table data-table--compact">
              <thead><tr><th>Season</th><th>Team</th><th>League</th><th>Apps</th><th>Goals</th><th>Assists</th><th>Mins</th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (r) => `<tr>
                      <td>${r.season}</td><td>${r.team}</td><td>${r.league}</td>
                      <td>${r.games ?? '\u2014'}</td><td>${r.goals ?? '\u2014'}</td><td>${r.assists ?? '\u2014'}</td><td>${r.minutes ?? '\u2014'}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table></div>`
          : `<p class="empty-state__inline">No season history on record.</p>`
      }
    </div>
  `;
  return shell(player, 'seasons', current, body);
}

export async function renderPlayerTeams({ player }) {
  if (!storage.ready) return notLoaded();
  const rows = playerRepository.profileRows(player);
  const current = rows[0] || null;

  // Shown exactly as recorded -- multiple rows in the same season mean a real
  // mid-season transfer captured by the source data, never inferred or merged.
  const body = `
    <div class="panel">
      <h3>Team History</h3>
      ${
        rows.length
          ? `<div class="table-scroll"><table class="data-table data-table--compact">
              <thead><tr><th>Season</th><th>Team</th><th>League</th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (r) => `<tr>
                      <td>${r.season}</td>
                      <td>${teamBadge(r.team, { size: 'sm' })} ${r.team}</td>
                      <td>${leagueBadge(r.league)} ${r.league}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table></div>
             ${new Set(rows.map((r) => r.season)).size < rows.length ? `<p class="empty-state__inline">More than one team appears in the same season above &mdash; recorded as-is, which usually reflects a mid-season transfer.</p>` : ''}`
          : `<p class="empty-state__inline">No team history on record.</p>`
      }
    </div>
  `;
  return shell(player, 'teams', current, body);
}
