import type { MonthlySummary } from '../lib/api';
import { formatDateDisplay, formatMonthDisplay } from '../lib/date';
import { formatCentsToUsd } from '../lib/money';
import { analyticsButtonClass } from './AnalyticsControls';

const tableClass = 'w-full table-fixed text-left text-sm';
const cellClass = 'break-words border-t border-slate-700 p-3 align-top';
const amountClass = `${cellClass} break-all text-right font-mono tabular-nums`;

export function AnalyticsTables({ summary, selectedCategoryId, dailyTableExpanded, onToggleDays }: {
  summary: MonthlySummary; selectedCategoryId: number | null; dailyTableExpanded: boolean; onToggleDays: () => void;
}) {
  const month = formatMonthDisplay(summary.month);
  return <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-2">
    <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:p-6">
      <table className={tableClass}>
        <caption className="pb-4 text-left text-lg font-semibold">Spending by category — {month}</caption>
        <thead><tr><th scope="col" className="w-1/2 p-3">Category</th><th scope="col" className="p-3 text-right">Spending (USD)</th></tr></thead>
        <tbody>{summary.expensesByCategory.length === 0 ? <tr><td colSpan={2} className={cellClass}>No category spending this month.</td></tr> :
          summary.expensesByCategory.map(category => <tr key={category.categoryId}
            className={selectedCategoryId === category.categoryId ? 'bg-emerald-950/60' : ''}>
            <th scope="row" className={`${cellClass} font-medium`}>{category.categoryName}
              {selectedCategoryId === category.categoryId && <span className="block text-xs text-emerald-300">Selected</span>}</th>
            <td className={amountClass}>{formatCentsToUsd(category.amountCents)}</td>
          </tr>)}</tbody>
        <tfoot><tr><th scope="row" className={cellClass}>Monthly expenses</th><td className={amountClass}>{formatCentsToUsd(summary.expenseCents)}</td></tr></tfoot>
      </table>
    </section>
    <DailySpendingTable summary={summary} expanded={dailyTableExpanded} onToggle={onToggleDays} />
  </div>;
}

export function DailySpendingTable({ summary, expanded, onToggle }: {
  summary: MonthlySummary; expanded: boolean; onToggle: () => void;
}) {
  const spendingDays = summary.dailyExpenses.filter(day => day.amountCents > 0);
  const visibleDays = expanded ? summary.dailyExpenses : spendingDays;
  const dayCount = summary.dailyExpenses.length;
  return <section aria-label={`Daily spending for ${formatMonthDisplay(summary.month)}`}
    className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:p-6">
    <div id="daily-spending-rows">
      {visibleDays.length > 0 ? <table className={tableClass}>
        <caption className="pb-4 text-left text-lg font-semibold">Daily spending — {formatMonthDisplay(summary.month)}</caption>
        <thead><tr><th scope="col" className="w-1/2 p-3">Date</th><th scope="col" className="p-3 text-right">Spending (USD)</th></tr></thead>
        <tbody>{visibleDays.map(day => <tr key={day.date}>
            <th scope="row" className={`${cellClass} font-medium`}>{formatDateDisplay(day.date)}</th>
            <td className={amountClass}>{formatCentsToUsd(day.amountCents)}</td>
          </tr>)}</tbody>
        <tfoot><tr><th scope="row" className={cellClass}>Monthly expenses</th><td className={amountClass}>{formatCentsToUsd(summary.expenseCents)}</td></tr></tfoot>
      </table> : <>
        <h2 className="text-lg font-semibold">Daily spending — {formatMonthDisplay(summary.month)}</h2>
        <p className="mt-3 text-sm text-slate-300">{dayCount ? 'No spending recorded this month.' : 'No daily spending data available.'}</p>
      </>}
    </div>
    {dayCount > 0 && <div className="mt-4 space-y-2">
      <button type="button" aria-expanded={expanded} aria-controls="daily-spending-rows" onClick={onToggle} className={analyticsButtonClass}>
        {expanded ? 'Show spending days only' : `Show all ${dayCount} days`}
      </button>
      {spendingDays.length > 0 && <p className="text-xs text-slate-400">{expanded ? `Showing all ${dayCount} days` : `Showing ${spendingDays.length} spending days of ${dayCount} days`}</p>}
    </div>}
  </section>;
}
