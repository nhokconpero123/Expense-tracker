import { useReducer } from 'react';
import { AnalyticsViewControls, CategorySelection, analyticsButtonClass } from '../components/AnalyticsControls';
import { AnalyticsTables } from '../components/AnalyticsTables';
import { CategorySpendingChart, DailySpendingChart } from '../components/SpendingCharts';
import { MonthSelector } from '../components/MonthSelector';
import { useMonth } from '../context/MonthContext';
import { useMonthlySummary } from '../hooks/useMonthlySummary';
import { INITIAL_ANALYTICS_VIEW, analyticsViewReducer, fetchAnalyticsSummary, type AnalyticsViewAction, type AnalyticsViewState } from '../lib/analytics';
import type { MonthlySummary } from '../lib/api';
import { formatMonthDisplay } from '../lib/date';
import { formatCentsToUsd } from '../lib/money';

export function AnalyticsPresentation({ summary, state, dispatch }: {
  summary: MonthlySummary; state: AnalyticsViewState; dispatch: (action: AnalyticsViewAction) => void;
}) {
  const selected = summary.expensesByCategory.find(category => category.categoryId === state.selectedCategoryId);
  const selectedCategoryId = selected?.categoryId ?? null;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm text-slate-400">Monthly expenses</p>
        <p className="mt-1 break-all font-mono text-2xl font-semibold tabular-nums">{formatCentsToUsd(summary.expenseCents)}</p></div>
      <AnalyticsViewControls view={state.view} onChange={view => dispatch({ type: 'view', view })} />
    </div>
    {summary.expenseCents === 0 && state.view === 'chart' && <section aria-label="No spending this month" className="rounded-2xl border border-dashed border-slate-700 p-6 text-center">
      <h2 className="text-lg font-semibold">No expenses in {formatMonthDisplay(summary.month)}</h2>
      <p className="mt-2 text-sm text-slate-300">Record an expense in Transactions to see your spending patterns. Table View can expand to include every zero-spend day.</p>
    </section>}
    <CategorySelection categories={summary.expensesByCategory} selectedCategoryId={selectedCategoryId}
      onSelect={categoryId => dispatch({ type: 'select', categoryId })} onClear={() => dispatch({ type: 'clear' })} />
    <p aria-live="polite" aria-atomic="true" className="break-words text-sm text-slate-300">
      {selected ? `Selected category: ${selected.categoryName}. ${formatCentsToUsd(selected.amountCents)} spent in ${formatMonthDisplay(summary.month)}.` : 'No category selected.'}
    </p>
    {state.view === 'table' ? <AnalyticsTables summary={summary} selectedCategoryId={selectedCategoryId}
      dailyTableExpanded={state.dailyTableExpanded} onToggleDays={() => dispatch({ type: 'toggle-days' })} /> : summary.expenseCents > 0 &&
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
        <figure className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
          <figcaption className="text-lg font-semibold">Daily spending</figcaption>
          <p className="mt-1 text-sm text-slate-400">{formatMonthDisplay(summary.month)} · Day of month · USD</p>
          <DailySpendingChart dailyExpenses={summary.dailyExpenses} />
          <p className="text-xs text-slate-400">All calendar days are included. Axis amounts use compact labels; tooltips and Table View show exact USD.</p>
        </figure>
        <figure className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
          <figcaption className="text-lg font-semibold">Spending by category</figcaption>
          <p className="mt-1 text-sm text-slate-400">{formatMonthDisplay(summary.month)} · USD</p>
          <CategorySpendingChart categories={summary.expensesByCategory} selectedCategoryId={selectedCategoryId}
            onSelect={categoryId => dispatch({ type: 'select', categoryId })} />
          <p className="text-xs text-slate-400">Use the category buttons above to select with a keyboard. Table View lists every exact amount.</p>
        </figure>
      </div>}
  </div>;
}

export function Analytics() {
  const { month } = useMonth();
  return <AnalyticsMonth key={month} month={month} />;
}

function AnalyticsMonth({ month }: { month: string }) {
  // Keep presentation state mounted across same-month loading/error/retry states.
  const [state, dispatch] = useReducer(analyticsViewReducer, INITIAL_ANALYTICS_VIEW);
  const { summary, isLoading, error, refresh } = useMonthlySummary(month, fetchAnalyticsSummary);
  return <div className="min-w-0 space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Spending Analytics</h1>
        <p className="mt-1 text-sm text-slate-400">Explore spending patterns for {formatMonthDisplay(month)}.</p></div>
      <MonthSelector />
    </div>
    <button type="button" onClick={refresh} disabled={isLoading} className={analyticsButtonClass}>Refresh analytics</button>
    {error && <section role="alert" className="rounded-2xl border border-rose-800 bg-rose-950/40 p-5">
      <h2 className="font-semibold text-rose-200">Failed to load analytics</h2>
      <p className="mt-2 break-words text-sm text-rose-300">{error}</p>
      <button type="button" onClick={refresh} className={`${analyticsButtonClass} mt-4`}>Try again</button>
    </section>}
    {isLoading && <section role="status" aria-label="Loading analytics" aria-busy="true" className="space-y-4">
      <p className="text-sm text-slate-300">Loading analytics...</p>
      <div aria-hidden="true" className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {[0, 1].map(key => <div key={key} className="h-72 rounded-2xl border border-slate-800 bg-slate-900 motion-safe:animate-pulse" />)}
      </div>
    </section>}
    {!isLoading && !error && summary && summary.month === month && <AnalyticsPresentation summary={summary} state={state} dispatch={dispatch} />}
  </div>;
}
