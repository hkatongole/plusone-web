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

  /** Centralized filterable browse for the Prediction & Odds Explorer (Section 4
   *  item 6). `market` filters on consensus_outcome (the closest concept this
   *  schema has to a "market" for the core prediction); engineCorrect filters
   *  on an already-graded correctness flag, never a recomputed one. */
  filterPredictions({ league, status, market, confidence, engine = 'consensus', engineCorrect, page = 1, pageSize = 25 } = {}) {
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
    if (market && this.columns(['consensus_outcome']).length) {
      clauses.push('consensus_outcome = ?');
      params.push(market);
    }
    if (confidence && this.columns(['confidence']).length) {
      clauses.push('confidence = ?');
      params.push(confidence);
    }
    if (engineCorrect !== undefined && engineCorrect !== '' && engineCorrect !== null) {
      const col = `${engine}_correct`;
      if (this.columns([col]).length) {
        clauses.push(`"${col}" = ?`);
        params.push(engineCorrect === 'true' || engineCorrect === true ? 1 : 0);
      }
    }
    const whereSql = clauses.length ? clauses.join(' AND ') : '1=1';
    return this.paginate({ page, pageSize, whereSql, params, orderBy: this.defaultOrder });
  }

  /** Same filters as filterPredictions but unpaginated, capped, for CSV export --
   *  exports exactly the filtered dataset the user is looking at, never a
   *  separate or fabricated dataset (Section 4 item 6's guest/member guarantee). */
  exportRows({ league, status, market, confidence, engine = 'consensus', engineCorrect, limit = 5000 } = {}) {
    const { rows } = this.filterPredictions({ league, status, market, confidence, engine, engineCorrect, page: 1, pageSize: limit });
    return rows;
  }

  /** The highest value gap actually present in the loaded data -- used to give an
   *  honest, specific empty-state message ("nothing clears X%, the highest on record
   *  is Y%") instead of a generic "no results" when a threshold is unreachable. */
  maxValueGap() {
    if (!this.exists() || this.columns(['value_gap_home', 'value_gap_draw', 'value_gap_away']).length < 3) return null;
    const row = storage.get(
      `SELECT MAX(MAX(value_gap_home, value_gap_draw, value_gap_away)) AS m FROM prediction_log`
    );
    return row?.m ?? null;
  }

  distinctLeagues() {
    if (!this.exists()) return [];
    return storage.all(`SELECT DISTINCT league FROM prediction_log WHERE league IS NOT NULL ORDER BY league`).map((r) => r.league);
  }

  distinctMarkets() {
    if (!this.exists() || this.columns(['consensus_outcome']).length === 0) return [];
    return storage
      .all(`SELECT DISTINCT consensus_outcome FROM prediction_log WHERE consensus_outcome IS NOT NULL ORDER BY consensus_outcome`)
      .map((r) => r.consensus_outcome);
  }

  distinctConfidences() {
    if (!this.exists() || this.columns(['confidence']).length === 0) return [];
    return storage
      .all(`SELECT DISTINCT confidence FROM prediction_log WHERE confidence IS NOT NULL ORDER BY confidence`)
      .map((r) => r.confidence);
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
   * Default minValueGap is 0, not a positive number: verified against two real backups,
   * value_gap_home/draw/away are always exactly 0 in both -- a nonzero default would
   * silently return an empty list on this data even though the feature works correctly.
   */
  valueBets({ minConfidenceTier = 'Medium', minValueGap = 0, fromDate, limit = 50 } = {}) {
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
