import type { MonthlySummary } from '../lib/api';
import { isValidDate } from '../lib/date';

/** Synthetic summary responses for tests only; never used by the application. */
export function createAnalyticsFixture(month = '2024-02', expenseCents = 7550): MonthlySummary {
  return {
    month, incomeCents: 20000, expenseCents, balanceCents: 20000 - expenseCents,
    expensesByCategory: expenseCents ? [{ categoryId: 4, categoryName: 'Food', amountCents: expenseCents }] : [],
    dailyExpenses: Array.from({ length: 31 }, (_, index) => ({ date: `${month}-${String(index + 1).padStart(2, '0')}`,
      amountCents: index === 0 ? expenseCents : 0 })).filter(day => isValidDate(day.date)),
  };
}
