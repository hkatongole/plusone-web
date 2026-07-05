import { leagueRepository } from '../db/repositories/leagueRepository.js';
import { leagueBadge } from '../components/badges.js';
import { storage } from '../db/storageAdapter.js';

export async function renderLeagueDirectory() {
  if (!storage.ready) {
    return `<div class="empty-state"><h2>No database loaded</h2><p>Import a .sqlite backup from the Home page first.</p></div>`;
  }

  const leagues = leagueRepository.directory();

  return `
    <section class="page page--leagues">
      <header class="page__header">
        <h1>League Explorer</h1>
        <p class="page__subtitle">${leagues.length} competitions on record</p>
      </header>
      <div class="card-grid">
        ${leagues.map(leagueCard).join('') || `<div class="empty-state"><p>No leagues on record.</p></div>`}
      </div>
    </section>
  `;
}

function leagueCard(l) {
  return `
    <article class="team-card clickable-row" data-href="#/leagues/${encodeURIComponent(l.league)}">
      <div class="team-card__header">
        ${leagueBadge(l.league, { size: 'lg' })}
        <div>
          <h3>${l.league}</h3>
          <div class="team-card__league">${l.type} &middot; ${l.season ?? '\u2014'}</div>
        </div>
      </div>
      <div class="team-card__stats">
        <span>${l.teamCount != null ? `${l.teamCount} teams` : '\u2014'}</span>
        <span>${l.fixtureCount.toLocaleString()} fixtures</span>
        <span>${l.predictionCount ? `${l.predictionCount.toLocaleString()} predictions` : 'No predictions'}</span>
      </div>
    </article>
  `;
}
