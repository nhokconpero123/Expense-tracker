import type Database from 'better-sqlite3';
import { migrate, MIGRATIONS } from './migrate.js';
import { CATEGORY_CATALOG, seedCategories } from './seed.js';

/** Migrate and seed as one atomic operation, including nested migration transactions. */
export function initializeDatabase(db: Database.Database): void {
  db.transaction(() => {
    migrate(db);
    seedCategories(db);
  }).immediate();
}

/** Read-only readiness check; never initializes, reseeds, or exposes database errors. */
export function isDatabaseReady(db: Database.Database): boolean {
  try {
    if (!db.open || db.pragma('foreign_keys', { simple: true }) !== 1) return false;
    const history = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[];
    if (history.length !== MIGRATIONS.length || history.some((row, index) => row.version !== MIGRATIONS[index]?.version)) return false;
    db.prepare('SELECT id, type, amount_cents, category_id, transaction_date, note, created_at, updated_at FROM transactions LIMIT 0').all();
    db.prepare('SELECT id, category_id, category_type, amount_cents, month, created_at, updated_at FROM budgets LIMIT 0').all();
    const findCategory = db.prepare('SELECT 1 FROM categories WHERE name = ? AND type = ?');
    return CATEGORY_CATALOG.every(([name, type]) => findCategory.get(name, type) !== undefined);
  } catch {
    return false;
  }
}
