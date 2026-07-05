/**
 * storageAdapter.js
 *
 * The ONLY module in this app allowed to touch sql.js directly.
 * Everything else (repositories, pages, components) calls through here.
 *
 * Responsibilities:
 *  - Boot sql.js (WASM) and load the sports-data SQLite file
 *  - Persist that file to OPFS so it survives reloads
 *  - Introspect the real schema on load (PRAGMA table_info) instead of
 *    assuming the Section 2 column list is fully present
 *  - Reject any write statement against the sports database (Section 13.5)
 *  - Provide a small, safe query surface: run(sql, params) / get(sql, params)
 *
 * This module never imports UI code and is independently testable.
 */

const OPFS_FILENAME = 'plusone_sports.sqlite';
const WRITE_KEYWORDS = /\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|VACUUM|ATTACH|DETACH|CREATE|PRAGMA\s+writable_schema)\b/i;

class SchemaMismatchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchemaMismatchError';
    this.category = 'schema-mismatch';
  }
}

class DatabaseUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DatabaseUnavailableError';
    this.category = 'database-unavailable';
  }
}

class WriteRejectedError extends Error {
  constructor(sql) {
    super(`Write statement rejected against read-only sports database: ${sql.slice(0, 120)}`);
    this.name = 'WriteRejectedError';
    this.category = 'write-rejected';
  }
}

/** Tables this app expects to at least *try* to find (Section 2). Absence of any
 *  one of these is not fatal by itself -- schema drift is expected -- but if the
 *  overlap with what's actually in the file is too small, this almost certainly
 *  isn't a PlusOne export and we should say so clearly rather than rendering an
 *  empty app that looks broken. */
const EXPECTED_CORE_TABLES = ['matches', 'team_stats', 'prediction_log', 'players', 'match_odds'];

export class StorageAdapter {
  constructor() {
    this.SQL = null;
    this.db = null;
    /** @type {Map<string, {name:string,type:string,notnull:number,pk:number}[]>} */
    this.schema = new Map();
    this.rowCounts = new Map();
    this.ready = false;
    this.loadedAt = null;
  }

  /** Step 1 of app init: mount the sql.js WASM runtime. Call once. */
  async init() {
    if (this.SQL) return this.SQL;
    // initSqlJs is attached to window by database/sql-wasm.js (classic script, not a module,
    // per Section 13.2's database/ directory holding the vendored runtime).
    if (typeof window.initSqlJs !== 'function') {
      throw new DatabaseUnavailableError('sql.js runtime not loaded (database/sql-wasm.js missing or failed to parse).');
    }
    this.SQL = await window.initSqlJs({
      locateFile: (file) => `database/${file}`,
    });
    return this.SQL;
  }

  /**
   * Try to restore a previously-imported sports DB from OPFS.
   * Returns true if a database was restored, false if none was found (first run).
   */
  async restoreFromOPFS() {
    try {
      if (!navigator.storage || !navigator.storage.getDirectory) return false;
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(OPFS_FILENAME, { create: false }).catch(() => null);
      if (!handle) return false;
      const file = await handle.getFile();
      const buffer = new Uint8Array(await file.arrayBuffer());
      if (buffer.byteLength === 0) return false;
      await this._openBuffer(buffer);
      return true;
    } catch (err) {
      // OPFS unsupported or corrupted snapshot -- treat as "no prior DB", not fatal.
      console.warn('OPFS restore skipped:', err);
      return false;
    }
  }

  /** Import a user-supplied .sqlite File (drag-drop or <input type=file>). */
  async importFile(file) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    await this._openBuffer(buffer);
    await this.persistToOPFS();
    return this.getSummary();
  }

  async _openBuffer(buffer) {
    await this.init();
    let db;
    try {
      db = new this.SQL.Database(buffer);
    } catch (err) {
      throw new DatabaseUnavailableError(`Could not open the .sqlite file — it may be corrupted. (${err.message})`);
    }
    this.db = db;
    this._introspect();

    const foundCore = EXPECTED_CORE_TABLES.filter((t) => this.schema.has(t));
    if (foundCore.length === 0) {
      this.db = null;
      throw new SchemaMismatchError(
        'None of the expected core tables (matches, team_stats, prediction_log, players, match_odds) were found. This does not look like a PlusOne Analytics export.'
      );
    }
    this.ready = true;
    this.loadedAt = new Date();
  }

  /** Persist the current in-memory DB to OPFS so it survives a reload. */
  async persistToOPFS() {
    if (!this.db) return false;
    if (!navigator.storage || !navigator.storage.getDirectory) return false;
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(OPFS_FILENAME, { create: true });
    const writable = await handle.createWritable();
    const bytes = this.db.export();
    await writable.write(bytes);
    await writable.close();
    return true;
  }

  /** Export the current DB as a downloadable Blob (Section 2's export requirement). */
  exportAsBlob() {
    if (!this.db) throw new DatabaseUnavailableError('No database loaded.');
    const bytes = this.db.export();
    return new Blob([bytes], { type: 'application/x-sqlite3' });
  }

  /** PRAGMA table_info against every table -- the schema-drift defense from Section 2. */
  _introspect() {
    this.schema.clear();
    this.rowCounts.clear();
    const tables = this._rawAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    for (const { name } of tables) {
      const cols = this._rawAll(`PRAGMA table_info("${name}")`).map((c) => ({
        name: c.name,
        type: c.type,
        notnull: c.notnull,
        pk: c.pk,
      }));
      this.schema.set(name, cols);
      try {
        const [{ n } = { n: 0 }] = this._rawAll(`SELECT COUNT(*) AS n FROM "${name}"`);
        this.rowCounts.set(name, n);
      } catch {
        this.rowCounts.set(name, null);
      }
    }
  }

  /** Does this table exist in the loaded file at all? */
  hasTable(name) {
    return this.schema.has(name);
  }

  /** Does this table exist AND have this column? The core "render optional fields
   *  only when both column and value are present" check from Section 2. */
  hasColumn(table, column) {
    const cols = this.schema.get(table);
    if (!cols) return false;
    return cols.some((c) => c.name === column);
  }

  /** Given a wishlist of columns, return only the ones that actually exist on `table`. */
  availableColumns(table, wishlist) {
    const cols = this.schema.get(table);
    if (!cols) return [];
    const have = new Set(cols.map((c) => c.name));
    return wishlist.filter((c) => have.has(c));
  }

  rowCount(table) {
    return this.rowCounts.get(table) ?? 0;
  }

  getSummary() {
    return {
      tables: [...this.schema.keys()].sort(),
      rowCounts: Object.fromEntries(this.rowCounts),
      loadedAt: this.loadedAt,
    };
  }

  /** Read-only query returning all rows as an array of plain objects. */
  all(sql, params = []) {
    this._assertReadOnly(sql);
    return this._rawAll(sql, params);
  }

  /** Read-only query returning the first row (or null). */
  get(sql, params = []) {
    const rows = this.all(sql, params);
    return rows[0] ?? null;
  }

  _assertReadOnly(sql) {
    if (!this.db) throw new DatabaseUnavailableError('No sports database loaded yet.');
    if (WRITE_KEYWORDS.test(sql)) {
      throw new WriteRejectedError(sql);
    }
  }

  _rawAll(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      if (params.length) stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }
}

export { SchemaMismatchError, DatabaseUnavailableError, WriteRejectedError };

// Single shared instance -- repositories import this, never construct their own.
export const storage = new StorageAdapter();
