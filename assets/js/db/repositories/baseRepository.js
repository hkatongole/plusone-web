import { storage } from '../storageAdapter.js';

/**
 * BaseRepository — every sports-data repository extends this.
 * UI code must never import storageAdapter.js or write raw SQL; it calls
 * repository methods, which are the only layer allowed to touch the query layer.
 *
 * Subclasses provide `table` and `defaultOrder`, and may override any method
 * for entity-specific joins/aggregation, but should keep the same method names
 * so pages can treat every repository interchangeably where possible.
 */
export class BaseRepository {
  constructor(table) {
    this.table = table;
  }

  /** Which of the requested columns actually exist in this backup's copy of the table. */
  columns(wishlist) {
    return storage.availableColumns(this.table, wishlist);
  }

  exists() {
    return storage.hasTable(this.table);
  }

  count(whereSql = '1=1', params = []) {
    if (!this.exists()) return 0;
    const row = storage.get(`SELECT COUNT(*) AS n FROM "${this.table}" WHERE ${whereSql}`, params);
    return row ? row.n : 0;
  }

  findById(id) {
    if (!this.exists()) return null;
    return storage.get(`SELECT * FROM "${this.table}" WHERE id = ?`, [id]);
  }

  findAll({ whereSql = '1=1', params = [], orderBy = null, limit = 50, offset = 0 } = {}) {
    if (!this.exists()) return [];
    const order = orderBy || this.defaultOrder || '';
    const orderClause = order ? `ORDER BY ${order}` : '';
    return storage.all(
      `SELECT * FROM "${this.table}" WHERE ${whereSql} ${orderClause} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
  }

  /** Simple LIKE-based search across a set of text columns that actually exist. */
  search(term, searchableColumns, { limit = 25 } = {}) {
    if (!this.exists() || !term) return [];
    const cols = this.columns(searchableColumns);
    if (cols.length === 0) return [];
    const clause = cols.map((c) => `"${c}" LIKE ?`).join(' OR ');
    const params = cols.map(() => `%${term}%`);
    return storage.all(
      `SELECT * FROM "${this.table}" WHERE ${clause} LIMIT ?`,
      [...params, limit]
    );
  }

  paginate({ page = 1, pageSize = 25, whereSql = '1=1', params = [], orderBy = null } = {}) {
    const offset = (page - 1) * pageSize;
    const rows = this.findAll({ whereSql, params, orderBy, limit: pageSize, offset });
    const total = this.count(whereSql, params);
    return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** Most recent freshness timestamp available on this table (Section 4.0's "Data as of"). */
  latestTimestamp(candidateColumns) {
    const cols = this.columns(candidateColumns);
    if (!this.exists() || cols.length === 0) return null;
    const exprs = cols.map((c) => `MAX("${c}")`).join(', ');
    const row = storage.get(`SELECT ${exprs} FROM "${this.table}"`);
    if (!row) return null;
    const values = Object.values(row).filter(Boolean);
    if (values.length === 0) return null;
    return values.sort().reverse()[0];
  }
}
