import type Database from 'better-sqlite3';

export const initialMigration = {
  version: 1,
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 9007199254740991),
        name TEXT NOT NULL CHECK (typeof(name) = 'text' AND length(trim(name)) > 0 AND instr(name, char(0)) = 0),
        type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
        UNIQUE(type, name),
        UNIQUE(id, type)
      );
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 9007199254740991),
        type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
        amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents BETWEEN 1 AND 100000000),
        category_id INTEGER NOT NULL,
        transaction_date TEXT NOT NULL CHECK (
          typeof(transaction_date) = 'text' AND length(transaction_date) = 10 AND instr(transaction_date, char(0)) = 0
          AND transaction_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND substr(transaction_date, 1, 4) BETWEEN '1900' AND '9999'
          AND substr(transaction_date, 6, 2) BETWEEN '01' AND '12'
          AND substr(transaction_date, 9, 2) BETWEEN '01' AND '31'
        ),
        note TEXT NOT NULL DEFAULT '' CHECK (typeof(note) = 'text' AND length(note) <= 500 AND instr(note, char(0)) = 0),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY(category_id, type) REFERENCES categories(id, type) ON DELETE RESTRICT
      );
      CREATE INDEX idx_transactions_date ON transactions(transaction_date);
      CREATE INDEX idx_transactions_category_date ON transactions(category_id, transaction_date);
      CREATE TABLE budgets (
        id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 9007199254740991),
        category_id INTEGER NOT NULL,
        category_type TEXT NOT NULL DEFAULT 'expense' CHECK (category_type = 'expense'),
        amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents BETWEEN 1 AND 100000000),
        month TEXT NOT NULL CHECK (
          typeof(month) = 'text' AND length(month) = 7 AND instr(month, char(0)) = 0
          AND month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
          AND substr(month, 1, 4) BETWEEN '1900' AND '9999'
          AND substr(month, 6, 2) BETWEEN '01' AND '12'
        ),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE(category_id, month),
        FOREIGN KEY(category_id, category_type) REFERENCES categories(id, type) ON DELETE RESTRICT
      );
    `);
  },
};
