import type { BudgetItem } from '../lib/budgetApi';
import { formatCentsToUsd } from '../lib/money';

export const budgetButtonClass = 'min-h-11 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50';
const statusLabels = { no_budget: 'No budget', under: 'Under budget', at_limit: 'At limit', over: 'Over budget' };
const statusColors = { no_budget: 'text-slate-300', under: 'text-emerald-300', at_limit: 'text-amber-300', over: 'text-rose-300' };

export function BudgetCard({ item, onEdit, onRemove, disabled = false }: {
  item: BudgetItem; onEdit: () => void; onRemove: () => void; disabled?: boolean;
}) {
  return (
    <article aria-labelledby={`budget-category-${item.categoryId}`} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={`budget-category-${item.categoryId}`} className="text-lg font-semibold">{item.categoryName}</h2>
        <span className={`text-sm font-medium ${statusColors[item.status]}`}>{statusLabels[item.status]}</span>
      </div>
      <dl className="mt-5 space-y-3 text-sm">
        {([
          ['Budget', item.amountCents], ['Spent', item.spentCents], ['Remaining', item.remainingCents],
        ] as const).map(([label, cents]) => (
          <div key={label} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <dt className="text-slate-400">{label}</dt>
            <dd className="min-w-0 break-all font-mono tabular-nums text-slate-100">{cents === null ? 'Not set' : formatCentsToUsd(cents)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 break-words text-sm text-slate-300">{item.utilizationPercent === null ? 'Set a budget to track utilization.' : `${item.utilizationPercent}% used`}</p>
      {item.utilizationPercent !== null && (
        <div role="progressbar" aria-label={`${item.categoryName} budget utilization`} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.min(100, item.utilizationPercent)} aria-valuetext={`${item.utilizationPercent}% used; ${statusLabels[item.status]}`}
          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700">
          <div className={`h-full rounded-full ${item.status === 'over' ? 'bg-rose-400' : item.status === 'at_limit' ? 'bg-amber-400' : 'bg-emerald-400'}`}
            style={{ width: `${Math.min(100, item.utilizationPercent)}%` }} />
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={onEdit} disabled={disabled} className={budgetButtonClass}
          aria-label={`${item.amountCents === null ? 'Set' : 'Edit'} budget for ${item.categoryName}`}>
          {item.amountCents === null ? 'Set budget' : 'Edit budget'}
        </button>
        {item.amountCents !== null && <button type="button" onClick={onRemove} disabled={disabled}
          className={`${budgetButtonClass} text-rose-300`} aria-label={`Remove budget for ${item.categoryName}`}>Remove</button>}
      </div>
    </article>
  );
}
