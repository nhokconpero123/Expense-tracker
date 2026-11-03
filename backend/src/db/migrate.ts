import type Database from 'better-sqlite3';
import { initialMigration } from './migrations/001_initial.js';

export interface Migration { version: number; up: (db: Database.Database) => void }
export const MIGRATIONS: readonly Migration[] = [initialMigration];

/** All pending versions and history writes commit together; never reset existing tables. */
export function migrate(db: Database.Database, migrations: readonly Migration[] = MIGRATIONS): void {
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  ordered.forEach((migration, index) => {
    if (!Number.isSafeInteger(migration.version) || migration.version !== index + 1) {
      throw new Error('Migration versions must be contiguous positive integers');
    }
  });
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`);
    const applied = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[];
    if (applied.some((row, index) => row.version !== ordered[index]?.version)) {
      throw new Error('Database migration history is incompatible');
    }
    const record = db.prepare('INSERT INTO schema_migrations(version) VALUES (?)');
    for (const migration of ordered.slice(applied.length)) {
      migration.up(db);
      record.run(migration.version);
    }
  }).immediate();
}
