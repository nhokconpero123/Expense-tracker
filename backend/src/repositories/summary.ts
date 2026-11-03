import type Database from 'better-sqlite3';
import type { DateRange } from '../validation/calendar.js';
import { monetaryTotals } from './transactions.js';

export interface SummaryAggregates {
  totals: { type: 'income' | 'expense'; total: bigint }[];
  categories: { categoryId: bigint; categoryName: string; amountCents: bigint }[];
  days: { date: string; amountCents: bigint }[];
}

/** Caller owns one read snapshot across all three aggregate queries. */
export function readSummaryAggregates(db: Database.Database, range: DateRange): SummaryAggregates {
  const totals = monetaryTotals(db, range);
  const categories = db.prepare(`SELECT c.id AS categoryId, c.name AS categoryName, SUM(t.amount_cents) AS amountCents
    FROM transactions t JOIN categories c ON c.id=t.category_id AND c.type=t.type
    WHERE t.type='expense' AND t.transaction_date >= @startDate AND t.transaction_date <= @endDate
    GROUP BY c.id, c.name HAVING SUM(t.amount_cents) > 0
    ORDER BY amountCents DESC, categoryId ASC`).safeIntegers(true).all(range) as SummaryAggregates['categories'];
  const days = db.prepare(`SELECT transaction_date AS date, SUM(amount_cents) AS amountCents
    FROM transactions WHERE type='expense' AND transaction_date >= @startDate AND transaction_date <= @endDate
    GROUP BY transaction_date ORDER BY transaction_date`).safeIntegers(true).all(range) as SummaryAggregates['days'];
  return { totals, categories, days };
}
