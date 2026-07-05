import { storage } from '../storageAdapter.js';

/**
 * LeagueRepository. Standings are read from team_stats (which already has
 * points/W-D-L/goals precomputed per team+league+season) rather than
 * re-derived from raw match results -- avoids re-implementing any scoring/
 * tie-break logic. Statistics aggregate over `matches` directly since that
 * table has the broadest coverage; cards/corners come from
 * `historical_results` only when that table actually has rows for the league
 * (it's empty in every backup seen so far, so those fields are typically
 * omitted, per the schema-drift principle).
 */

/** Lightweight, name-pattern based type inference -- reads the league's own
 *  name text as "the data" rather than maintaining a per-league lookup table.
 *  This is a best-effort label, not an authoritative classification. */
function inferCompetitionType(name = '') {
  const n = name.toLowerCase();
  if (/\bwomen'?s?\b|\bfemenino\b|\bfeminine\b|\bdamallsvenskan\b/.test(n)) return "Women's";
  if (/\bu1[5-9]\b|\bu2[0-3]\b|\byouth\b|\bacademy\b|\bjunior\b/.test(n)) return 'Youth';
  if (/\bcup\b|\btrophy\b|\bshield\b|\bcopa\b|\bcoupe\b|\bpokal\b/.test(n)) return 'Cup';
  if (/\bchampions league\b|\beuropa\b|\bworld cup\b|\beuro\b|\buefa\b|\bconmebol\b|\bconcacaf\b|\bcaf\b|\bafc\b|\bnations league\b/.test(n))
    return 'International';
  return 'Domestic League';
}

class LeagueRepository {
  directory() {
    if (!storage.hasTable('matches')) return [];
    const leagues = storage.all(`SELECT DISTINCT league FROM matches WHERE league IS NOT NULL ORDER BY league`);
    return leagues.map(({ league }) => {
      const seasonRow = storage.get(`SELECT MAX(season) AS s FROM matches WHERE league = ?`, [league]);
      const season = seasonRow?.s ?? null;
      const teamCountRow = storage.hasTable('team_stats')
        ? storage.get(`SELECT COUNT(DISTINCT team) AS n FROM team_stats WHERE league = ? AND season = ?`, [league, season])
        : null;
      const fixtureCountRow = storage.get(`SELECT COUNT(*) AS n FROM matches WHERE league = ? AND season = ?`, [league, season]);
      const predictionCountRow = storage.hasTable('prediction_log')
        ? storage.get(`SELECT COUNT(*) AS n FROM prediction_log WHERE league = ?`, [league])
        : null;
      return {
        league,
        season,
        type: inferCompetitionType(league),
        teamCount: teamCountRow?.n ?? null,
        fixtureCount: fixtureCountRow?.n ?? 0,
        predictionCount: predictionCountRow?.n ?? 0,
      };
    });
  }

  latestSeason(league) {
    const row = storage.get(`SELECT MAX(season) AS s FROM matches WHERE league = ?`, [league]);
    return row?.s ?? null;
  }

  seasonsFor(league) {
    return storage.all(`SELECT DISTINCT season FROM matches WHERE league = ? ORDER BY season DESC`, [league]).map((r) => r.season);
  }

  /** Standings from team_stats, ordered by points then goal difference (the
   *  standard tie-break), with position computed as row order -- not stored
   *  anywhere, but derived purely from already-aggregated columns. */
  standings(league, season) {
    if (!storage.hasTable('team_stats')) return [];
    const rows = storage.all(
      `SELECT *, (goals_scored - goals_conceded) AS goal_diff
       FROM team_stats WHERE league = ? AND season = ?
       ORDER BY points DESC, goal_diff DESC, goals_scored DESC`,
      [league, season]
    );
    return rows.map((r, i) => ({ ...r, position: i + 1 }));
  }

  overview(league, season) {
    const fixtureCount = storage.get(`SELECT COUNT(*) AS n FROM matches WHERE league = ? AND season = ?`, [league, season]);
    const teamCount = storage.hasTable('team_stats')
      ? storage.get(`SELECT COUNT(DISTINCT team) AS n FROM team_stats WHERE league = ? AND season = ?`, [league, season])
      : null;
    const predictionCount = storage.hasTable('prediction_log')
      ? storage.get(`SELECT COUNT(*) AS n FROM prediction_log WHERE league = ? AND season = ?`, [league, season])
      : null;
    return {
      fixtureCount: fixtureCount?.n ?? 0,
      teamCount: teamCount?.n ?? null,
      predictionCount: predictionCount?.n ?? null,
    };
  }

  fixturesPage(league, fromDateStr, { page = 1, pageSize = 20 } = {}) {
    const offset = (page - 1) * pageSize;
    const rows = storage.all(
      `SELECT * FROM matches WHERE league = ? AND match_date >= ? ORDER BY match_date ASC LIMIT ? OFFSET ?`,
      [league, fromDateStr, pageSize, offset]
    );
    const totalRow = storage.get(`SELECT COUNT(*) AS n FROM matches WHERE league = ? AND match_date >= ?`, [league, fromDateStr]);
    const total = totalRow?.n ?? 0;
    return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  resultsPage(league, { season, team, page = 1, pageSize = 20 } = {}) {
    const clauses = ['league = ?', 'home_score IS NOT NULL'];
    const params = [league];
    if (season) {
      clauses.push('season = ?');
      params.push(season);
    }
    if (team) {
      clauses.push('(home_team = ? OR away_team = ?)');
      params.push(team, team);
    }
    const whereSql = clauses.join(' AND ');
    const offset = (page - 1) * pageSize;
    const rows = storage.all(
      `SELECT * FROM matches WHERE ${whereSql} ORDER BY match_date DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const totalRow = storage.get(`SELECT COUNT(*) AS n FROM matches WHERE ${whereSql}`, params);
    const total = totalRow?.n ?? 0;
    return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** All via SQL aggregation over stored records, per spec -- total goals,
   *  goals/match, home/away win split, draws; cards/corners only if
   *  historical_results actually has rows for this league. */
  statistics(league, season) {
    const base = storage.get(
      `SELECT
         COUNT(*) AS played,
         SUM(home_score + away_score) AS total_goals,
         SUM(CASE WHEN home_score > away_score THEN 1 ELSE 0 END) AS home_wins,
         SUM(CASE WHEN away_score > home_score THEN 1 ELSE 0 END) AS away_wins,
         SUM(CASE WHEN home_score = away_score THEN 1 ELSE 0 END) AS draws,
         SUM(CASE WHEN away_score = 0 THEN 1 ELSE 0 END) AS home_clean_sheets,
         SUM(CASE WHEN home_score = 0 THEN 1 ELSE 0 END) AS away_clean_sheets
       FROM matches WHERE league = ? AND season = ? AND home_score IS NOT NULL`,
      [league, season]
    );

    let cardsCorners = null;
    if (storage.hasTable('historical_results') && storage.rowCount('historical_results') > 0) {
      const row = storage.get(
        `SELECT
           AVG(home_yellow + away_yellow) AS avg_cards,
           AVG(home_corners + away_corners) AS avg_corners
         FROM historical_results WHERE league = ? AND season = ?`,
        [league, season]
      );
      if (row && (row.avg_cards != null || row.avg_corners != null)) cardsCorners = row;
    }

    return { ...base, cardsCorners };
  }

  /** Odds rows for matches in this league -- paginated. Deliberately NOT
   *  filtered by season: match_odds.season has been observed in a compact
   *  format ('2526') while matches.season/team_stats.season use '2025-2026'
   *  for the same season. Filtering or joining on season equality across
   *  those tables would silently return zero rows -- if a season filter is
   *  added here later, normalize both formats first rather than comparing
   *  them directly. */
  oddsPage(league, { page = 1, pageSize = 20 } = {}) {
    if (!storage.hasTable('match_odds')) return { rows: [], total: 0, page, pageSize, totalPages: 1 };
    const offset = (page - 1) * pageSize;
    const rows = storage.all(
      `SELECT * FROM match_odds WHERE league = ? ORDER BY match_date DESC LIMIT ? OFFSET ?`,
      [league, pageSize, offset]
    );
    const totalRow = storage.get(`SELECT COUNT(*) AS n FROM match_odds WHERE league = ?`, [league]);
    const total = totalRow?.n ?? 0;
    return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** Prediction volume/market/confidence distribution -- counts only, never a
   *  computed accuracy figure except where prediction_log already stores the
   *  graded correctness flag (consensus_correct etc.), which this aggregates
   *  rather than re-derives. */
  predictionDistribution(league, season) {
    if (!storage.hasTable('prediction_log')) return null;
    const byOutcome = storage.all(
      `SELECT consensus_outcome AS outcome, COUNT(*) AS n FROM prediction_log
       WHERE league = ? AND season = ? AND consensus_outcome IS NOT NULL
       GROUP BY consensus_outcome ORDER BY n DESC`,
      [league, season]
    );
    const byConfidence = storage.all(
      `SELECT confidence, COUNT(*) AS n FROM prediction_log
       WHERE league = ? AND season = ? AND confidence IS NOT NULL
       GROUP BY confidence ORDER BY n DESC`,
      [league, season]
    );
    const total = storage.get(`SELECT COUNT(*) AS n FROM prediction_log WHERE league = ? AND season = ?`, [league, season]);
    const graded = storage.get(
      `SELECT COUNT(*) AS n FROM prediction_log WHERE league = ? AND season = ? AND status = 'graded'`,
      [league, season]
    );
    return { total: total?.n ?? 0, graded: graded?.n ?? 0, byOutcome, byConfidence };
  }
}

export const leagueRepository = new LeagueRepository();
export { inferCompetitionType };
