import type { ExpenseByCategory } from '../lib/api';
import { categoryColor, type AnalyticsView } from '../lib/analytics';
import { formatCentsToUsd } from '../lib/money';

const analyticsButtonBase = 'min-h-11 rounded-lg border px-4 py-2 text-sm font-medium text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50';
const inactiveButtonColors = 'border-slate-600 bg-slate-800 hover:bg-slate-700';
const activeButtonColors = 'border-emerald-400 bg-emerald-950 hover:bg-emerald-900 underline underline-offset-4';
export const analyticsButtonClass = `${analyticsButtonBase} ${inactiveButtonColors}`;
function selectableButtonClass(selected: boolean): string {
  return `${analyticsButtonBase} ${selected ? activeButtonColors : inactiveButtonColors}`;
}

export function AnalyticsViewControls({ view, onChange }: { view: AnalyticsView; onChange: (view: AnalyticsView) => void }) {
  return <div role="group" aria-label="Analytics display format" className="flex flex-wrap gap-2">
    {(['chart', 'table'] as const).map(value => <button key={value} type="button" aria-pressed={view === value}
      className={selectableButtonClass(view === value)}
      onClick={() => onChange(value)}>{value === 'chart' ? 'Chart View' : 'Table View'}</button>)}
  </div>;
}

export function CategorySelection({ categories, selectedCategoryId, onSelect, onClear }: {
  categories: ExpenseByCategory[]; selectedCategoryId: number | null;
  onSelect: (categoryId: number) => void; onClear: () => void;
}) {
  return <section aria-labelledby="category-selection-title" className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="category-selection-title" className="text-lg font-semibold">Explore a category</h2>
      <button type="button" className={analyticsButtonClass} disabled={selectedCategoryId === null} onClick={onClear}>Clear selection</button>
    </div>
    <p className="mt-2 text-sm text-slate-400">Select a category for exact details and highlighting. Daily spending continues to show all expenses.</p>
    {categories.length === 0 ? <p className="mt-4 text-sm text-slate-300">No category spending this month.</p> :
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map(category => <li key={category.categoryId} className="min-w-0">
          <button type="button" aria-pressed={selectedCategoryId === category.categoryId}
            onClick={() => onSelect(category.categoryId)}
            className={`${selectableButtonClass(selectedCategoryId === category.categoryId)} flex w-full flex-wrap items-center justify-between gap-2 text-left`}>
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(category.categoryId) }} />
              <span>{category.categoryName}{selectedCategoryId === category.categoryId ? ' (Selected)' : ''}</span>
            </span>
            <span className="break-all font-mono text-xs tabular-nums">{formatCentsToUsd(category.amountCents)}</span>
          </button>
        </li>)}
      </ul>}
  </section>;
}
