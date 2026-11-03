import type Database from 'better-sqlite3';
import type { DateRange } from '../validation/calendar.js';
import type { BudgetRequest, BudgetParams } from '../validation/budgets.js';

export interface BudgetRow {
  categoryId: bigint;
  categoryName: string;
  amountCents: bigint | null;
  spentCents: bigint;
}

/** One statement provides a consistent view of limits and monthly expense spending. */
export function readBudgetRows(db: Database.Database, month: string, range: DateRange): BudgetRow[] {
  return db.prepare(`SELECT c.id AS categoryId, c.name AS categoryName, b.amount_cents AS amountCents,
    COALESCE(s.spent, 0) AS spentCents FROM categories c
    LEFT JOIN budgets b ON b.category_id=c.id AND b.month=@month
    LEFT JOIN (SELECT category_id, SUM(amount_cents) AS spent FROM transactions
      WHERE type='expense' AND transaction_date >= @startDate AND transaction_date <= @endDate
      GROUP BY category_id) s ON s.category_id=c.id
    WHERE c.type='expense' ORDER BY c.name, c.id`).safeIntegers(true)
    .all({ month, ...range }) as BudgetRow[];
}

export function upsertBudgetRow(db: Database.Database, input: BudgetRequest): number {
  return db.prepare(`INSERT INTO budgets(category_id, month, amount_cents)
    VALUES (@categoryId, @month, @amountCents)
    ON CONFLICT(category_id, month) DO UPDATE SET amount_cents=excluded.amount_cents,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).run(input).changes;
}

export function deleteBudgetRow(db: Database.Database, input: BudgetParams): number {
  return db.prepare('DELETE FROM budgets WHERE category_id=@categoryId AND month=@month').run(input).changes;
}

export function budgetExists(db: Database.Database, input: BudgetParams): boolean {
  return db.prepare('SELECT 1 FROM budgets WHERE category_id=@categoryId AND month=@month').get(input) !== undefined;
}
