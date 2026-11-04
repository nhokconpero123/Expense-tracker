import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MonthlySummary } from '../lib/api';
import { fetchAnalyticsSummary } from '../lib/analytics';
import { MonthProvider } from '../context/MonthContext';
import { createAnalyticsFixture } from '../test/analyticsFixtures';
import { Analytics } from './Analytics';
import { useMonthlySummary } from '../hooks/useMonthlySummary';
import * as monthContext from '../context/MonthContext';
import { isValidElement } from 'react';

const hook = vi.hoisted(() => ({ state: {
  summary: null as MonthlySummary | null, isLoading: true, error: null as string | null, refresh: vi.fn(),
} }));
vi.mock('../hooks/useMonthlySummary', () => ({ useMonthlySummary: vi.fn(() => hook.state) }));
beforeEach(() => {
  hook.state = { summary: null, isLoading: true, error: null, refresh: vi.fn() };
  vi.mocked(useMonthlySummary).mockClear();
});
function render(month = '2024-02') {
  return renderToStaticMarkup(<MonthProvider initialMonth={month}><Analytics /></MonthProvider>);
}

describe('Analytics page data states (server rendering)', () => {
  it('uses shared MonthContext and the existing summary hook with validated analytics inputs', () => {
    render('2026-11');
    expect(useMonthlySummary).toHaveBeenCalledWith('2026-11', fetchAnalyticsSummary);
  });
  it('shows loading skeletons and disables refresh without displaying fake financial values', () => {
    const html = render();
    expect(html).toContain('aria-busy="true"'); expect(html).toContain('Loading analytics...');
    expect(html).toContain('motion-safe:animate-pulse'); expect(html).toContain('disabled=""');
    expect(html).not.toContain('$0.00'); expect(html).not.toContain('No expenses');
  });
  it('shows API failure and a Retry control without stale charts', () => {
    hook.state = { ...hook.state, isLoading: false, error: 'Database is unavailable' };
    const html = render();
    expect(html).toContain('role="alert"'); expect(html).toContain('Database is unavailable'); expect(html).toContain('Try again');
    expect(html).not.toContain('Daily expense bar chart'); expect(html).not.toContain('No expenses');
  });
  it('does not render the prior month data even if an obsolete hook snapshot reaches the page', () => {
    hook.state = { ...hook.state, isLoading: false, summary: createAnalyticsFixture('2024-02') };
    const html = render('2024-03');
    expect(html).toContain('March 2024'); expect(html).not.toContain('$75.50'); expect(html).not.toContain('Feb 29');
    expect(html).not.toContain('Daily expense bar chart');
  });
  it('renders recovered summary data after retry without retaining error or loading markup', () => {
    hook.state = { ...hook.state, isLoading: false, summary: createAnalyticsFixture() };
    const html = render();
    expect(html).toContain('$75.50'); expect(html).toContain('Daily spending'); expect(html).toContain('Spending by category');
    expect(html).not.toContain('Failed to load analytics'); expect(html).not.toContain('Loading analytics...');
  });
  it('shows the zero-spending state for an income-only month', () => {
    hook.state = { ...hook.state, isLoading: false, summary: createAnalyticsFixture('2024-02', 0) };
    const html = render();
    expect(html).toContain('No expenses in February 2024'); expect(html).toContain('No category spending');
    expect(html).not.toContain('Expense distribution donut chart');
  });
  it('keeps a stable presentation owner across same-month refresh and replaces it when month changes', () => {
    const context = { month: '2024-02', summaryRevision: 0, setMonth: vi.fn(), goToPreviousMonth: vi.fn(),
      goToNextMonth: vi.fn(), goToCurrentMonth: vi.fn(), notifyTransactionCreated: vi.fn() };
    const spy = vi.spyOn(monthContext, 'useMonth').mockReturnValue(context);
    try {
      const original = Analytics();
      hook.state = { ...hook.state, isLoading: true, summary: null };
      const loading = Analytics();
      hook.state = { ...hook.state, isLoading: false, summary: createAnalyticsFixture() };
      const refreshed = Analytics();
      expect(isValidElement(original) && isValidElement(loading) && isValidElement(refreshed)).toBe(true);
      expect(loading.type).toBe(original.type); expect(refreshed.type).toBe(original.type);
      expect(loading.key).toBe(original.key); expect(refreshed.key).toBe(original.key);
      expect(original.key).toBe('2024-02');
      spy.mockReturnValue({ ...context, month: '2024-03' });
      const nextMonth = Analytics();
      expect(nextMonth.key).toBe('2024-03'); expect(nextMonth.key).not.toBe(original.key);
    } finally { spy.mockRestore(); }
  });
});
