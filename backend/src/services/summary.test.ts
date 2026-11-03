import { describe, expect, it } from 'vitest';
import { buildMonthlySummary } from './summary.js';
import type { SummaryAggregates } from '../repositories/summary.js';

const empty = (): SummaryAggregates => ({ totals: [], categories: [], days: [] });

describe('pure monthly summary assembly', () => {
  it.each([['1900-02',28],['2000-02',29],['2024-02',29],['2100-02',28],['2400-02',29],
    ['2026-04',30],['2026-12',31],['1900-01',31],['9999-12',31]] as const)(
    'fills every day of %s without timezone conversion', (month, days) => {
      const result = buildMonthlySummary(month, empty());
      expect(result.dailyExpenses).toHaveLength(days);
      expect(result.dailyExpenses[0]).toEqual({ date: `${month}-01`, amountCents: 0 });
      expect(result.dailyExpenses.at(-1)).toEqual({ date: `${month}-${days}`, amountCents: 0 });
      expect(result.incomeCents).toBe(0); expect(result.expenseCents).toBe(0); expect(result.balanceCents).toBe(0);
    },
  );
  it('preserves the largest safe totals and computes balance using BigInt', () => {
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    const result = buildMonthlySummary('2026-01', {
      totals: [{ type:'income',total:max },{ type:'expense',total:max }],
      categories: [{ categoryId:4n,categoryName:'Food',amountCents:max }],
      days: [{ date:'2026-01-01',amountCents:max }],
    });
    expect(result.incomeCents).toBe(Number.MAX_SAFE_INTEGER); expect(result.expenseCents).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.balanceCents).toBe(0);
  });
  it('supports the largest safe negative balance', () => {
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    expect(buildMonthlySummary('2026-01', { totals:[{type:'expense',total:max}],
      categories:[{categoryId:4n,categoryName:'Food',amountCents:max}],days:[{date:'2026-01-31',amountCents:max}] }).balanceCents)
      .toBe(-Number.MAX_SAFE_INTEGER);
  });
  it.each([-1n, BigInt(Number.MAX_SAFE_INTEGER)+1n])('rejects invalid monetary totals %s', (total) => {
    expect(() => buildMonthlySummary('2026-01', { ...empty(), totals:[{type:'income',total}] })).toThrow('unsafe');
  });
  it('rejects inconsistent category or daily sums rather than serving contradictory data', () => {
    expect(() => buildMonthlySummary('2026-01', { ...empty(), totals:[{type:'expense',total:1n}] })).toThrow('inconsistent');
    expect(() => buildMonthlySummary('2026-01', { totals:[{type:'expense',total:1n}],
      categories:[{categoryId:4n,categoryName:'Food',amountCents:1n}],days:[] })).toThrow('inconsistent');
  });
});
