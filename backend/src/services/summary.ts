import type Database from 'better-sqlite3';
import { readSummaryAggregates } from '../repositories/summary.js';
import type { SummaryAggregates } from '../repositories/summary.js';
import { getMonthDateRange } from '../validation/calendar.js';

export interface MonthlySummary {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  expensesByCategory: { categoryId: number; categoryName: string; amountCents: number }[];
  dailyExpenses: { date: string; amountCents: number }[];
}

function safeNumber(value: bigint, signed = false): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (typeof value !== 'bigint' || value > max || value < (signed ? -max : 0n)) {
    throw new Error('Summary contains an unsafe monetary value');
  }
  return Number(value);
}

/** Pure assembly: integer arithmetic, date strings, and no timezone/clock access. */
export function buildMonthlySummary(month: string, rows: SummaryAggregates): MonthlySummary {
  const range = getMonthDateRange(month);
  const income = rows.totals.find((row) => row.type === 'income')?.total ?? 0n;
  const expense = rows.totals.find((row) => row.type === 'expense')?.total ?? 0n;
  const incomeCents = safeNumber(income);
  const expenseCents = safeNumber(expense);
  const expensesByCategory = rows.categories.map((row) => ({
    categoryId: safeNumber(row.categoryId), categoryName: row.categoryName, amountCents: safeNumber(row.amountCents),
  }));
  const dayTotals = new Map(rows.days.map((row) => [row.date, row.amountCents]));
  const dailyExpenses = Array.from({ length: Number(range.endDate.slice(8, 10)) }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`;
    return { date, amountCents: safeNumber(dayTotals.get(date) ?? 0n) };
  });
  const categorySum = expensesByCategory.reduce((sum, row) => sum + BigInt(row.amountCents), 0n);
  const dailySum = dailyExpenses.reduce((sum, row) => sum + BigInt(row.amountCents), 0n);
  if (categorySum !== expense || dailySum !== expense) throw new Error('Summary aggregates are inconsistent');
  return { month, incomeCents, expenseCents, balanceCents: safeNumber(income - expense, true), expensesByCategory, dailyExpenses };
}

export function getMonthlySummary(db: Database.Database, month: string): MonthlySummary {
  const range = getMonthDateRange(month);
  return db.transaction(() => buildMonthlySummary(month, readSummaryAggregates(db, range))).deferred();
}
