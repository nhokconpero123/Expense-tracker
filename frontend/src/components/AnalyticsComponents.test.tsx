import { Children, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup as renderToString } from 'react-dom/server';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsViewControls, CategorySelection } from './AnalyticsControls';
import { AnalyticsTables } from './AnalyticsTables';
import { CategorySpendingChart, DailySpendingChart, SpendingTooltip } from './SpendingCharts';
import { Navbar } from './Navbar';
import { AnalyticsPresentation } from '../pages/Analytics';
import { analyticsViewReducer, INITIAL_ANALYTICS_VIEW, type AnalyticsViewAction } from '../lib/analytics';
import { createAnalyticsFixture } from '../test/analyticsFixtures';

function props<T>(node: ReactNode): T {
  if (!isValidElement(node)) throw new Error('Expected React element');
  return node.props as T;
}
function child(node: ReactNode, type: unknown): ReactNode {
  return Children.toArray(props<{ children: ReactNode }>(node).children).find(item => isValidElement(item) && item.type === type);
}

describe('exact spending tooltips', () => {
  it.each([[0, '$0.00'], [1, '$0.01'], [29, '$0.29'], [7550, '$75.50'], [Number.MAX_SAFE_INTEGER, '$90,071,992,547,409.91']])(
    'formats %i cents without a dollar conversion error', (amountCents, expected) => {
      const html = renderToString(<SpendingTooltip kind="daily" active payload={[{ payload: { date: '2024-02-29', amountCents } }]} />);
      expect(html).toContain(expected); expect(html).toContain('Feb 29, 2024'); expect(html).toContain('role="tooltip"');
    });
  it('uses category names and exact USD in category tooltips', () => {
    const html = renderToString(<SpendingTooltip kind="category" active payload={[{ payload: { categoryName: 'Food', amountCents: 7550 } }]} />);
    expect(html).toContain('Food'); expect(html).toContain('$75.50');
  });
  it.each([undefined, {}, { payload: null }, { payload: { amountCents: '7550', date: '2024-02-01' } },
    { payload: { amountCents: 1.5, date: '2024-02-01' } }, { payload: { amountCents: -1 } },
    { payload: { amountCents: Number.MAX_SAFE_INTEGER + 1 } }])('hides unavailable or invalid tooltip payload %j', item => {
    expect(renderToString(<SpendingTooltip kind="daily" active payload={item ? [item] : []} />)).toBe('');
  });
  it('hides inactive tooltips', () => {
    expect(renderToString(<SpendingTooltip kind="category" active={false} payload={[{ payload: { categoryName: 'Food', amountCents: 1 } }]} />)).toBe('');
  });
  it.each(['not-a-date', '2026-02-29', '2024-02-', '2024-13-01', '2024-02-29\n', '2024-02-29 ', '2024-02-29T00:00:00Z', undefined, null, 42, {}])(
    'suppresses invalid daily tooltip date %j without throwing', date => {
      const render = () => renderToString(<SpendingTooltip kind="daily" active payload={[{ payload: { date, amountCents: 7550 } }]} />);
      expect(render).not.toThrow(); expect(render()).toBe('');
    });
  it.each([NaN, Infinity, -Infinity, null, undefined, 100n, {}, []])('suppresses malformed tooltip amount %s without throwing', amountCents => {
    const render = () => renderToString(<SpendingTooltip kind="daily" active payload={[{ payload: { date: '2024-02-29', amountCents } }]} />);
    expect(render).not.toThrow(); expect(render()).toBe('');
  });
});

describe('chart input and responsive configuration', () => {
  it('passes backend daily data unchanged, caps label density, and disables animation', () => {
    const daily = createAnalyticsFixture().dailyExpenses;
    const wrapper = DailySpendingChart({ dailyExpenses: daily });
    const container = child(wrapper, ResponsiveContainer);
    expect(props<{ minWidth: number }>(container).minWidth).toBe(0);
    const chart = child(container, BarChart);
    expect(props<{ data: unknown }>(chart).data).toBe(daily);
    expect(props<{ ticks: string[] }>(child(chart, XAxis)).ticks).toHaveLength(4);
    expect(props<{ ticks: number[] }>(child(chart, YAxis)).ticks.every(Number.isSafeInteger)).toBe(true);
    expect(props<{ isAnimationActive: boolean }>(child(chart, Bar)).isAnimationActive).toBe(false);
    expect(props<{ className: string }>(wrapper).className).toContain('h-72');
  });
  it('uses category IDs for colors, selection, and React keys with one or many categories', () => {
    const categories = [...createAnalyticsFixture().expensesByCategory, { categoryId: 5, categoryName: 'Housing', amountCents: 2450 }];
    const onSelect = vi.fn();
    const wrapper = CategorySpendingChart({ categories, selectedCategoryId: 5, onSelect });
    const chart = child(child(wrapper, ResponsiveContainer), PieChart);
    const pie = child(chart, Pie);
    expect(props<{ data: unknown }>(pie).data).toBe(categories);
    expect(props<{ isAnimationActive: boolean }>(pie).isAnimationActive).toBe(false);
    const cells = Children.toArray(props<{ children: ReactNode }>(pie).children);
    expect(cells.every(cell => isValidElement(cell) && cell.type === Cell)).toBe(true);
    expect(cells.map(cell => isValidElement(cell) ? cell.key : null)).toEqual(['.$4', '.$5']);
    expect(cells.map(cell => props<{ strokeWidth: number }>(cell).strokeWidth)).toEqual([1, 4]);
    const click = props<{ onClick: (sector: unknown, index: number) => void }>(pie).onClick;
    click({}, 1); expect(onSelect).toHaveBeenCalledWith(5);
    const single = child(child(child(CategorySpendingChart({ categories: categories.slice(0, 1), selectedCategoryId: null, onSelect }), ResponsiveContainer), PieChart), Pie);
    expect(props<{ paddingAngle: number }>(single).paddingAngle).toBe(0);
  });
});

describe('analytics tables and accessible controls', () => {
  it('renders every leap-February date, zero days, category totals, and backend monthly total', () => {
    const html = renderToString(<AnalyticsTables summary={createAnalyticsFixture()} selectedCategoryId={4} dailyTableExpanded onToggleDays={() => {}} />);
    expect(html).toContain('Feb 29, 2024'); expect(html).toContain('Feb 2, 2024'); expect(html).not.toContain('Feb 30');
    expect(html.match(/\$0\.00/g)).toHaveLength(28);
    expect(html).toContain('$75.50'); expect(html).toContain('Selected'); expect(html).toContain('scope="col"'); expect(html).toContain('scope="row"');
  });
  it('renders multiple server categories without regrouping or modifying amounts', () => {
    const summary = createAnalyticsFixture('2024-02', 10000);
    summary.expensesByCategory = [{ categoryId: 4, categoryName: 'Food', amountCents: 7550 }, { categoryId: 5, categoryName: 'Housing', amountCents: 2450 }];
    const html = renderToString(<AnalyticsTables summary={summary} selectedCategoryId={5} dailyTableExpanded={false} onToggleDays={() => {}} />);
    expect(html).toContain('Food'); expect(html).toContain('Housing'); expect(html).toContain('$75.50'); expect(html).toContain('$24.50'); expect(html).toContain('$100.00');
  });
  it('renders empty category and daily tables without inventing rows', () => {
    const summary = createAnalyticsFixture('2024-02', 0); summary.dailyExpenses = [];
    const html = renderToString(<AnalyticsTables summary={summary} selectedCategoryId={null} dailyTableExpanded={false} onToggleDays={() => {}} />);
    expect(html).toContain('No category spending'); expect(html).toContain('No daily spending data');
  });
  it('shows an explicit all-zero empty state with chart/table controls', () => {
    const html = renderToString(<AnalyticsPresentation summary={createAnalyticsFixture('2024-02', 0)} state={INITIAL_ANALYTICS_VIEW} dispatch={() => {}} />);
    expect(html).toContain('No expenses in February 2024'); expect(html).toContain('$0.00'); expect(html).toContain('Table View');
    expect(html).not.toContain('Daily expense bar chart'); expect(html).not.toContain('Expense distribution donut chart');
  });
  it('retains expanded zero-day table access without duplicate empty-state banners', () => {
    const html = renderToString(<AnalyticsPresentation summary={createAnalyticsFixture('2024-02', 0)} state={{ ...INITIAL_ANALYTICS_VIEW, view: 'table', dailyTableExpanded: true }} dispatch={() => {}} />);
    expect(html).toContain('Feb 29, 2024'); expect(html).toContain('<table'); expect(html).toContain('$0.00');
    expect(html).not.toContain('No expenses in'); expect(html).not.toContain('No spending recorded this month.');
  });
  it('connects view controls to state changes and renders the requested view', () => {
    let state = INITIAL_ANALYTICS_VIEW;
    const dispatch = (action: AnalyticsViewAction) => { state = analyticsViewReducer(state, action); };
    const presentation = AnalyticsPresentation({ summary: createAnalyticsFixture(), state, dispatch });
    const controls = child(Children.toArray(props<{ children: ReactNode }>(presentation).children)[0], AnalyticsViewControls);
    props<{ onChange: (view: 'table') => void }>(controls).onChange('table');
    expect(state.view).toBe('table');
    const html = renderToString(<AnalyticsPresentation summary={createAnalyticsFixture()} state={state} dispatch={dispatch} />);
    expect(html).toContain('<table'); expect(html).not.toContain('Daily expense bar chart');
    const buttonHtml = renderToString(<AnalyticsViewControls view="table" onChange={() => {}} />);
    expect(buttonHtml).toMatch(/aria-pressed="true"[^>]*>Table View/);
  });
  it('connects selection and clear handlers to exact category details without color-only feedback', () => {
    let state = INITIAL_ANALYTICS_VIEW;
    const dispatch = (action: AnalyticsViewAction) => { state = analyticsViewReducer(state, action); };
    const summary = createAnalyticsFixture();
    const presentation = AnalyticsPresentation({ summary, state, dispatch });
    const selection = child(presentation, CategorySelection);
    props<{ onSelect: (id: number) => void }>(selection).onSelect(4);
    let html = renderToString(<AnalyticsPresentation summary={summary} state={state} dispatch={dispatch} />);
    expect(html).toContain('Food (Selected)'); expect(html).toContain('Selected category: Food. $75.50 spent in February 2024.');
    expect(html).toContain('aria-live="polite"'); expect(html).toContain('aria-pressed="true"');
    props<{ onClear: () => void }>(selection).onClear();
    html = renderToString(<AnalyticsPresentation summary={summary} state={state} dispatch={dispatch} />);
    expect(html).toContain('No category selected.'); expect(html).not.toContain('Food (Selected)');
  });
  it('provides native category buttons with disabled clear action until selection', () => {
    const onSelect = vi.fn(); const onClear = vi.fn();
    const tree = CategorySelection({ categories: createAnalyticsFixture().expensesByCategory, selectedCategoryId: null, onSelect, onClear });
    const list = child(tree, 'ul');
    const button = child(Children.toArray(props<{ children: ReactNode }>(list).children)[0], 'button');
    props<{ onClick: () => void }>(button).onClick(); expect(onSelect).toHaveBeenCalledExactlyOnceWith(4);
    const html = renderToString(tree);
    expect(html).toContain('type="button"'); expect(html).toContain('disabled=""'); expect(html).toContain('focus-visible:ring-2');
  });
  it('activates Analytics in existing navigation', () => {
    const html = renderToString(<Navbar activePage="analytics" onNavigate={() => {}} />);
    expect(html).toMatch(/aria-current="page"[^>]*><span>Analytics/); expect(html).not.toContain('T13');
  });
  it.each(['chart', 'table'] as const)('uses mutually exclusive selected colors for %s view', view => {
    const onChange = vi.fn();
    const tree = AnalyticsViewControls({ view, onChange });
    const buttons = Children.toArray(props<{ children: ReactNode }>(tree).children);
    for (const [index, value] of (['chart', 'table'] as const).entries()) {
      const button = props<{ className: string; 'aria-pressed': boolean; onClick: () => void }>(buttons[index]);
      const classes = button.className.split(' ');
      const selected = view === value;
      expect(button['aria-pressed']).toBe(selected);
      expect(classes.filter(name => name.startsWith('bg-'))).toEqual([selected ? 'bg-emerald-950' : 'bg-slate-800']);
      expect(classes.filter(name => name.startsWith('border-'))).toEqual([selected ? 'border-emerald-400' : 'border-slate-600']);
      expect(classes.filter(name => name.startsWith('hover:bg-'))).toEqual([selected ? 'hover:bg-emerald-900' : 'hover:bg-slate-700']);
      expect(classes.includes('underline')).toBe(selected);
      expect(classes).toContain('focus-visible:ring-2');
      button.onClick(); expect(onChange).toHaveBeenLastCalledWith(value);
    }
  });
  it.each([null, 4])('uses mutually exclusive category colors for selection %s', selectedCategoryId => {
    const onSelect = vi.fn();
    const tree = CategorySelection({ categories: createAnalyticsFixture().expensesByCategory, selectedCategoryId, onSelect, onClear: () => {} });
    const item = Children.toArray(props<{ children: ReactNode }>(child(tree, 'ul')).children)[0];
    const button = props<{ className: string; 'aria-pressed': boolean; onClick: () => void }>(child(item, 'button'));
    const selected = selectedCategoryId === 4;
    expect(button['aria-pressed']).toBe(selected);
    expect(button.className.split(' ').filter(name => name.startsWith('bg-'))).toEqual([selected ? 'bg-emerald-950' : 'bg-slate-800']);
    expect(button.className.split(' ').filter(name => name.startsWith('border-'))).toEqual([selected ? 'border-emerald-400' : 'border-slate-600']);
    expect(renderToString(tree).includes('(Selected)')).toBe(selected);
    button.onClick(); expect(onSelect).toHaveBeenCalledExactlyOnceWith(4);
  });
});
