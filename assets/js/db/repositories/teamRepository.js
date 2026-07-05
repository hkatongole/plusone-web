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
