import { storage } from '../storageAdapter.js';
import { BaseRepository } from './baseRepository.js';

/**
 * MatchRepository — read-only access to `matches`, enriched (via LEFT JOIN,
 * never a write) with `prediction_log`, `match_odds`, and `match_weather`
 * when those tables/columns exist in the loaded backup.
 */
class MatchRepository extends BaseRepository {
  constructor() {
    super('matches');
    this.defaultOrder = 'match_date DESC, start_time DESC';
  }

  /** Distinct leagues present in the data (drives the global league filter, Section 4.0). */
  listLeagues() {
    if (!this.exists()) return [];
    return storage
      .all(`SELECT DISTINCT league FROM "matches" WHERE league IS NOT NULL ORDER BY league`)
      .map((r) => r.league);
  }

  listSeasons(league = null) {
    if (!this.exists()) return [];
    const where = league ? 'WHERE league = ?' : '';
    const params = league ? [league] : [];
    return storage
      .all(`SELECT DISTINCT season FROM "matches" ${where} ORDER BY season DESC`, params)
      .map((r) => r.season);
  }

  /**
   * Fixtures for a given date (defaults to today), joined with the consensus
   * prediction columns from prediction_log when present. This backs the
   * Home / Today's Predictions page (Section 4 item 1).
   */
  fixturesForDate(dateStr, { league = null } = {}) {
    if (!this.exists()) return [];
    const predCols = storage.availableColumns('prediction_log', [
      'consensus_outcome',
      'consensus_home_prob',
      'consensus_draw_prob',
      'consensus_away_prob',
      'confidence',
      'value_gap_home',
      'value_gap_draw',
      'value_gap_away',
      'best_bet_outcome',
      'status',
      'predicted_at',
    ]);
    const hasPredLog = storage.hasTable('prediction_log');
    const selectPred = hasPredLog
      ? predCols.map((c) => `p."${c}" AS pred_${c}`).join(', ')
      : '';

    const joinClause = hasPredLog ? `LEFT JOIN prediction_log p ON p.match_id = m.id` : '';

    const where = ['m.match_date = ?'];
    const params = [dateStr];
    if (league) {
      where.push('m.league = ?');
      params.push(league);
    }

    const sql = `
      SELECT m.*${selectPred ? ', ' + selectPred : ''}
      FROM matches m
      ${joinClause}
      WHERE ${where.join(' AND ')}
      ORDER BY m.start_time ASC, m.league ASC
    `;
    return storage.all(sql, params);
  }

  /** Nearest date with any fixtures on/after `fromDateStr`, so Home never renders empty
   *  just because "today" happens to have no matches in this particular backup. */
  nextFixtureDate(fromDateStr) {
    if (!this.exists()) return null;
    const row = storage.get(
      `SELECT match_date FROM matches WHERE match_date >= ? ORDER BY match_date ASC LIMIT 1`,
      [fromDateStr]
    );
    return row ? row.match_date : null;
  }

  filterMatches({ league, season, team, dateFrom, dateTo, page = 1, pageSize = 25 } = {}) {
    const clauses = [];
    const params = [];
    if (league) {
      clauses.push('league = ?');
      params.push(league);
    }
    if (season) {
      clauses.push('season = ?');
      params.push(season);
    }
    if (team) {
      clauses.push('(home_team = ? OR away_team = ?)');
      params.push(team, team);
    }
    if (dateFrom) {
      clauses.push('match_date >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      clauses.push('match_date <= ?');
      params.push(dateTo);
    }
    const whereSql = clauses.length ? clauses.join(' AND ') : '1=1';
    return this.paginate({ page, pageSize, whereSql, params, orderBy: this.defaultOrder });
  }

  /** Full detail bundle for /matches/{id}: match + prediction + odds + weather + H2H,
   *  each only included if the underlying table/columns exist (Section 2 schema-drift rule). */
  detailBundle(matchId) {
    const match = this.findById(matchId);
    if (!match) return null;

    const bundle = { match, prediction: null, odds: null, weather: null, injuries: [] };

    if (storage.hasTable('prediction_log')) {
      bundle.prediction = storage.get(`SELECT * FROM prediction_log WHERE match_id = ? LIMIT 1`, [match.id]);
    }
    if (storage.hasTable('match_odds')) {
      bundle.odds = storage.get(
        `SELECT * FROM match_odds WHERE home_team = ? AND away_team = ? AND match_date = ? LIMIT 1`,
        [match.home_team, match.away_team, match.match_date]
      );
    }
    if (storage.hasTable('match_weather')) {
      bundle.weather = storage.get(
        `SELECT * FROM match_weather WHERE home_team = ? AND away_team = ? AND match_date = ? LIMIT 1`,
        [match.home_team, match.away_team, match.match_date]
      );
    }
    if (storage.hasTable('team_injuries')) {
      bundle.injuries = storage.all(
        `SELECT * FROM team_injuries WHERE club IN (?, ?) ORDER BY return_date ASC`,
        [match.home_team, match.away_team]
      );
    }
    return bundle;
  }

  /** Most recent data timestamp across matches + predictions, for Section 4.0's "Data as of". */
  dataAsOf() {
    const candidates = [];
    const m = this.latestTimestamp(['scraped_at']);
    if (m) candidates.push(m);
    if (storage.hasTable('prediction_log')) {
      const pRow = storage.get(
        `SELECT MAX(predicted_at) AS a, MAX(evaluated_at) AS b FROM prediction_log`
      );
      if (pRow?.a) candidates.push(pRow.a);
      if (pRow?.b) candidates.push(pRow.b);
    }
    if (candidates.length === 0) return null;
    return candidates.sort().reverse()[0];
  }
}

export const matchRepository = new MatchRepository();
