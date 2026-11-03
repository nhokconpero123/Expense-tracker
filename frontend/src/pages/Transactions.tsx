import { useState } from 'react';
import { AddTransactionDialog } from '../components/AddTransactionDialog';
import { TransactionFiltersBar } from '../components/TransactionFiltersBar';
import { TransactionTable } from '../components/TransactionTable';
import { INITIAL_FILTERS, useTransactions } from '../hooks/useTransactions';

export function Transactions() {
  const {
    transactions,
    meta,
    isLoading,
    error,
    filters,
    categories,
    setFilter,
    resetFilters,
    setPage,
    refresh,
    addTransaction,
  } = useTransactions();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [warningBanner, setWarningBanner] = useState<string | null>(null);

  const isFiltered =
    filters.type !== INITIAL_FILTERS.type ||
    filters.categoryId !== INITIAL_FILTERS.categoryId ||
    filters.startDate !== INITIAL_FILTERS.startDate ||
    filters.endDate !== INITIAL_FILTERS.endDate ||
    filters.q !== INITIAL_FILTERS.q;

  const handleAddSubmit = async (payload: Parameters<typeof addTransaction>[0]) => {
    setSuccessBanner(null);
    setWarningBanner(null);

    const result = await addTransaction(payload);
    if (result.success) {
      if (result.refreshFailed) {
        // Requirement 22: Save succeeded but refresh failed
        setWarningBanner(
          'Transaction was saved successfully, but the list failed to refresh. Please click refresh below.',
        );
      } else {
        setSuccessBanner('Transaction recorded successfully.');
        setTimeout(() => {
          setSuccessBanner(null);
        }, 5000);
      }
    }
    return result;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
            Transactions
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Browse, search, and record personal income and expense transactions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh List Button */}
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Refresh transaction list"
            title="Refresh transaction list"
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

          {/* Add Transaction Button */}
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
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
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Transaction</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-sm text-emerald-300"
        >
          <div className="flex items-center gap-2.5">
            <svg
              className="h-5 w-5 text-emerald-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-400 hover:text-emerald-200"
            aria-label="Dismiss success message"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Warning Notification Banner (Requirement 22) */}
      {warningBanner && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start justify-between rounded-xl border border-amber-500/30 bg-amber-950/40 p-4 text-sm text-amber-200"
        >
          <div className="flex items-start gap-2.5">
            <svg
              className="h-5 w-5 shrink-0 text-amber-400 mt-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <p className="font-semibold text-amber-300">Saved with refresh issue</p>
              <p className="mt-0.5">{warningBanner}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setWarningBanner(null)}
            className="text-amber-400 hover:text-amber-200"
            aria-label="Dismiss warning message"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-rose-800/80 bg-rose-950/40 p-4 text-sm text-rose-200"
        >
          <div className="flex items-center gap-2.5">
            <svg
              className="h-5 w-5 text-rose-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <TransactionFiltersBar
        filters={filters}
        categories={categories}
        onFilterChange={setFilter}
        onReset={resetFilters}
        isFiltered={isFiltered}
      />

      {/* Transactions Table & Pagination */}
      <TransactionTable
        transactions={transactions}
        meta={meta}
        isLoading={isLoading}
        onPageChange={setPage}
        isFiltered={isFiltered}
        onResetFilters={resetFilters}
        onOpenAddModal={() => setIsAddModalOpen(true)}
      />

      {/* Add Transaction Modal */}
      <AddTransactionDialog
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        categories={categories}
        onSubmit={handleAddSubmit}
      />
    </div>
  );
}

