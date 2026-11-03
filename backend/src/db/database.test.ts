import { existsSync, linkSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabaseFile, DEFAULT_DATABASE_PATH, openDatabase } from './connection.js';
import { initializeDatabase, isDatabaseReady } from './initialize.js';
import { migrate, MIGRATIONS } from './migrate.js';
import { CATEGORY_CATALOG, seedCategories } from './seed.js';

let db: Database.Database;
beforeEach(() => { db = openDatabase({ mode: 'test' }); initializeDatabase(db); });
afterEach(() => { if (db.open) db.close(); vi.unstubAllEnvs(); });

function category(type: 'income' | 'expense'): number {
  return (db.prepare('SELECT id FROM categories WHERE type = ? ORDER BY id LIMIT 1').get(type) as { id: number }).id;
}
function transaction(overrides: Record<string, unknown> = {}) {
  const row = { type: 'expense', amount: 1, category: category('expense'), date: '2024-02-29', note: '', ...overrides };
  return db.prepare(`INSERT INTO transactions(type, amount_cents, category_id, transaction_date, note)
    VALUES (@type, @amount, @category, @date, @note)`).run(row);
}
function budget(overrides: Record<string, unknown> = {}) {
  const row = { category: category('expense'), type: 'expense', amount: 1, month: '2026-01', ...overrides };
  return db.prepare(`INSERT INTO budgets(category_id, category_type, amount_cents, month)
    VALUES (@category, @type, @amount, @month)`).run(row);
}

describe('schema and catalog initialization', () => {
  it('creates all four required tables and version metadata', () => {
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all())
      .toEqual(['budgets', 'categories', 'schema_migrations', 'transactions'].map((name) => ({ name })));
    expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }]);
    expect(isDatabaseReady(db)).toBe(true);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });
  it('seeds exactly the documented catalog without transactions or budgets', () => {
    expect(db.prepare('SELECT name, type FROM categories ORDER BY id').all())
      .toEqual(CATEGORY_CATALOG.map(([name, type]) => ({ name, type })));
    expect(db.prepare('SELECT * FROM transactions').all()).toEqual([]);
    expect(db.prepare('SELECT * FROM budgets').all()).toEqual([]);
  });
  it('repeated initialization preserves IDs, history, notes, budgets and timestamps', () => {
    transaction({ note: 'Keep this record' }); budget();
    const before = ['categories', 'transactions', 'budgets', 'schema_migrations']
      .map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    initializeDatabase(db); initializeDatabase(db); seedCategories(db);
    expect(['categories', 'transactions', 'budgets', 'schema_migrations']
      .map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).toEqual(before);
  });
  it('restores only missing catalog entries without deleting extra existing categories', () => {
    db.prepare("DELETE FROM categories WHERE name = 'Other Income'").run();
    db.prepare("INSERT INTO categories(name, type) VALUES ('Existing category', 'expense')").run();
    seedCategories(db);
    expect(db.prepare('SELECT count(*) AS n FROM categories').get()).toEqual({ n: 12 });
    expect(db.prepare("SELECT name FROM categories WHERE name = 'Existing category'").get()).toBeDefined();
  });
  it('creates the two transaction indexes and the unique budget index', () => {
    const names = (db.pragma('index_list(transactions)') as { name: string }[]).map((row) => row.name);
    expect(names).toContain('idx_transactions_date');
    expect(names).toContain('idx_transactions_category_date');
    expect((db.pragma('index_list(budgets)') as { unique: number }[]).some((row) => row.unique === 1)).toBe(true);
  });
});

describe('category and relationship constraints', () => {
  it.each(['income', 'expense'] as const)('accepts matching %s transactions', (type) => {
    expect(() => transaction({ type, category: category(type) })).not.toThrow();
  });
  it.each(['income', 'expense'] as const)('rejects mismatched %s transactions', (type) => {
    expect(() => transaction({ type, category: category(type === 'income' ? 'expense' : 'income') })).toThrow();
  });
  it('rejects nonexistent categories for both child tables', () => {
    expect(() => transaction({ category: 999999 })).toThrow();
    expect(() => budget({ category: 999999 })).toThrow();
  });
  it('allows expense budgets and rejects both ways to reference income', () => {
    expect(() => budget()).not.toThrow();
    expect(() => budget({ category: category('income') })).toThrow();
    expect(() => budget({ category: category('income'), type: 'income' })).toThrow();
  });
  it.each(['transfer', '', 'Income'])('rejects invalid category and transaction type %j', (type) => {
    expect(() => db.prepare('INSERT INTO categories(name, type) VALUES (?, ?)').run('Invalid', type)).toThrow();
    expect(() => transaction({ type })).toThrow();
  });
  it.each(['', '   ', 'Bad\0Name'])('rejects invalid category name %j', (name) => {
    expect(() => db.prepare("INSERT INTO categories(name, type) VALUES (?, 'expense')").run(name)).toThrow();
  });
  it('enforces category uniqueness', () => {
    expect(() => db.prepare("INSERT INTO categories(name, type) VALUES ('Salary', 'income')").run()).toThrow();
  });
  it('restricts category deletion and type changes with existing children', () => {
    transaction(); budget();
    expect(() => db.prepare('DELETE FROM categories WHERE id = ?').run(category('expense'))).toThrow();
    expect(() => db.prepare("UPDATE categories SET type = 'income' WHERE id = ?").run(category('expense'))).toThrow();
  });
  it('enforces category/month budget uniqueness while allowing different months/categories', () => {
    budget();
    expect(() => budget()).toThrow();
    expect(() => budget({ month: '2026-02' })).not.toThrow();
    const other = (db.prepare("SELECT id FROM categories WHERE name = 'Housing'").get() as { id: number }).id;
    expect(() => budget({ category: other })).not.toThrow();
  });
});

describe('amount, note and calendar shape constraints', () => {
  it.each([1, 100_000_000])('accepts amount boundary %i in both tables', (amount) => {
    expect(() => transaction({ amount })).not.toThrow();
    expect(() => budget({ amount })).not.toThrow();
  });
  it.each([0, -1, 1.5, 100_000_001, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, null, 'invalid', Buffer.from('1')])(
    'rejects invalid stored amount %j in both tables', (amount) => {
      expect(() => transaction({ amount })).toThrow();
      expect(() => budget({ amount })).toThrow();
    },
  );
  it('accepts 500-character notes and rejects long/null/NUL notes', () => {
    expect(() => transaction({ note: 'x'.repeat(500) })).not.toThrow();
    for (const note of ['x'.repeat(501), null, 'short\0' + 'x'.repeat(600)]) {
      expect(() => transaction({ note })).toThrow();
    }
  });
  it.each(['2026-1-01', '2026-01-1', '2026/01/01', '1899-12-31', '10000-01-01',
    '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-01-01\0bad', null])(
    'rejects invalid stored date shape/range %j', (date) => {
      expect(() => transaction({ date })).toThrow();
    },
  );
  it.each(['2026-1', '2026/01', '1899-12', '10000-01', '2026-00', '2026-13', '2026-01\0bad', null])(
    'rejects invalid stored month %j', (month) => { expect(() => budget({ month })).toThrow(); },
  );
  it('supports final December 9999 and UTC timestamp defaults', () => {
    transaction({ date: '9999-12-31' }); budget({ month: '9999-12' });
    const row = db.prepare('SELECT created_at, updated_at FROM transactions').get() as { created_at: string; updated_at: string };
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(row.updated_at).toBe(row.created_at);
  });
  it('keeps actual month-day validity in the backend validator layer', () => {
    // Schema intentionally checks shape/ranges only, as documented in architecture.
    expect(() => transaction({ date: '2026-02-31' })).not.toThrow();
  });
});

describe('transactional migrations and seeding', () => {
  it('rolls back pending DDL, data changes, and history on migration failure', () => {
    transaction({ note: 'Preserve' });
    const before = db.prepare('SELECT * FROM transactions').all();
    expect(() => migrate(db, [...MIGRATIONS, { version: 2, up(database) {
      database.exec("CREATE TABLE rollback_probe(id INTEGER); UPDATE transactions SET note = 'Changed';");
      throw new Error('Controlled migration failure');
    } }])).toThrow('Controlled migration failure');
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'rollback_probe'").get()).toBeUndefined();
    expect(db.prepare('SELECT * FROM transactions').all()).toEqual(before);
    expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }]);
  });
  it('rolls back the entire initial migration batch including history bootstrap', () => {
    const fresh = openDatabase({ mode: 'test' });
    try {
      expect(() => migrate(fresh, [...MIGRATIONS, { version: 2, up() { throw new Error('Fail'); } }])).toThrow('Fail');
      expect(fresh.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([]);
    } finally { fresh.close(); }
  });
  it('sorts migration versions and does not rerun applied versions', () => {
    const extra = { version: 2, up(database: Database.Database) { database.exec('CREATE TABLE next_version(id INTEGER)'); } };
    migrate(db, [extra, ...MIGRATIONS]); migrate(db, [extra, ...MIGRATIONS]);
    expect(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 1 }, { version: 2 }]);
  });
  it('rejects duplicate/gapped versions and incompatible future history', () => {
    expect(() => migrate(db, [...MIGRATIONS, ...MIGRATIONS])).toThrow();
    expect(() => migrate(db, [...MIGRATIONS, { version: 3, up() {} }])).toThrow();
    db.prepare('INSERT INTO schema_migrations(version) VALUES (2)').run();
    expect(() => initializeDatabase(db)).toThrow('incompatible');
  });
  it('does not adopt, drop, or overwrite preexisting unversioned tables', () => {
    const unmanaged = openDatabase({ mode: 'test' });
    try {
      unmanaged.exec("CREATE TABLE categories(note TEXT); INSERT INTO categories VALUES ('Preserve');");
      expect(() => initializeDatabase(unmanaged)).toThrow();
      expect(unmanaged.prepare('SELECT * FROM categories').all()).toEqual([{ note: 'Preserve' }]);
      expect(unmanaged.prepare("SELECT name FROM sqlite_master WHERE name = 'schema_migrations'").get()).toBeUndefined();
    } finally { unmanaged.close(); }
  });
  it('rolls back seed inserts if any catalog insert fails', () => {
    const fresh = openDatabase({ mode: 'test' });
    try {
      migrate(fresh);
      fresh.exec(`CREATE TRIGGER reject_food BEFORE INSERT ON categories WHEN NEW.name = 'Food'
        BEGIN SELECT RAISE(ABORT, 'Controlled seed failure'); END;`);
      expect(() => seedCategories(fresh)).toThrow('Controlled seed failure');
      expect(fresh.prepare('SELECT * FROM categories').all()).toEqual([]);
    } finally { fresh.close(); }
  });
});

describe('file persistence and path isolation', () => {
  it('persists category IDs, transactions, budgets and history after closing/reopening', () => {
    const file = createTestDatabaseFile();
    let connection = openDatabase({ mode: 'test', filename: file.filename });
    try {
      initializeDatabase(connection);
      const id = (connection.prepare("SELECT id FROM categories WHERE name = 'Food'").get() as { id: number }).id;
      connection.prepare("INSERT INTO transactions(type, amount_cents, category_id, transaction_date, note) VALUES ('expense',1234,?,'2026-01-01','Persist')").run(id);
      connection.prepare("INSERT INTO budgets(category_id, amount_cents, month) VALUES (?,5000,'2026-01')").run(id);
      const before = ['categories', 'transactions', 'budgets', 'schema_migrations'].map((table) => connection.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
      connection.close();
      connection = openDatabase({ mode: 'test', filename: file.filename });
      initializeDatabase(connection);
      expect(connection.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(['categories', 'transactions', 'budgets', 'schema_migrations'].map((table) => connection.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).toEqual(before);
    } finally { if (connection.open) connection.close(); file.dispose(); }
  });
  it('blocks development mode/default connections under the test runtime', () => {
    expect(() => openDatabase()).toThrow('forbidden in tests');
    expect(() => openDatabase({ mode: 'development', filename: DEFAULT_DATABASE_PATH })).toThrow('forbidden in tests');
  });
  it('rejects development paths and arbitrary filenames in test mode before opening', () => {
    expect(() => openDatabase({ mode: 'test', filename: DEFAULT_DATABASE_PATH })).toThrow('must be allocated');
    expect(() => openDatabase({ mode: 'test', filename: '../data/expense-tracker.sqlite' })).toThrow('must be allocated');
    expect(() => openDatabase({ mode: 'test', filename: 'file:development.sqlite' })).toThrow('must be allocated');
  });
  it('ignores DATABASE_PATH in test mode and never touches a sentinel file', () => {
    const file = createTestDatabaseFile();
    const sentinel = join(dirname(file.filename), 'do-not-touch.sqlite');
    try {
      writeFileSync(sentinel, 'Unrelated existing file');
      vi.stubEnv('DATABASE_PATH', sentinel);
      const test = openDatabase({ mode: 'test' });
      try { expect(test.memory).toBe(true); } finally { test.close(); }
      expect(() => openDatabase({ mode: 'test', filename: sentinel })).toThrow('must be allocated');
      expect(readFileSync(sentinel, 'utf8')).toBe('Unrelated existing file');
    } finally { unlinkSync(sentinel); file.dispose(); }
  });
  it('rejects hardlinked registered files without opening the alias target', () => {
    const file = createTestDatabaseFile();
    const alias = join(dirname(file.filename), 'alias.sqlite');
    try {
      const connection = openDatabase({ mode: 'test', filename: file.filename }); connection.close();
      linkSync(file.filename, alias);
      expect(() => openDatabase({ mode: 'test', filename: file.filename })).toThrow('private regular file');
    } finally { if (existsSync(alias)) unlinkSync(alias); file.dispose(); }
  });
  it('uses distinct private file paths for independent test cases', () => {
    const first = createTestDatabaseFile(); const second = createTestDatabaseFile();
    try { expect(first.filename).not.toBe(second.filename); }
    finally { first.dispose(); second.dispose(); }
  });
});
