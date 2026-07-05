import { matchRepository } from '../db/repositories/matchRepository.js';
import { teamRepository } from '../db/repositories/teamRepository.js';
import { teamBadge, leagueBadge } from '../components/badges.js';
import { formatPct, formatDateTime, dataAsOfLabel, scoreline } from '../components/format.js';
import { storage } from '../db/storageAdapter.js';

export async function renderMatchDetail({ id }) {
  if (!storage.ready) {
    return `<div class="empty-state"><h2>No database loaded</h2></div>`;
  }
  const bundle = matchRepository.detailBundle(id);
  if (!bundle) {
    return `<div class="empty-state"><h2>Match not found</h2></div>`;
  }
  const { match, prediction, odds, weather, injuries } = bundle;
  const asOf = [prediction?.predicted_at, prediction?.evaluated_at, match.scraped_at].filter(Boolean).sort().reverse()[0];

  const homeStats = teamRepository.statsFor(match.home_team, match.season);
  const awayStats = teamRepository.statsFor(match.away_team, match.season);

  return `
    <section class="page page--match-detail">
      <a class="back-link" href="#/matches">&larr; Back to Match Explorer</a>
      <header class="page__header match-detail__header">
        ${leagueBadge(match.league)} <span>${match.league} &middot; ${match.season}</span>
        <p class="data-as-of">${dataAsOfLabel(asOf)}</p>
      </header>

      <div class="match-detail__scoreboard">
        <div class="match-detail__team">${teamBadge(match.home_team, { size: 'lg' })}<h2>${match.home_team}</h2></div>
        <div class="match-detail__center">
          <div class="match-detail__score">${scoreline(match.home_score, match.away_score)}</div>
          <div class="match-detail__date">${formatDateTime(match.start_time || match.match_date)}</div>
          ${match.home_xg != null ? `<div class="match-detail__xg">Match xG ${match.home_xg} &ndash; ${match.away_xg}</div>` : ''}
        </div>
        <div class="match-detail__team">${teamBadge(match.away_team, { size: 'lg' })}<h2>${match.away_team}</h2></div>
      </div>

      ${prediction ? engineBreakdown(prediction) : `<div class="empty-state"><p>No prediction on record for this match.</p></div>`}
      ${prediction ? expectedGoalsSection(prediction) : ''}
      ${prediction ? h2hSection(prediction) : ''}
      ${homeStats || awayStats ? teamComparisonSection(match.home_team, match.away_team, homeStats, awayStats) : ''}
      ${odds ? oddsSection(odds) : ''}
      ${weather ? weatherSection(weather) : ''}
      ${injuries?.length ? injuriesSection(injuries) : ''}
    </section>
  `;
}

function probBar(label, prob) {
  const pct = prob == null ? 0 : Math.round(prob * 100);
  return `
    <div class="prob-bar">
      <span class="prob-bar__label">${label}</span>
      <div class="prob-bar__track"><div class="prob-bar__fill" style="width:${pct}%"></div></div>
      <span class="prob-bar__value">${formatPct(prob)}</span>
    </div>
  `;
}

function engineBreakdown(p) {
  const engines = [
    { name: 'Consensus', outcome: p.consensus_outcome, home: p.consensus_home_prob, draw: p.consensus_draw_prob, away: p.consensus_away_prob, headline: true },
    { name: 'Dixon-Coles', outcome: p.dc_outcome, home: p.dc_home_prob, draw: p.dc_draw_prob, away: p.dc_away_prob },
    { name: 'ML Engine', outcome: p.ml_outcome, home: p.ml_home_prob, draw: p.ml_draw_prob, away: p.ml_away_prob },
    { name: 'Legacy Engine', outcome: p.legacy_outcome, home: p.legacy_home_prob, draw: p.legacy_draw_prob, away: p.legacy_away_prob },
  ].filter((e) => e.home != null || e.draw != null || e.away != null);

  const valueGaps = [p.value_gap_home, p.value_gap_draw, p.value_gap_away];
  const hasValueGap = valueGaps.some((v) => v != null);

  return `
    <div class="panel">
      <h3>Prediction Breakdown</h3>
      <div class="engine-grid">
        ${engines
          .map(
            (e) => `
          <div class="engine-card ${e.headline ? 'engine-card--headline' : ''}">
            <h4>${e.name}${e.outcome ? ` &middot; ${e.outcome}` : ''}</h4>
            ${probBar('Home', e.home)}
            ${probBar('Draw', e.draw)}
            ${probBar('Away', e.away)}
          </div>`
          )
          .join('')}
      </div>
      ${
        p.confidence || p.engine_agreement || hasValueGap
          ? `<div class="engine-summary">
              ${p.confidence ? `<span class="pill pill--confidence-${String(p.confidence).toLowerCase()}">${p.confidence} confidence</span>` : ''}
              ${p.engine_agreement ? `<span class="pill">Engine agreement: ${p.engine_agreement}</span>` : ''}
              ${hasValueGap ? `<span class="pill pill--value">Value gap H ${formatPct(p.value_gap_home)} / D ${formatPct(p.value_gap_draw)} / A ${formatPct(p.value_gap_away)}</span>` : ''}
             </div>`
          : ''
      }
      ${doubleChanceBlock(p)}
      ${
        p.actual_outcome
          ? `<div class="engine-grading">
              <span>Actual result: ${scoreline(p.actual_home_score, p.actual_away_score)} (${p.actual_outcome})</span>
              ${p.consensus_correct != null ? `<span class="pill ${p.consensus_correct ? 'pill--correct' : 'pill--incorrect'}">Consensus ${p.consensus_correct ? 'correct' : 'incorrect'}</span>` : ''}
             </div>`
          : ''
      }
    </div>
  `;
}

/** Double Chance isn't a stored column -- it's the sum of two already-stored consensus
 *  probabilities (1X = home+draw, 12 = home+away, X2 = draw+away). Labeled as derived so
 *  it's clear this is arithmetic on the existing consensus numbers, not a new prediction. */
function doubleChanceBlock(p) {
  if (p.consensus_home_prob == null || p.consensus_draw_prob == null || p.consensus_away_prob == null) return '';
  const dc1x = p.consensus_home_prob + p.consensus_draw_prob;
  const dc12 = p.consensus_home_prob + p.consensus_away_prob;
  const dcx2 = p.consensus_draw_prob + p.consensus_away_prob;
  return `
    <div class="double-chance">
      <h4>Double Chance <span class="derived-tag">derived from consensus probabilities</span></h4>
      <div class="double-chance__row">
        <span class="pill">1X ${formatPct(dc1x)}</span>
        <span class="pill">12 ${formatPct(dc12)}</span>
        <span class="pill">X2 ${formatPct(dcx2)}</span>
      </div>
    </div>
  `;
}

/** Expected goals (dc_expected_home/away) and the model's top scoreline picks
 *  (score_pred_1..3 / score_prob_1..3) -- all real prediction_log columns that
 *  were being fetched but never rendered anywhere in the phase-1 build. */
function expectedGoalsSection(p) {
  const hasXg = p.dc_expected_home != null && p.dc_expected_away != null;
  const scores = [
    [p.score_pred_1, p.score_prob_1],
    [p.score_pred_2, p.score_prob_2],
    [p.score_pred_3, p.score_prob_3],
  ].filter(([pred]) => pred != null);
  if (!hasXg && scores.length === 0) return '';

  return `
    <div class="panel">
      <h3>Expected Goals &amp; Most Likely Scores</h3>
      ${hasXg ? `<p class="expected-goals">Model expected goals: <strong>${p.dc_expected_home}</strong> &ndash; <strong>${p.dc_expected_away}</strong></p>` : ''}
      ${
        scores.length
          ? `<div class="score-picks">
              ${scores
                .map(
                  ([pred, prob], i) => `
                <div class="score-pick ${i === 0 ? 'score-pick--top' : ''}">
                  <span class="score-pick__score">${pred}</span>
                  <span class="score-pick__prob">${formatPct(prob)}</span>
                </div>`
                )
                .join('')}
             </div>`
          : ''
      }
    </div>
  `;
}

/** Side-by-side team_stats comparison for the two teams in this match, scoped to
 *  the match's season. Uses teamRepository, which already had this query written
 *  but no page was calling it. */
function teamComparisonSection(homeTeam, awayTeam, homeStats, awayStats) {
  if (!homeStats && !awayStats) return '';
  const metrics = [
    { label: 'Points', key: 'points' },
    { label: 'Win rate', key: 'win_rate', fmt: formatPct },
    { label: 'Goals/game', key: 'goals_per_game' },
    { label: 'Conceded/game', key: 'conceded_per_game' },
    { label: 'Home goals/game', key: 'home_goals_pg' },
    { label: 'Away goals/game', key: 'away_goals_pg' },
    { label: 'Clean sheets', key: 'clean_sheets' },
    { label: 'Possession %', key: 'possession_avg' },
    { label: 'xG/game', key: 'xg_per_game' },
    { label: 'Shots on target/game', key: 'shots_on_target_pg' },
  ];
  const dash = (v, fmt) => (v == null ? '\u2014' : fmt ? fmt(v) : v);
  const rows = metrics
    .map((m) => {
      const h = homeStats?.[m.key];
      const a = awayStats?.[m.key];
      if (h == null && a == null) return '';
      return `<tr><td>${m.label}</td><td>${dash(h, m.fmt)}</td><td>${dash(a, m.fmt)}</td></tr>`;
    })
    .join('');
  if (!rows) return '';
  const record = (s) => (s ? `${s.wins ?? 0}W ${s.draws ?? 0}D ${s.losses ?? 0}L` : '\u2014');

  return `
    <div class="panel">
      <h3>Team Comparison${homeStats?.season ? ` &middot; ${homeStats.season}` : ''}</h3>
      <table class="data-table data-table--compact">
        <thead><tr><th></th><th>${homeTeam}</th><th>${awayTeam}</th></tr></thead>
        <tbody>
          <tr><td>Record</td><td>${record(homeStats)}</td><td>${record(awayStats)}</td></tr>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function h2hSection(p) {
  if (p.h2h_total == null) return '';
  return `
    <div class="panel">
      <h3>Head to Head</h3>
      <p>${p.h2h_total} previous meetings &middot; Home win rate ${formatPct(p.h2h_home_rate)} &middot; Avg goals ${p.h2h_avg_goals ?? '\u2014'}</p>
      <p>${p.h2h_home_wins ?? 0} home wins, ${p.h2h_draws ?? 0} draws, ${p.h2h_away_wins ?? 0} away wins</p>
    </div>
  `;
}

function oddsSection(o) {
  return `
    <div class="panel">
      <h3>Bookmaker Odds</h3>
      <table class="data-table data-table--compact">
        <thead><tr><th>Book</th><th>Home</th><th>Draw</th><th>Away</th></tr></thead>
        <tbody>
          ${o.b365_home != null ? `<tr><td>Bet365</td><td>${o.b365_home}</td><td>${o.b365_draw}</td><td>${o.b365_away}</td></tr>` : ''}
          ${o.pinnacle_home != null ? `<tr><td>Pinnacle</td><td>${o.pinnacle_home}</td><td>${o.pinnacle_draw}</td><td>${o.pinnacle_away}</td></tr>` : ''}
          ${o.avg_home != null ? `<tr><td>Average</td><td>${o.avg_home}</td><td>${o.avg_draw}</td><td>${o.avg_away}</td></tr>` : ''}
          ${o.max_home != null ? `<tr><td>Max</td><td>${o.max_home}</td><td>${o.max_draw}</td><td>${o.max_away}</td></tr>` : ''}
        </tbody>
      </table>
      ${o.ah_line != null ? `<p>Asian Handicap: ${o.ah_line} (Home ${o.b365_ah_home ?? o.avg_ah_home ?? '\u2014'} / Away ${o.b365_ah_away ?? o.avg_ah_away ?? '\u2014'})</p>` : ''}
    </div>
  `;
}

function weatherSection(w) {
  if (w.error) {
    return `<div class="panel"><h3>Weather at Kickoff</h3><p class="empty-state__inline">Weather data failed to load for this match: ${w.error}</p></div>`;
  }
  if (w.temp_c == null) return '';
  return `
    <div class="panel">
      <h3>Weather at Kickoff</h3>
      <p>${w.temp_c}\u00b0C (feels ${w.feels_like_c}\u00b0C) &middot; ${w.description ?? w.weather ?? ''}</p>
      <p>Wind ${w.wind_speed_ms ?? '\u2014'} m/s &middot; Rain ${w.rain_mm ?? 0} mm &middot; Humidity ${w.humidity ?? '\u2014'}%</p>
    </div>
  `;
}

function injuriesSection(list) {
  return `
    <div class="panel">
      <h3>Injuries</h3>
      <table class="data-table data-table--compact">
        <thead><tr><th>Club</th><th>Player</th><th>Position</th><th>Injury</th><th>Return</th></tr></thead>
        <tbody>
          ${list
            .map(
              (i) => `<tr><td>${i.club}</td><td>${i.player}</td><td>${i.position ?? '\u2014'}</td><td>${i.injury ?? '\u2014'}</td><td>${i.return_date ?? '\u2014'}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}
