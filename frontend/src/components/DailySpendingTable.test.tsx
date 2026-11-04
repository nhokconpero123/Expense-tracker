import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BarChart, ResponsiveContainer } from 'recharts';
import { AnalyticsTables, DailySpendingTable } from './AnalyticsTables';
import { DailySpendingChart } from './SpendingCharts';
import { AnalyticsPresentation } from '../pages/Analytics';
import { analyticsViewReducer, INITIAL_ANALYTICS_VIEW, type AnalyticsViewAction, type AnalyticsViewState } from '../lib/analytics';
import { createAnalyticsFixture } from '../test/analyticsFixtures';
import type { MonthlySummary } from '../lib/api';

function findElement(node: ReactNode, type: unknown): ReactNode {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === type) return node;
  for (const item of Children.toArray(node.props.children)) {
    const found = findElement(item, type);
    if (found) return found;
  }
  return undefined;
}
function props<T>(node: ReactNode): T {
  if (!isValidElement(node)) throw new Error('Expected React element');
  return node.props as T;
}
function rowCount(html: string): number {
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? '';
  return (body.match(/<tr\b/g) ?? []).length;
}

/** Exercise production button -> dispatch -> reducer -> table wiring without a DOM shim. */
function setup(initialSummary = createAnalyticsFixture()) {
  let summary = initialSummary;
  let state: AnalyticsViewState = { ...INITIAL_ANALYTICS_VIEW, view: 'table' };
  const dispatch = (action: AnalyticsViewAction) => { state = analyticsViewReducer(state, action); };
  const presentation = () => AnalyticsPresentation({ summary, state, dispatch });
  const daily = () => {
    const tables = AnalyticsTables(props<ComponentProps<typeof AnalyticsTables>>(findElement(presentation(), AnalyticsTables)));
    return DailySpendingTable(props<ComponentProps<typeof DailySpendingTable>>(findElement(tables, DailySpendingTable)));
  };
  return {
    presentation, dispatch, state: () => state,
    refresh: (next: MonthlySummary) => { summary = next; },
    html: () => renderToStaticMarkup(daily()),
    toggle: () => { props<{ onClick: () => void }>(findElement(daily(), 'button')).onClick(); },
  };
}

describe('daily table progressive disclosure', () => {
  it('defaults to chronological spending days without changing source data or totals', () => {
    const summary = createAnalyticsFixture('2026-11');
    const amounts: Record<string, number> = { '2026-11-03': 1250, '2026-11-10': 2500, '2026-11-18': 3800 };
    summary.dailyExpenses = summary.dailyExpenses.map(day => ({ ...day, amountCents: amounts[day.date] ?? 0 }));
    const snapshot = structuredClone(summary); const originalSeries = summary.dailyExpenses;
    const view = setup(summary); const html = view.html();
    expect(rowCount(html)).toBe(3);
    expect(html).toContain('Nov 3, 2026'); expect(html).toContain('Nov 10, 2026'); expect(html).toContain('Nov 18, 2026');
    expect(html.indexOf('Nov 3, 2026')).toBeLessThan(html.indexOf('Nov 10, 2026'));
    expect(html.indexOf('Nov 10, 2026')).toBeLessThan(html.indexOf('Nov 18, 2026'));
    expect(html).not.toContain('Nov 1, 2026'); expect(html).not.toContain('$0.00');
    expect(html).toContain('$12.50'); expect(html).toContain('$25.00'); expect(html).toContain('$38.00'); expect(html).toContain('$75.50');
    expect(html).toContain('Show all 30 days'); expect(html).toContain('Showing 3 spending days of 30 days');
    expect(html).toContain('aria-expanded="false"');
    view.toggle(); view.toggle();
    expect(summary).toEqual(snapshot); expect(summary.dailyExpenses).toBe(originalSeries);
  });
  it.each([['2024-02', 29], ['2025-02', 28], ['2026-04', 30], ['2026-11', 30], ['2026-01', 31]] as const)(
    'expands %s to all %i calendar rows and collapses through the actual toggle handler', (month, count) => {
      const view = setup(createAnalyticsFixture(month));
      expect(rowCount(view.html())).toBe(1); expect(view.html()).toContain(`Show all ${count} days`);
      view.toggle();
      let html = view.html();
      expect(rowCount(html)).toBe(count); expect(html).toContain('Show spending days only');
      expect(html).toContain('aria-expanded="true"'); expect(html).toContain('aria-controls="daily-spending-rows"');
      expect(html).toContain('id="daily-spending-rows"'); expect(html).toContain('focus-visible:ring-2');
      expect(html).toContain('$0.00'); expect(html).toContain('$75.50');
      expect(view.state().dailyTableExpanded).toBe(true);
      view.toggle(); html = view.html();
      expect(rowCount(html)).toBe(1); expect(html).toContain(`Show all ${count} days`); expect(html).toContain('aria-expanded="false"');
      expect(view.state().dailyTableExpanded).toBe(false);
    });
  it('shows one concise all-zero message without an empty table and still allows expansion', () => {
    const summary = createAnalyticsFixture('2024-02', 0); const view = setup(summary);
    expect(view.html()).not.toContain('<table'); expect(view.html()).toContain('No spending recorded this month.');
    const page = renderToStaticMarkup(view.presentation());
    expect(page.match(/No spending recorded this month\./g)).toHaveLength(1); expect(page).not.toContain('No expenses in');
    expect(view.html()).toContain('Show all 29 days');
    view.toggle(); expect(rowCount(view.html())).toBe(29); expect(view.html()).not.toContain('No spending recorded this month.');
    expect(view.html().match(/\$0\.00/g)).toHaveLength(30);
    view.toggle(); expect(view.html()).not.toContain('<table'); expect(summary.dailyExpenses).toHaveLength(29);
  });
  it('retains expansion and Table View when successful same-month data is replaced', () => {
    const view = setup(); view.toggle();
    view.refresh(createAnalyticsFixture('2024-02', 9000));
    expect(view.state()).toMatchObject({ view: 'table', dailyTableExpanded: true });
    expect(rowCount(view.html())).toBe(29); expect(view.html()).toContain('$90.00'); expect(view.html()).not.toContain('$75.50');
    expect(view.html()).toContain('aria-expanded="true"');
    expect(INITIAL_ANALYTICS_VIEW.dailyTableExpanded).toBe(false);
  });
  it('keeps complete zero-filled Recharts data and disclosure state when switching Chart/Table views', () => {
    const summary = createAnalyticsFixture(); const view = setup(summary); view.toggle();
    for (const expanded of [true, false]) {
      if (!expanded) view.toggle();
      view.dispatch({ type: 'view', view: 'chart' });
      const chartInput = props<ComponentProps<typeof DailySpendingChart>>(findElement(view.presentation(), DailySpendingChart));
      expect(chartInput.dailyExpenses).toBe(summary.dailyExpenses); expect(chartInput.dailyExpenses).toHaveLength(29);
      expect(chartInput.dailyExpenses.filter(day => day.amountCents === 0)).toHaveLength(28);
      const chart = DailySpendingChart(chartInput);
      const container = findElement(chart, ResponsiveContainer);
      expect(props<{ data: unknown }>(findElement(container, BarChart)).data).toBe(summary.dailyExpenses);
      view.dispatch({ type: 'view', view: 'table' });
      expect(view.state().dailyTableExpanded).toBe(expanded); expect(rowCount(view.html())).toBe(expanded ? 29 : 1);
    }
  });
  it('does not invent rows or a disclosure action for an unavailable daily series', () => {
    const summary = createAnalyticsFixture(); summary.dailyExpenses = [];
    const view = setup(summary);
    expect(view.html()).toContain('No daily spending data available.'); expect(view.html()).not.toContain('<table');
    expect(view.html()).not.toContain('<button');
  });
});
