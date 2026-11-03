import type Database from 'better-sqlite3';
import { findCategory } from '../repositories/categories.js';
import { findTransaction, insertTransaction, monetaryTotals } from '../repositories/transactions.js';
import type { Transaction } from '../repositories/transactions.js';
import type { TransactionRequest } from '../validation/transactions.js';

export class TransactionCategoryError extends Error {
  constructor() { super('Category does not exist or does not match transaction type'); }
}
export class AggregateOverflowError extends Error {
  constructor() { super('Transaction would exceed safe monetary totals'); }
}

/** Accept validated input; existence, insertion, aggregate guard and readback are atomic. */
export function createTransaction(db: Database.Database, input: TransactionRequest): Transaction {
  return db.transaction(() => {
    const category = findCategory(db, input.categoryId);
    if (!category || category.type !== input.type) throw new TransactionCategoryError();
    const id = insertTransaction(db, input);
    // Positive per-row cents mean every date/category subset is bounded by its type total.
    // Both type totals <= MAX_SAFE_INTEGER also bound any income-minus-expense balance.
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    if (monetaryTotals(db).some(({ total }) => total < 0n || total > max)) {
      throw new AggregateOverflowError();
    }
    const result = findTransaction(db, id);
    if (!result) throw new Error('Created transaction could not be read');
    return result;
  }).immediate();
}
