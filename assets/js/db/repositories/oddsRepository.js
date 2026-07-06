import { storage } from '../storageAdapter.js';

/**
 * OddsRepository — global (not team/league-scoped) browse over match_odds
 * and fortebet_odds for the centralized Prediction & Odds Explorer
 * (Section 4 item 6). Purely read/aggregate; never derives an odds value
 * that wasn't already stored.
 */
class OddsRepository {
  matchOddsQuery({ league, page = 1, pageSize = 25 } = {}) {
    if (!storage.hasTable('match_odds')) return { rows: [], total: 0, page, pageSize, totalPages: 1 };
    const clauses = [];
    const params = [];
    if (league) {
      clauses.push('league = ?');
      params.push(league);
    }
    const whereSql = clauses.length ? clauses.join(' AND ') : '1=1';
    const offset = (page - 1) * pageSize;
    const rows = storage.all(
      `SELECT * FROM match_odds WHERE ${whereSql} ORDER BY match_date DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const totalRow = storage.get(`SELECT COUNT(*) AS n FROM match_odds WHERE ${whereSql}`, params);
    const total = totalRow?.n ?? 0;
    return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  fortebetOddsQuery({ league, page = 1, pageSize = 25 } = {}) {
    if (!storage.hasTable('fortebet_odds')) return { rows: [], total: 0, page, pageSize, totalPages: 1 };
    const clauses = [];
    const params = [];
    if (league) {
      clauses.push('league = ?');
      params.push(league);
    }
    const whereSql = clauses.length ? clauses.join(' AND ') : '1=1';
    const offset = (page - 1) * pageSize;
    const rows = storage.all(
      `SELECT * FROM fortebet_odds WHERE ${whereSql} ORDER BY match_date DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const totalRow = storage.get(`SELECT COUNT(*) AS n FROM fortebet_odds WHERE ${whereSql}`, params);
    const total = totalRow?.n ?? 0;
    return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  exportMatchOdds({ league, limit = 5000 } = {}) {
    return this.matchOddsQuery({ league, page: 1, pageSize: limit }).rows;
  }

  exportFortebetOdds({ league, limit = 5000 } = {}) {
    return this.fortebetOddsQuery({ league, page: 1, pageSize: limit }).rows;
  }

  distinctMatchOddsLeagues() {
    if (!storage.hasTable('match_odds')) return [];
    return storage.all(`SELECT DISTINCT league FROM match_odds WHERE league IS NOT NULL ORDER BY league`).map((r) => r.league);
  }

  distinctFortebetLeagues() {
    if (!storage.hasTable('fortebet_odds')) return [];
    return storage.all(`SELECT DISTINCT league FROM fortebet_odds WHERE league IS NOT NULL ORDER BY league`).map((r) => r.league);
  }
}

export const oddsRepository = new OddsRepository();
