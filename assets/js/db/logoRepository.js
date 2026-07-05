import { storage } from './storageAdapter.js';

/**
 * Caches team_logos (team -> logo_url) in memory so badges.js can do a
 * synchronous lookup on every render without hitting sql.js per badge.
 * The cache rebuilds automatically whenever a new database is loaded --
 * keyed off storage.loadedAt rather than requiring storageAdapter to know
 * about this module (keeps the dependency direction one-way).
 */
class LogoRepository {
  constructor() {
    this._cache = null;
    this._cacheLoadedAt = null;
  }

  _ensureLoaded() {
    if (this._cache && this._cacheLoadedAt === storage.loadedAt) return;
    this._cache = new Map();
    this._cacheLoadedAt = storage.loadedAt;
    if (!storage.hasTable('team_logos')) return;
    try {
      const rows = storage.all('SELECT team, logo_url FROM team_logos WHERE logo_url IS NOT NULL');
      for (const r of rows) {
        if (r.team) this._cache.set(r.team, r.logo_url);
      }
    } catch (err) {
      console.warn('Failed to load team_logos:', err);
    }
  }

  /** Returns the logo URL for a team, or null if none is on record. */
  get(team) {
    if (!team) return null;
    this._ensureLoaded();
    return this._cache.get(team) || null;
  }
}

export const logoRepository = new LogoRepository();
