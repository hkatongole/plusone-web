import { storage } from '../storageAdapter.js';
import { BaseRepository } from './baseRepository.js';

/**
 * PredictionRepository — read-only queries over prediction_log/engine_weights.
 * Per Section 3, this repository never recomputes DC/ML/Legacy/consensus values;
 * it only SELECTs, JOINs, and aggregates (COUNT/AVG) numbers that already exist.
 */
class PredictionRepository extends BaseRepository {
  constructor() {
    super('prediction_log');
    this.defaultOrder = 'match_date DESC';
  }

  filterPredictions({ league, status, engine, page = 1, pageSize = 25 } = {}) {
    const clauses = [];
    const params = [];
    if (league) {
      clauses.push('league = ?');
      params.push(league);
    }
    if (status && this.columns(['status']).length) {
      clauses.push('status = ?');
      params.push(status);
    }
    const whereSql = clauses.length ? clauses.join(' AND ') : '1=1';
    return this.paginate({ page, pageSize, whereSql, params, orderBy: this.defaultOrder });
  }

  /** Per-engine accuracy, computed with SQL AVG() over already-graded rows only
   *  (Section 4 item 8 — Model Performance & Calibration). */
  engineAccuracy({ league = null } = {}) {
    if (!this.exists()) return [];
    const engines = [
      ['dc', 'dc_correct'],
      ['ml', 'ml_correct'],
      ['legacy', 'legacy_correct'],
      ['consensus', 'consensus_correct'],
    ].filter(([, col]) => this.columns([col]).length);

    if (engines.length === 0) return [];

    const where = ["status = 'graded'"];
    const params = [];
    if (league) {
      where.push('league = ?');
      params.push(league);
    }
    const whereSql = where.join(' AND ');

    return engines.map(([name, col]) => {
      const row = storage.get(
        `SELECT COUNT(*) AS n, AVG(CASE WHEN "${col}" = 1 THEN 1.0 ELSE 0 END) AS accuracy
         FROM prediction_log WHERE ${whereSql} AND "${col}" IS NOT NULL`,
        params
      );
      return { engine: name, sampleSize: row?.n ?? 0, accuracy: row?.accuracy ?? null };
    });
  }

  engineWeightHistory() {
    if (!storage.hasTable('engine_weights')) return [];
    return storage.all(`SELECT * FROM engine_weights ORDER BY computed_at ASC`);
  }

  /**
   * Value/"Safe" bets — computed live from stored value_gap columns and confidence, never cached.
   * `confidence` in this schema is a text tier ('Low'/'Medium'/'High'), not a 0-1 float,
   * so the threshold is expressed as the minimum acceptable tier rather than a number.
   */
  valueBets({ minConfidenceTier = 'Medium', minValueGap = 0.05, fromDate, limit = 50 } = {}) {
    if (!this.exists()) return [];
    const hasCols = this.columns(['confidence', 'value_gap_home', 'value_gap_draw', 'value_gap_away']);
    if (hasCols.length < 4) return [];

    const tierRank = { Low: 0, Medium: 1, High: 2 };
    const acceptedTiers = Object.keys(tierRank).filter((t) => tierRank[t] >= (tierRank[minConfidenceTier] ?? 1));
    const placeholders = acceptedTiers.map(() => '?').join(',');

    const params = [...acceptedTiers, minValueGap, minValueGap, minValueGap];
    let dateClause = '';
    if (fromDate) {
      dateClause = 'AND match_date >= ?';
      params.push(fromDate);
    }
    params.push(limit);
    return storage.all(
      `SELECT * FROM prediction_log
       WHERE confidence IN (${placeholders})
         AND (value_gap_home >= ? OR value_gap_draw >= ? OR value_gap_away >= ?)
         ${dateClause}
       ORDER BY
         CASE confidence WHEN 'High' THEN 2 WHEN 'Medium' THEN 1 ELSE 0 END DESC,
         (value_gap_home + value_gap_draw + value_gap_away) DESC
       LIMIT ?`,
      params
    );
  }
}

export const predictionRepository = new PredictionRepository();
