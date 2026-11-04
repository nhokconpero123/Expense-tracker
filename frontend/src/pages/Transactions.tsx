import { useEffect, useRef, useState } from 'react';
import { AddTransactionDialog } from '../components/AddTransactionDialog';
import { DeleteTransactionDialog } from '../components/DeleteTransactionDialog';
import { TransactionFiltersBar } from '../components/TransactionFiltersBar';
import { TransactionTable } from '../components/TransactionTable';
import { INITIAL_FILTERS, useTransactions } from '../hooks/useTransactions';
import type { CreateTransactionPayload, Transaction } from '../lib/api';

export function Transactions() {
  const {
    transactions,
    meta,
    isLoading,
    error,
    filters,
    categories,
    isCategoriesLoading,
    categoriesError,
    retryCategories,
    lastSuccessfulRequestId,
    setFilter,
    resetFilters,
    setPage,
    refresh,
    addTransaction,
    editTransaction,
    removeTransaction,
  } = useTransactions();

  // Dialog & Active Target states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Focus restoration reference
  const headingRef = useRef<HTMLHeadingElement>(null);
  const deletingRef = useRef(false);

  // Status feedback banners
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSuccess = (message: string | null, expire = false) => {
    if (successTimer.current !== null) clearTimeout(successTimer.current);
    successTimer.current = null;
    setSuccessBanner(message);
    if (expire) successTimer.current = setTimeout(() => setSuccessBanner(null), 5000);
  };
  useEffect(() => () => { if (successTimer.current !== null) clearTimeout(successTimer.current); }, []);
  const [warningBanner, setWarningBanner] = useState<{ message: string; requestId: number } | null>(null);
  useEffect(() => {
    setWarningBanner(current => current && lastSuccessfulRequestId > current.requestId ? null : current);
  }, [lastSuccessfulRequestId, warningBanner?.requestId]);

  const isFiltered =
    filters.type !== INITIAL_FILTERS.type ||
    filters.categoryId !== INITIAL_FILTERS.categoryId ||
    filters.startDate !== INITIAL_FILTERS.startDate ||
    filters.endDate !== INITIAL_FILTERS.endDate ||
    filters.q !== INITIAL_FILTERS.q;

  // Add transaction handler
  const handleAddSubmit = async (payload: CreateTransactionPayload) => {
    showSuccess(null);
    setWarningBanner(null);

    const result = await addTransaction(payload);
    if (result.success) {
      showSuccess('Transaction saved successfully.');
      if (result.refreshFailed) {
        setWarningBanner({ message: 'Transaction was saved successfully, but the list failed to refresh. Please click refresh below.', requestId: result.refreshRequestId ?? 0 });
      } else {
        showSuccess('Transaction recorded successfully.', true);
      }
    }
    return result;
  };

  // Edit transaction handler
  const handleEditSubmit = async (payload: CreateTransactionPayload) => {
    if (!editingTransaction) {
      return { success: false, error: 'No transaction selected for editing' };
    }

    showSuccess(null);
    setWarningBanner(null);

    const result = await editTransaction(editingTransaction.id, payload);
    if (result.success) {
      showSuccess('Transaction saved successfully.');
      if (result.refreshFailed) {
        setWarningBanner({ message: 'Transaction was updated successfully, but the list failed to refresh. Please click refresh below.', requestId: result.refreshRequestId ?? 0 });
      } else {
        showSuccess('Transaction updated successfully.', true);
      }
    }
    return result;
  };

  // Delete transaction handler
  const handleDeleteConfirm = async () => {
    if (!deletingTransaction || deletingRef.current) return;
    deletingRef.current = true;

    setIsDeleting(true);
    setDeleteError(null);
    showSuccess(null);
    setWarningBanner(null);

    try {
      const result = await removeTransaction(deletingTransaction.id);
      if (result.success) {
        showSuccess('Transaction deleted successfully.');
        setDeletingTransaction(null);
        setIsDeleting(false);

        if (result.refreshFailed) {
          setWarningBanner({ message: 'Transaction was deleted successfully, but the list failed to refresh. Please click refresh below.', requestId: result.refreshRequestId ?? 0 });
        } else {
          showSuccess('Transaction deleted successfully.', true);
        }

      } else {
        setDeleteError(result.error || 'Failed to delete transaction. Please try again.');
        setIsDeleting(false);
      }
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setIsDeleting(false);
    } finally {
      deletingRef.current = false;
    }
  };

  const handleOpenEdit = (tx: Transaction) => setEditingTransaction(tx);
  const handleCloseEdit = () => setEditingTransaction(null);
  const handleOpenDelete = (tx: Transaction) => { setDeleteError(null); setDeletingTransaction(tx); };
  const handleCloseDelete = () => { if (!deletingRef.current) { setDeletingTransaction(null); setDeleteError(null); } };
  const handleOpenAdd = () => setIsAddModalOpen(true);
  const handleCloseAdd = () => setIsAddModalOpen(false);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 sm:text-3xl">
            Transactions
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Browse, search, record, and manage personal income and expense transactions.
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
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>

          {/* Add Transaction Button */}
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Transaction</span>
          </button>
        </div>
      </div>

      {/* Success Banner */}
      {successBanner && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-sm text-emerald-200"
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
            onClick={() => showSuccess(null)}
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

      {/* Warning Banner (e.g. Save succeeded but Refresh failed) */}
      {warningBanner && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-950/40 p-4 text-sm text-amber-200"
        >
          <div className="flex items-center gap-2.5">
            <svg
              className="h-5 w-5 text-amber-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>{warningBanner.message}</span>
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

      {isCategoriesLoading && <p role="status">Loading categories...</p>}
      {categoriesError && <section role="alert" aria-label="Category loading error" className="rounded-xl border border-rose-800 p-4 text-sm text-rose-200">
        <p>Failed to load categories: {categoriesError}</p>
        <button type="button" onClick={() => { void retryCategories(); }} disabled={isCategoriesLoading}
          className="mt-2 rounded-lg border border-slate-600 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">Retry categories</button>
      </section>}

      {/* Filters Bar */}
      <TransactionFiltersBar
        filters={filters}
        categories={categories}
        onFilterChange={setFilter}
        onReset={resetFilters}
        isFiltered={isFiltered}
      />

      {/* Transactions Table & Pagination */}
      {!error && <TransactionTable
        transactions={transactions}
        meta={meta}
        isLoading={isLoading}
        onPageChange={setPage}
        isFiltered={isFiltered}
        onResetFilters={resetFilters}
        onOpenAddModal={() => handleOpenAdd()}
        onEditTransaction={handleOpenEdit}
        onDeleteTransaction={handleOpenDelete}
      />}

      {/* Add Transaction Modal */}
      <AddTransactionDialog
        isOpen={isAddModalOpen}
        onClose={handleCloseAdd}
        categories={categories}
        isCategoriesLoading={isCategoriesLoading}
        categoriesError={categoriesError}
        retryCategories={retryCategories}
        fallbackFocus={headingRef}
        onSubmit={handleAddSubmit}
        mode="create"
      />

      {/* Edit Transaction Modal */}
      <AddTransactionDialog
        isOpen={Boolean(editingTransaction)}
        onClose={handleCloseEdit}
        categories={categories}
        isCategoriesLoading={isCategoriesLoading}
        categoriesError={categoriesError}
        retryCategories={retryCategories}
        fallbackFocus={headingRef}
        onSubmit={handleEditSubmit}
        mode="edit"
        initialTransaction={editingTransaction}
      />

      {/* Delete Confirmation Modal */}
      <DeleteTransactionDialog
        isOpen={Boolean(deletingTransaction)}
        transaction={deletingTransaction}
        onClose={handleCloseDelete}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
        deleteError={deleteError}
        fallbackFocus={headingRef}
      />
    </div>
  );
}
