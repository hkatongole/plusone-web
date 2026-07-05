import { storage } from '../storageAdapter.js';
import { BaseRepository } from './baseRepository.js';

/**
 * TeamRepository — teams aren't a standalone table in this schema; "team" is a
 * value that recurs across matches/team_stats/players/etc. This repository
 * treats `team_stats` as the canonical per-team-per-season row (it's the one
 * table keyed cleanly on team+league+season) and derives the directory from it,
 * falling back to distinct team names out of `matches` if team_stats is empty.
 */
class TeamRepository extends BaseRepository {
  constructor() {
    super('team_stats');
  }

  /** Most recent season present in team_stats (used as the directory's default filter). */
  latestSeason() {
    if (!storage.hasTable('team_stats')) return null;
    const row = storage.get(`SELECT MAX(season) AS s FROM team_stats`);
    return row?.s ?? null;
  }

  directory({ league = null, season = null } = {}) {
    if (storage.hasTable('team_stats') && storage.rowCount('team_stats') > 0) {
      // team_stats carries one row per team PER SEASON (confirmed: 184 rows across ~46
      // teams x 4 seasons in the sample backup) -- default to the latest season so the
      // directory shows each team once, rather than every team repeated per season.
      // Pass season: 'all' explicitly to opt into the full multi-season history.
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
      const whereSql = clauses.length ? clauses.join(' AND ') : '1=1';
      return storage.all(
        `SELECT team, league, season, points, wins, draws, losses, games_played, win_rate
         FROM team_stats WHERE ${whereSql} ORDER BY league, points DESC`,
        params
      );
    }
    // Fallback: derive a bare-bones directory from matches so the page never renders empty
    // just because this particular backup hasn't populated team_stats yet.
    if (!storage.hasTable('matches')) return [];
    return storage.all(`
      SELECT team, league, NULL AS season, NULL AS points, NULL AS wins, NULL AS draws,
             NULL AS losses, NULL AS games_played, NULL AS win_rate
      FROM (
        SELECT home_team AS team, league FROM matches
        UNION
        SELECT away_team AS team, league FROM matches
      )
      GROUP BY team, league
      ORDER BY league, team
    `);
  }

  /** Current-season snapshot + home/away split for /teams/{name}. */
  statsFor(team, season = null) {
    if (!storage.hasTable('team_stats')) return null;
    if (season) {
      return storage.get(`SELECT * FROM team_stats WHERE team = ? AND season = ?`, [team, season]);
    }
    return storage.get(
      `SELECT * FROM team_stats WHERE team = ? ORDER BY season DESC LIMIT 1`,
      [team]
    );
  }

  recentForm(team, limit = 5) {
    if (!storage.hasTable('matches')) return [];
    return storage.all(
      `SELECT * FROM matches
       WHERE (home_team = ? OR away_team = ?) AND home_score IS NOT NULL
       ORDER BY match_date DESC LIMIT ?`,
      [team, team, limit]
    );
  }

  upcomingFixtures(team, fromDateStr, limit = 5) {
    if (!storage.hasTable('matches')) return [];
    return storage.all(
      `SELECT * FROM matches
       WHERE (home_team = ? OR away_team = ?) AND match_date >= ?
       ORDER BY match_date ASC LIMIT ?`,
      [team, team, fromDateStr, limit]
    );
  }

  /** Paginated fixtures list for /teams/{name}/fixtures, joined with the consensus
   *  prediction pick when one exists -- mirrors the join used on Home. */
  fixturesPage(team, fromDateStr, { page = 1, pageSize = 20 } = {}) {
    if (!storage.hasTable('matches')) return { rows: [], total: 0, page, pageSize, totalPages: 1 };
    const hasPredLog = storage.hasTable('prediction_log');
    const joinClause = hasPredLog ? `LEFT JOIN prediction_log p ON p.match_id = m.id` : '';
    const predCols = hasPredLog
      ? storage.availableColumns('prediction_log', ['consensus_outcome', 'confidence']).map((c) => `p."${c}" AS pred_${c}`)
      : [];
    const select = predCols.length ? `m.*, ${predCols.join(', ')}` : 'm.*';
    const offset = (page - 1) * pageSize;
    const rows = storage.all(
      `SELECT ${select} FROM matches m ${joinClause}
       WHERE (m.home_team = ? OR m.away_team = ?) AND m.match_date >= ?
       ORDER BY m.match_date ASC LIMIT ? OFFSET ?`,
      [team, team, fromDateStr, pageSize, offset]
    );
    const totalRow = storage.get(
      `SELECT COUNT(*) AS n FROM matches WHERE (home_team = ? OR away_team = ?) AND match_date >= ?`,
      [team, team, fromDateStr]
    );
    const total = totalRow?.n ?? 0;
    return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** Filterable, paginated past results for /teams/{name}/results. `result` filters
   *  relative to `team` ('win'/'draw'/'loss'), computed via a wrapped subquery since
   *  SQLite can't reference a SELECT-list alias in the same query's WHERE clause. */
  resultsFor(team, { season, league, opponent, result, dateFrom, dateTo, page = 1, pageSize = 20 } = {}) {
    if (!storage.hasTable('matches')) return { rows: [], total: 0, page, pageSize, totalPages: 1 };

    const outer = [];
    const outerParams = [];
    if (season) {
      outer.push('season = ?');
      outerParams.push(season);
    }
    if (league) {
      outer.push('league = ?');
      outerParams.push(league);
    }
    if (opponent) {
      outer.push('(home_team = ? OR away_team = ?)');
      outerParams.push(opponent, opponent);
    }
    if (dateFrom) {
      outer.push('match_date >= ?');
      outerParams.push(dateFrom);
    }
    if (dateTo) {
      outer.push('match_date <= ?');
      outerParams.push(dateTo);
    }
    if (result) {
      outer.push('team_result = ?');
      outerParams.push(result);
    }
    const outerWhere = outer.length ? `WHERE ${outer.join(' AND ')}` : '';

    const inner = `
      SELECT *,
        CASE
          WHEN home_team = ? THEN
            CASE WHEN home_score > away_score THEN 'win' WHEN home_score = away_score THEN 'draw' ELSE 'loss' END
          ELSE
            CASE WHEN away_score > home_score THEN 'win' WHEN away_score = home_score THEN 'draw' ELSE 'loss' END
        END AS team_result
      FROM matches
      WHERE (home_team = ? OR away_team = ?) AND home_score IS NOT NULL
    `;
    const innerParams = [team, team, team];

    const offset = (page - 1) * pageSize;
    const rows = storage.all(
      `SELECT * FROM (${inner}) ${outerWhere} ORDER BY match_date DESC LIMIT ? OFFSET ?`,
      [...innerParams, ...outerParams, pageSize, offset]
    );
    const totalRow = storage.get(
      `SELECT COUNT(*) AS n FROM (${inner}) ${outerWhere}`,
      [...innerParams, ...outerParams]
    );
    const total = totalRow?.n ?? 0;
    return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** Paginated predictions involving this team, for /teams/{name}/predictions. */
  predictionsFor(team, { page = 1, pageSize = 20 } = {}) {
    if (!storage.hasTable('prediction_log')) return { rows: [], total: 0, page, pageSize, totalPages: 1 };
    const offset = (page - 1) * pageSize;
    const rows = storage.all(
      `SELECT * FROM prediction_log WHERE home_team = ? OR away_team = ?
       ORDER BY match_date DESC LIMIT ? OFFSET ?`,
      [team, team, pageSize, offset]
    );
    const totalRow = storage.get(
      `SELECT COUNT(*) AS n FROM prediction_log WHERE home_team = ? OR away_team = ?`,
      [team, team]
    );
    const total = totalRow?.n ?? 0;
    return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** Paginated bookmaker odds involving this team, for /teams/{name}/odds. */
  oddsFor(team, { page = 1, pageSize = 20 } = {}) {
    if (!storage.hasTable('match_odds')) return { rows: [], total: 0, page, pageSize, totalPages: 1 };
    const offset = (page - 1) * pageSize;
    const rows = storage.all(
      `SELECT * FROM match_odds WHERE home_team = ? OR away_team = ?
       ORDER BY match_date DESC LIMIT ? OFFSET ?`,
      [team, team, pageSize, offset]
    );
    const totalRow = storage.get(
      `SELECT COUNT(*) AS n FROM match_odds WHERE home_team = ? OR away_team = ?`,
      [team, team]
    );
    const total = totalRow?.n ?? 0;
    return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** Distinct leagues/seasons a team has played in -- drives the Results tab's filter dropdowns. */
  leaguesFor(team) {
    if (!storage.hasTable('matches')) return [];
    return storage
      .all(`SELECT DISTINCT league FROM matches WHERE home_team = ? OR away_team = ? ORDER BY league`, [team, team])
      .map((r) => r.league);
  }

  seasonsFor(team) {
    if (!storage.hasTable('matches')) return [];
    return storage
      .all(`SELECT DISTINCT season FROM matches WHERE home_team = ? OR away_team = ? ORDER BY season DESC`, [team, team])
      .map((r) => r.season);
  }

  squad(team, season = null) {
    if (!storage.hasTable('players')) return [];
    if (season) {
      return storage.all(`SELECT * FROM players WHERE team = ? AND season = ? ORDER BY position, player`, [team, season]);
    }
    return storage.all(`SELECT * FROM players WHERE team = ? ORDER BY season DESC, position, player`, [team]);
  }

  seasonHistory(team) {
    if (!storage.hasTable('team_stats')) return [];
    return storage.all(`SELECT * FROM team_stats WHERE team = ? ORDER BY season DESC`, [team]);
  }
}

export const teamRepository = new TeamRepository();
