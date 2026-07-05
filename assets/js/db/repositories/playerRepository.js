import { storage } from '../storageAdapter.js';

/**
 * PlayerRepository — like teams, players have no stable cross-season ID in
 * this schema (the `id` column is a composite of league+season+team+name,
 * unique per row, not per person). Profiles are keyed by player name, same
 * simplification as teamRepository, with the same caveat: two genuinely
 * different people sharing an exact name would merge into one profile.
 *
 * Mid-season transfers are real and expected here (e.g. a player can have
 * two rows in the same season for two different clubs) -- never collapsed
 * or "resolved" into a single team, per spec: show history as recorded.
 */
class PlayerRepository {
  latestSeason() {
    if (!storage.hasTable('players')) return null;
    const row = storage.get(`SELECT MAX(season) AS s FROM players`);
    return row?.s ?? null;
  }

  directory({ league = null, season = null, team = null, position = null, search = null, page = 1, pageSize = 30 } = {}) {
    if (!storage.hasTable('players')) return { rows: [], total: 0, page, pageSize, totalPages: 1 };

    const effectiveSeason = season === 'all' ? null : season || this.latestSeason();
    const clauses = [];
    const params = [];
    if (league) {
      clauses.push('league = ?');
      params.push(league);
    }
    if (effectiveSeason) {
      clauses.push('season = ?');
      params.push(effectiveSeason);
    }
    if (team) {
      clauses.push('team = ?');
      params.push(team);
    }
    if (position) {
      clauses.push('position = ?');
      params.push(position);
    }
    if (search) {
      clauses.push('player LIKE ?');
      params.push(`%${search}%`);
    }
    const whereSql = clauses.length ? clauses.join(' AND ') : '1=1';
    const offset = (page - 1) * pageSize;

    const rows = storage.all(
      `SELECT * FROM players WHERE ${whereSql} ORDER BY goals DESC, player ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const totalRow = storage.get(`SELECT COUNT(*) AS n FROM players WHERE ${whereSql}`, params);
    const total = totalRow?.n ?? 0;
    return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** Every row on record for this player name, across all teams/seasons. */
  profileRows(player) {
    if (!storage.hasTable('players')) return [];
    return storage.all(`SELECT * FROM players WHERE player = ? ORDER BY season DESC, team ASC`, [player]);
  }

  /** The most recent single row -- used as the "current" snapshot on the header.
   *  If a player has two rows in the same latest season (mid-season transfer),
   *  this picks one deterministically (most recently updated) for the header;
   *  the full picture is always in profileRows()/the Teams tab. */
  latestRowFor(player) {
    if (!storage.hasTable('players')) return null;
    return storage.get(
      `SELECT * FROM players WHERE player = ? ORDER BY season DESC, updated_at DESC LIMIT 1`,
      [player]
    );
  }

  leaguesFor(player) {
    if (!storage.hasTable('players')) return [];
    return storage.all(`SELECT DISTINCT league FROM players WHERE player = ? ORDER BY league`, [player]).map((r) => r.league);
  }

  distinctLeagues() {
    if (!storage.hasTable('players')) return [];
    return storage.all(`SELECT DISTINCT league FROM players ORDER BY league`).map((r) => r.league);
  }

  distinctPositions() {
    if (!storage.hasTable('players')) return [];
    return storage
      .all(`SELECT DISTINCT position FROM players WHERE position IS NOT NULL ORDER BY position`)
      .map((r) => r.position);
  }

  /** Match-level appearances would need team_lineups.players_json populated per
   *  match -- that table is empty in every backup seen so far, so this honestly
   *  reports unavailability rather than approximating from season totals. */
  matchAppearances(player) {
    if (!storage.hasTable('team_lineups') || storage.rowCount('team_lineups') === 0) {
      return { available: false, rows: [] };
    }
    // No confirmed schema/sample data to parse players_json against yet -- once
    // a populated export is available, parse it here rather than guessing the shape.
    return { available: false, rows: [] };
  }
}

export const playerRepository = new PlayerRepository();
