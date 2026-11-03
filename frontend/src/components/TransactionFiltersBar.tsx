import type { Category } from '../lib/api';
import type { TransactionFilterValues } from '../hooks/useTransactions';

export interface TransactionFiltersBarProps {
  filters: TransactionFilterValues;
  categories: Category[];
  onFilterChange: <K extends keyof TransactionFilterValues>(
    key: K,
    value: TransactionFilterValues[K],
  ) => void;
  onReset: () => void;
  isFiltered: boolean;
}

export function TransactionFiltersBar({
  filters,
  categories,
  onFilterChange,
  onReset,
  isFiltered,
}: TransactionFiltersBarProps) {
  // If a type filter is active, filter the category choices accordingly
  const relevantCategories =
    filters.type === 'all'
      ? categories
      : categories.filter((c) => c.type === filters.type);

  return (
    <div
      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5"
      role="search"
      aria-label="Filter transactions"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* Type Filter */}
        <div>
          <label
            htmlFor="filter-type"
            className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1"
          >
            Type
          </label>
          <select
            id="filter-type"
            value={filters.type}
            onChange={(e) => {
              const newType = e.target.value as TransactionFilterValues['type'];
              onFilterChange('type', newType);
              // Reset category if type no longer matches
              if (filters.categoryId > 0) {
                const match = categories.find((c) => c.id === filters.categoryId);
                if (match && newType !== 'all' && match.type !== newType) {
                  onFilterChange('categoryId', 0);
                }
              }
            }}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs sm:text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <option value="all">All Types</option>
            <option value="expense">Expenses Only</option>
            <option value="income">Income Only</option>
          </select>
        </div>

        {/* Category Filter */}
        <div>
          <label
            htmlFor="filter-category"
            className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1"
          >
            Category
          </label>
          <select
            id="filter-category"
            value={filters.categoryId}
            onChange={(e) => onFilterChange('categoryId', Number(e.target.value))}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs sm:text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <option value={0}>All Categories</option>
            {relevantCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
        </div>

        {/* Start Date */}
        <div>
          <label
            htmlFor="filter-start-date"
            className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1"
          >
            Start Date
          </label>
          <input
            id="filter-start-date"
            type="date"
            value={filters.startDate}
            min="1900-01-01"
            max="9999-12-31"
            onChange={(e) => onFilterChange('startDate', e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs sm:text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          />
        </div>

        {/* End Date */}
        <div>
          <label
            htmlFor="filter-end-date"
            className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1"
          >
            End Date
          </label>
          <input
            id="filter-end-date"
            type="date"
            value={filters.endDate}
            min="1900-01-01"
            max="9999-12-31"
            onChange={(e) => onFilterChange('endDate', e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs sm:text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          />
        </div>

        {/* Note Search */}
        <div>
          <label
            htmlFor="filter-search"
            className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1"
          >
            Search Notes
          </label>
          <div className="relative">
            <input
              id="filter-search"
              type="text"
              value={filters.q}
              onChange={(e) => onFilterChange('q', e.target.value)}
              placeholder="e.g. coffee, lunch..."
              maxLength={100}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-3 pr-8 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            />
            {filters.q && (
              <button
                type="button"
                onClick={() => onFilterChange('q', '')}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-200"
                aria-label="Clear note search text"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Status & Reset Action */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-xs">
        <p className="text-slate-400">
          Search matches note text (ASCII case-insensitive matching).
        </p>

        {isFiltered && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <svg
              className="h-3.5 w-3.5 text-slate-400"
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
            <span>Reset filters</span>
          </button>
        )}
      </div>
    </div>
  );
}

