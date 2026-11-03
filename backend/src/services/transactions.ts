import type Database from 'better-sqlite3';
import { findCategory } from '../repositories/categories.js';
import { deleteTransactionRow, findTransaction, insertTransaction, listTransactions, monetaryTotals, updateTransactionRow } from '../repositories/transactions.js';
import type { Transaction, TransactionPage } from '../repositories/transactions.js';
import type { TransactionRequest } from '../validation/transactions.js';
import type { TransactionQuery } from '../validation/queries.js';
import { getMonthDateRange } from '../validation/calendar.js';

export class TransactionCategoryError extends Error {
  constructor() { super('Category does not exist or does not match transaction type'); }
}
export class AggregateOverflowError extends Error {
  constructor() { super('Transaction would exceed safe monetary totals'); }
}
export class TransactionNotFoundError extends Error {
  constructor() { super('Transaction not found'); }
}

function assertSafeTotals(db: Database.Database, months: readonly string[] = []): void {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  for (const month of new Set(months)) {
    if (monetaryTotals(db, getMonthDateRange(month)).some(({ total }) => total < 0n || total > max)) {
      throw new AggregateOverflowError();
    }
  }
  if (monetaryTotals(db).some(({ total }) => total < 0n || total > max)) throw new AggregateOverflowError();
}

/** Accept validated input; existence, insertion, aggregate guard and readback are atomic. */
export function createTransaction(db: Database.Database, input: TransactionRequest): Transaction {
  return db.transaction(() => {
    const category = findCategory(db, input.categoryId);
    if (!category || category.type !== input.type) throw new TransactionCategoryError();
    const id = insertTransaction(db, input);
    // Positive per-row cents mean every date/category subset is bounded by its type total.
    // Both type totals <= MAX_SAFE_INTEGER also bound any income-minus-expense balance.
    assertSafeTotals(db);
    const result = findTransaction(db, id);
    if (!result) throw new Error('Created transaction could not be read');
    return result;
  }).immediate();
}

export function replaceTransaction(db: Database.Database, id: number, input: TransactionRequest): Transaction {
  return db.transaction(() => {
    const previous = findTransaction(db, id);
    if (!previous) throw new TransactionNotFoundError();
    const category = findCategory(db, input.categoryId);
    if (!category || category.type !== input.type) throw new TransactionCategoryError();
    if (updateTransactionRow(db, id, input) !== 1) throw new Error('Transaction replacement failed');
    assertSafeTotals(db, [previous.date.slice(0, 7), input.date.slice(0, 7)]);
    const result = findTransaction(db, id);
    if (!result) throw new Error('Updated transaction could not be read');
    return result;
  }).immediate();
}

export function deleteTransaction(db: Database.Database, id: number): void {
  db.transaction(() => {
    if (!findTransaction(db, id)) throw new TransactionNotFoundError();
    if (deleteTransactionRow(db, id) !== 1 || findTransaction(db, id)) {
      throw new Error('Transaction deletion failed');
    }
  }).immediate();
}

/** Deferred transaction: category validation, COUNT and page share one read snapshot. */
export function searchTransactions(db: Database.Database, query: TransactionQuery): TransactionPage {
  return db.transaction(() => {
    if (query.categoryId !== undefined && !findCategory(db, query.categoryId)) {
      throw new TransactionCategoryError();
    }
    // Existing but type-incompatible categories naturally produce no AND matches.
    return listTransactions(db, query);
  }).deferred();
}
