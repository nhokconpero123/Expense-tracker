import type Database from 'better-sqlite3';
import type { TransactionRequest, TransactionType } from '../validation/transactions.js';

export interface Transaction extends TransactionRequest {
  id: number;
  categoryName: string;
  createdAt: string;
  updatedAt: string;
}

export function findTransaction(db: Database.Database, id: number): Transaction | undefined {
  return db.prepare(`SELECT t.id, t.type, t.amount_cents AS amountCents, t.category_id AS categoryId,
    c.name AS categoryName, t.transaction_date AS date, t.note,
    t.created_at AS createdAt, t.updated_at AS updatedAt
    FROM transactions t JOIN categories c ON c.id = t.category_id AND c.type = t.type
    WHERE t.id = ?`).get(id) as Transaction | undefined;
}

/** Caller owns the write transaction and all validation. */
export function insertTransaction(db: Database.Database, input: TransactionRequest): number {
  const inserted = db.prepare(`INSERT INTO transactions(type, amount_cents, category_id, transaction_date, note)
    VALUES (@type, @amountCents, @categoryId, @date, @note)`).run(input);
  const id = Number(inserted.lastInsertRowid);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid stored transaction ID');
  return id;
}

/** BigInt mode prevents aggregate precision loss before the service checks safety. */
export function monetaryTotals(db: Database.Database): { type: TransactionType; total: bigint }[] {
  return db.prepare('SELECT type, SUM(amount_cents) AS total FROM transactions GROUP BY type')
    .safeIntegers(true).all() as { type: TransactionType; total: bigint }[];
}
