import type Database from 'better-sqlite3';

export const CATEGORY_CATALOG = [
  ['Salary', 'income'], ['Freelance', 'income'], ['Other Income', 'income'],
  ['Food', 'expense'], ['Housing', 'expense'], ['Transport', 'expense'],
  ['Utilities', 'expense'], ['Entertainment', 'expense'], ['Health', 'expense'],
  ['Shopping', 'expense'], ['Other Expense', 'expense'],
] as const;

/** Stable (type, name) keys: insert missing catalog entries, never replace any rows. */
export function seedCategories(db: Database.Database): void {
  db.transaction(() => {
    const insert = db.prepare('INSERT INTO categories(name, type) VALUES (?, ?) ON CONFLICT(type, name) DO NOTHING');
    for (const [name, type] of CATEGORY_CATALOG) insert.run(name, type);
  }).immediate();
}
