import { useRef } from 'react';
import { BudgetCard, budgetButtonClass } from '../components/BudgetCard';
import { BudgetDialog } from '../components/BudgetDialog';
import { MonthSelector } from '../components/MonthSelector';
import { useMonth } from '../context/MonthContext';
import { useBudgets } from '../hooks/useBudgets';
import { formatMonthDisplay } from '../lib/date';

export function Budgets() {
  const { month } = useMonth();
  const { state, store, refresh } = useBudgets();
  const headingRef = useRef<HTMLHeadingElement>(null);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 sm:text-3xl">Monthly Budgets</h1>
          <p className="mt-1 text-sm text-slate-400">Plan category limits and compare spending for {formatMonthDisplay(month)}.</p>
        </div>
        <MonthSelector />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-300">Budgets apply to expense categories. Spending can exceed a limit.</p>
        <button type="button" className={budgetButtonClass} onClick={refresh} disabled={state.loading || state.pending}>Refresh budgets</button>
      </div>
      {state.notice && <p role="status" className="rounded-xl border border-emerald-700 bg-emerald-950/40 p-4 text-sm text-emerald-200">{state.notice}</p>}
      {state.error && <section role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-5">
        <h2 className="font-semibold text-rose-200">Failed to load budgets</h2>
        <p className="mt-2 break-words text-sm text-rose-300">{state.error}</p>
        <button type="button" onClick={refresh} className={`${budgetButtonClass} mt-4`}>Try again</button>
      </section>}
      <section aria-label="Monthly category budgets" aria-busy={state.loading}>
        {state.loading && <p role="status" className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-300">Loading budgets...</p>}
        {state.data && state.data.items.length === 0 && <p className="rounded-2xl border border-dashed border-slate-700 p-6 text-slate-300">No expense categories available.</p>}
        {state.data && state.data.items.length > 0 && <>
          {state.data.items.every(item => item.amountCents === null) && <p className="mb-5 text-sm text-slate-300">No budgets set for this month. Choose a category below to set your first limit.</p>}
          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {state.data.items.map(item => <BudgetCard key={item.categoryId} item={item} disabled={state.pending}
              onEdit={() => store.open(item, 'save')} onRemove={() => store.open(item, 'remove')} />)}
          </div>
        </>}
      </section>
      {state.editor && <BudgetDialog editor={state.editor} pending={state.pending} store={store} fallbackFocus={headingRef} />}
    </div>
  );
}
