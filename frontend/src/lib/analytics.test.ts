import { afterEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_ANALYTICS_VIEW, analyticsViewReducer, assertAnalyticsSummary, categoryColor, dailyAmountTicks,
  fetchAnalyticsSummary, formatAxisCents, formatDayTick, selectDailyTicks } from './analytics';
import { createAnalyticsFixture } from '../test/analyticsFixtures';
import { SummaryLoader } from './summaryLoader';

afterEach(() => vi.unstubAllGlobals());
describe('analytics inputs use the existing summary contract', () => {
  it.each([['2024-02', 29], ['2026-02', 28], ['2100-02', 28], ['2000-02', 29], ['2026-11', 30], ['9999-12', 31]] as const)(
    'preserves the complete server series for %s (%i days)', async (month, count) => {
      const summary = createAnalyticsFixture(month);
      const daily = summary.dailyExpenses;
      const categories = summary.expensesByCategory;
      const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ data: summary }) }));
      vi.stubGlobal('fetch', fetch);
      const signal = new AbortController().signal;
      const result = await fetchAnalyticsSummary(month, signal);
      expect(fetch).toHaveBeenCalledWith(`/api/summary?month=${month}`, expect.objectContaining({ method: 'GET', signal }));
      expect(result).toBe(summary); expect(result.dailyExpenses).toBe(daily); expect(result.expensesByCategory).toBe(categories);
      expect(result.dailyExpenses).toHaveLength(count);
      expect(result.dailyExpenses.at(-1)).toEqual({ date: `${month}-${count}`, amountCents: 0 });
      expect(result.expenseCents).toBe(7550);
    });
  it('accepts all-zero spending and safe-integer monetary extrema', () => {
    expect(() => assertAnalyticsSummary(createAnalyticsFixture('2024-02', 0), '2024-02')).not.toThrow();
    const summary = createAnalyticsFixture('2024-02', Number.MAX_SAFE_INTEGER);
    summary.incomeCents = 0; summary.balanceCents = -Number.MAX_SAFE_INTEGER;
    expect(() => assertAnalyticsSummary(summary, '2024-02')).not.toThrow();
  });
  it.each([
    { month: '2024-03' }, { expenseCents: 1.5 }, { expenseCents: Number.MAX_SAFE_INTEGER + 1 },
    { incomeCents: -1 }, { balanceCents: NaN }, { dailyExpenses: [] },
    { dailyExpenses: createAnalyticsFixture().dailyExpenses.slice(0, 28) },
    { dailyExpenses: [...createAnalyticsFixture().dailyExpenses, { date: '2024-02-30', amountCents: 0 }] },
    { expensesByCategory: [{ categoryId: 4, categoryName: 'Food', amountCents: 0 }] },
    { expensesByCategory: [{ categoryId: 4, categoryName: 'Food', amountCents: -1 }] },
    { expensesByCategory: [{ categoryId: 4, categoryName: 'Food', amountCents: 1 }, { categoryId: 4, categoryName: 'Food', amountCents: 2 }] },
  ])('rejects malformed summary fields without filling or repairing them: %j', patch => {
    expect(() => assertAnalyticsSummary({ ...createAnalyticsFixture(), ...patch }, '2024-02')).toThrow('Invalid analytics summary');
  });
  it('rejects out-of-order dates and unsafe daily amounts', () => {
    const summary = createAnalyticsFixture(); summary.dailyExpenses.reverse();
    expect(() => assertAnalyticsSummary(summary, summary.month)).toThrow();
    summary.dailyExpenses.reverse(); summary.dailyExpenses[0]!.amountCents = Number.MAX_SAFE_INTEGER + 1;
    expect(() => assertAnalyticsSummary(summary, summary.month)).toThrow();
  });
  it('preserves API errors instead of manufacturing an empty dataset', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Unavailable' } }), { status: 503 })));
    await expect(fetchAnalyticsSummary('2024-02')).rejects.toMatchObject({ status: 503, code: 'DATABASE_UNAVAILABLE', message: 'Unavailable' });
  });
  it('loads real-contract data, evicts it after failed refresh, and retries GET successfully', async () => {
    const summary = createAnalyticsFixture();
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: summary })))
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: summary })));
    vi.stubGlobal('fetch', fetch);
    const loader = new SummaryLoader(fetchAnalyticsSummary);
    await loader.load(summary.month); expect(loader.getState().summary).toEqual(summary);
    const refreshing = loader.load(summary.month);
    expect(loader.getState()).toMatchObject({ summary: null, isLoading: true, error: null });
    await refreshing;
    expect(loader.getState()).toMatchObject({ summary: null, isLoading: false, error: 'Network unavailable' });
    await loader.load(summary.month);
    expect(loader.getState()).toEqual({ summary, isLoading: false, error: null });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.every(call => call[0] === '/api/summary?month=2024-02' && call[1].method === 'GET')).toBe(true);
  });
});

describe('responsive chart labels', () => {
  it.each(['2024-02', '2026-02', '2026-11', '2026-12'])('selects four spaced labels with both boundaries for %s', month => {
    const daily = createAnalyticsFixture(month).dailyExpenses;
    const ticks = selectDailyTicks(daily);
    expect(ticks).toHaveLength(4); expect(new Set(ticks).size).toBe(4);
    expect(ticks[0]).toBe(daily[0]!.date); expect(ticks.at(-1)).toBe(daily.at(-1)!.date);
    expect(ticks).toEqual([...ticks].sort()); expect(daily).toHaveLength(month === '2024-02' ? 29 : month === '2026-02' ? 28 : month === '2026-11' ? 30 : 31);
  });
  it('handles empty and short tick series without adding dates', () => {
    expect(selectDailyTicks([])).toEqual([]);
    const daily = createAnalyticsFixture().dailyExpenses.slice(0, 2);
    expect(selectDailyTicks(daily)).toEqual(daily.map(day => day.date));
  });
  it.each([['2024-02-01', '1'], ['2024-02-29', '29'], ['2026-02-29', ''], ['bad', '']])('formats date tick %s', (date, label) => {
    expect(formatDayTick(date)).toBe(label);
  });
  it.each([[0, '$0.00'], [1, '$0.01'], [7550, '$75.50'], [100000, '$1K'], [123450, '$1.2K'],
    [100000000, '$1M'], [100000000000, '$1B'], [100000000000000, '$1T'], [Number.MAX_SAFE_INTEGER, '$90.1T']])('formats %i cents for compact axes', (cents, label) => {
    expect(formatAxisCents(cents as number)).toBe(label);
  });
  it('does not send fractional or unsafe money ticks to the currency formatter', () => {
    const daily = createAnalyticsFixture('2024-02', Number.MAX_SAFE_INTEGER).dailyExpenses;
    const ticks = dailyAmountTicks(daily);
    expect(ticks.every(Number.isSafeInteger)).toBe(true);
    expect(ticks).toEqual([0, 4503599627370495, Number.MAX_SAFE_INTEGER]);
    expect(dailyAmountTicks([{ date: '2024-02-01', amountCents: 1 }])).toEqual([0, 1]);
    expect(formatAxisCents(NaN)).toBe(''); expect(formatAxisCents(1.5)).toBe('');
  });
  it('keeps category colors stable as server ranking changes', () => {
    const before = new Map([4, 8].map(id => [id, categoryColor(id)]));
    for (const id of [8, 4]) expect(categoryColor(id)).toBe(before.get(id));
  });
});

describe('analytics view and category selection', () => {
  it('switches views without losing selected category details', () => {
    const selected = analyticsViewReducer(INITIAL_ANALYTICS_VIEW, { type: 'select', categoryId: 4 });
    const table = analyticsViewReducer(selected, { type: 'view', view: 'table' });
    expect(table).toEqual({ ...INITIAL_ANALYTICS_VIEW, view: 'table', selectedCategoryId: 4 });
    expect(analyticsViewReducer(table, { type: 'view', view: 'chart' })).toEqual(selected);
    expect(INITIAL_ANALYTICS_VIEW).toEqual({ view: 'chart', selectedCategoryId: null, dailyTableExpanded: false });
  });
  it('selects by identifier and clears selection without changing the view', () => {
    const selected = analyticsViewReducer({ ...INITIAL_ANALYTICS_VIEW, view: 'table', selectedCategoryId: 4 }, { type: 'select', categoryId: 5 });
    expect(selected).toEqual({ ...INITIAL_ANALYTICS_VIEW, view: 'table', selectedCategoryId: 5 });
    expect(analyticsViewReducer(selected, { type: 'clear' })).toEqual({ ...INITIAL_ANALYTICS_VIEW, view: 'table', selectedCategoryId: null });
  });
  it('toggles daily disclosure independently of chart/table and category selection', () => {
    const initial = { ...INITIAL_ANALYTICS_VIEW, view: 'table' as const, selectedCategoryId: 4 };
    const expanded = analyticsViewReducer(initial, { type: 'toggle-days' });
    expect(expanded).toEqual({ ...initial, dailyTableExpanded: true });
    const chart = analyticsViewReducer(expanded, { type: 'view', view: 'chart' });
    expect(chart.dailyTableExpanded).toBe(true);
    expect(analyticsViewReducer(chart, { type: 'clear' }).dailyTableExpanded).toBe(true);
    expect(analyticsViewReducer(expanded, { type: 'toggle-days' })).toEqual(initial);
    expect(INITIAL_ANALYTICS_VIEW.dailyTableExpanded).toBe(false);
  });
});
