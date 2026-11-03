import type Database from 'better-sqlite3';
import { budgetExists, deleteBudgetRow, readBudgetRows, upsertBudgetRow } from '../repositories/budgets.js';
import type { BudgetRow } from '../repositories/budgets.js';
import { findCategory } from '../repositories/categories.js';
import { getMonthDateRange } from '../validation/calendar.js';
import type { BudgetParams, BudgetRequest } from '../validation/budgets.js';

export class BudgetCategoryError extends Error {}
export class BudgetNotFoundError extends Error {}

export interface BudgetItem {
  categoryId: number;
  categoryName: string;
  month: string;
  amountCents: number | null;
  spentCents: number;
  remainingCents: number | null;
  utilizationPercent: number | null;
  status: 'no_budget' | 'under' | 'at_limit' | 'over';
}

function safeInteger(value: bigint): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (typeof value !== 'bigint' || value < -max || value > max) throw new Error('Unsafe budget value');
  return Number(value);
}

/** Round nonnegative percentages half-up to one decimal using exact integer arithmetic. */
export function buildBudgetItem(month: string, row: BudgetRow): BudgetItem {
  if (row.spentCents < 0n || row.categoryId < 1n) throw new Error('Invalid budget aggregate');
  const base = { categoryId: safeInteger(row.categoryId), categoryName: row.categoryName,
    month, spentCents: safeInteger(row.spentCents) };
  if (row.amountCents === null) {
    return { ...base, amountCents: null, remainingCents: null, utilizationPercent: null, status: 'no_budget' };
  }
  if (row.amountCents < 1n || row.amountCents > 100000000n) throw new Error('Invalid stored budget amount');
  const tenths = (row.spentCents * 1000n * 2n + row.amountCents) / (row.amountCents * 2n);
  // Conversion is only for the derived display percentage; cents remain exact integers.
  const utilizationPercent = Number(tenths) / 10;
  return { ...base, amountCents: safeInteger(row.amountCents),
    remainingCents: safeInteger(row.amountCents - row.spentCents), utilizationPercent,
    status: row.spentCents < row.amountCents ? 'under' : row.spentCents === row.amountCents ? 'at_limit' : 'over' };
}

function requireExpenseCategory(db: Database.Database, categoryId: number): void {
  if (findCategory(db, categoryId)?.type !== 'expense') throw new BudgetCategoryError();
}

export function getBudgetMonth(db: Database.Database, month: string): { month: string; items: BudgetItem[] } {
  return db.transaction(() => ({ month,
    items: readBudgetRows(db, month, getMonthDateRange(month)).map(row => buildBudgetItem(month, row)),
  })).deferred();
}

export function saveBudget(db: Database.Database, input: BudgetRequest): BudgetItem {
  return db.transaction(() => {
    requireExpenseCategory(db, input.categoryId);
    if (upsertBudgetRow(db, input) !== 1) throw new Error('Budget write failed');
    const row = readBudgetRows(db, input.month, getMonthDateRange(input.month))
      .find(item => item.categoryId === BigInt(input.categoryId));
    if (!row || row.amountCents !== BigInt(input.amountCents)) throw new Error('Budget readback failed');
    return buildBudgetItem(input.month, row);
  }).immediate();
}

export function removeBudget(db: Database.Database, input: BudgetParams): void {
  db.transaction(() => {
    requireExpenseCategory(db, input.categoryId);
    if (!budgetExists(db, input)) throw new BudgetNotFoundError();
    if (deleteBudgetRow(db, input) !== 1 || budgetExists(db, input)) throw new Error('Budget deletion failed');
  }).immediate();
}
