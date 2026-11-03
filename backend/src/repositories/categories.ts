import type Database from 'better-sqlite3';
import type { TransactionType } from '../validation/transactions.js';

export interface Category { id: number; name: string; type: TransactionType }

export function listCategories(db: Database.Database, type?: TransactionType): Category[] {
  if (type !== undefined) {
    return db.prepare('SELECT id, name, type FROM categories WHERE type = ? ORDER BY type, name').all(type) as Category[];
  }
  return db.prepare('SELECT id, name, type FROM categories ORDER BY type, name').all() as Category[];
}

export function findCategory(db: Database.Database, id: number): Category | undefined {
  return db.prepare('SELECT id, name, type FROM categories WHERE id = ?').get(id) as Category | undefined;
}
