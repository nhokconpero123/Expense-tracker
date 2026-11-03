import { MonthSelector } from '../components/MonthSelector';
import { SummaryCard } from '../components/SummaryCard';
import { useMonth } from '../context/MonthContext';
import { useMonthlySummary } from '../hooks/useMonthlySummary';
import { formatMonthDisplay } from '../lib/date';
import { formatCentsToUsd } from '../lib/money';

export function Dashboard() {
  const { month } = useMonth();
  const { summary, isLoading, error, refresh } = useMonthlySummary(month);

  const formattedMonth = formatMonthDisplay(month);
  const isEmptyMonth =
    summary !== null &&
    summary.incomeCents === 0 &&
    summary.expenseCents === 0 &&
    summary.expensesByCategory.length === 0;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
            Monthly Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Overview of cash flow and balance for {formattedMonth}.
          </p>
        </div>

        {/* Controls: Month selector and manual refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <MonthSelector />

          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Refresh summary data"
            title="Refresh summary data"
          >
            <svg
              className={`h-4 w-4 ${isLoading ? 'motion-safe:animate-spin' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error State with Retry */}
      {error && (
        <section
          role="alert"
          aria-live="assertive"
          className="rounded-2xl border border-rose-800/80 bg-rose-950/40 p-5 sm:p-6 text-slate-200 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400"
              aria-hidden="true"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-rose-200">
                Failed to load summary
              </h2>
              <p className="mt-1 text-sm text-rose-300/90 leading-relaxed">
                {error}
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={refresh}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                    <path d="M3 21v-5h5" />
                  </svg>
                  <span>Try again</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Monthly Summary Cards Grid */}
      <section aria-label="Monthly Financial Totals">
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
          <SummaryCard
            title="Monthly Income"
            amountCents={summary?.incomeCents ?? null}
            type="income"
            isLoading={isLoading}
            subtext="Total cash received"
          />
          <SummaryCard
            title="Monthly Expenses"
            amountCents={summary?.expenseCents ?? null}
            type="expense"
            isLoading={isLoading}
            subtext="Total spending"
          />
          <SummaryCard
            title="Net Balance"
            amountCents={summary?.balanceCents ?? null}
            type="balance"
            isLoading={isLoading}
            subtext="Income minus expenses"
          />
        </div>
      </section>

      {/* Empty State Banner (Shown when loaded with 0 activity) */}
      {!isLoading && !error && isEmptyMonth && (
        <section
          aria-label="No transactions recorded"
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-6 py-12 text-center"
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-400"
            aria-hidden="true"
          >
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-200">
            No transactions in {formattedMonth}
          </h2>
          <p className="mt-2 max-w-md text-sm text-slate-400 leading-relaxed">
            There are no income or expense transactions recorded for this month.
            Add transactions to see your spending and cash flow analyzed here.
          </p>
        </section>
      )}

      {/* Non-empty Activity Summary Preview */}
      {!isLoading && !error && summary && !isEmptyMonth && (
        <section
          aria-label="Monthly Activity Summary"
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Category Spending Distribution
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                {summary.expensesByCategory.length === 0
                  ? 'No expense categories recorded'
                  : `${summary.expensesByCategory.length} ${
                      summary.expensesByCategory.length === 1 ? 'category' : 'categories'
                    } with spending in ${formattedMonth}`}
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Total Expenses: {formatCentsToUsd(summary.expenseCents)}
            </span>
          </div>

          {summary.expensesByCategory.length > 0 ? (
            <ul className="mt-4 divide-y divide-slate-800/80">
              {summary.expensesByCategory.map((category) => {
                const percentage =
                  summary.expenseCents > 0
                    ? Math.round((category.amountCents / summary.expenseCents) * 100)
                    : 0;

                return (
                  <li
                    key={category.categoryId}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                      <span className="font-medium text-slate-200">
                        {category.categoryName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">
                        {percentage}%
                      </span>
                      <span className="font-semibold text-slate-100">
                        {formatCentsToUsd(category.amountCents)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-400">
              No expenses in this month. Only income was recorded.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

