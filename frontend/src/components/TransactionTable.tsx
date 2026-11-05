import { isPublicDemo } from '../lib/deployment';
import type { Transaction, TransactionListMeta } from '../lib/api';
import { formatDateDisplay } from '../lib/date';
import { formatCentsToUsd } from '../lib/money';

export interface TransactionTableProps {
  transactions: Transaction[];
  meta: TransactionListMeta;
  isLoading: boolean;
  onPageChange: (newPage: number) => void;
  isFiltered: boolean;
  onResetFilters: () => void;
  onOpenAddModal: () => void;
  onEditTransaction?: (transaction: Transaction, triggerElement: HTMLElement | null) => void;
  onDeleteTransaction?: (transaction: Transaction, triggerElement: HTMLElement | null) => void;
}

export function TransactionTable({
  transactions,
  meta,
  isLoading,
  onPageChange,
  isFiltered,
  onResetFilters,
  onOpenAddModal,
  onEditTransaction,
  onDeleteTransaction,
}: TransactionTableProps) {
  const { page, totalPages, total, pageSize } = meta;

  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6" aria-busy="true">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 w-full rounded-lg bg-slate-800/60 motion-safe:animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-6 py-14 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-400"
          aria-hidden="true"
        >
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
        </div>

        <h3 className="mt-4 text-base font-semibold text-slate-200">
          {isFiltered ? 'No transactions match your filters' : 'No transactions recorded yet'}
        </h3>
        <p className="mt-1 text-sm text-slate-400 max-w-sm">
          {isFiltered
            ? 'Try adjusting your type, category, date range, or search term to see more results.'
            : 'Get started by recording your first income or expense transaction.'}
        </p>

        <div className="mt-5 flex items-center gap-3">
          {isFiltered ? (
            <button
              type="button"
              onClick={onResetFilters}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Reset Filters
            </button>
          ) : (
            <button
              type="button"
              disabled={isPublicDemo} onClick={onOpenAddModal}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add Transaction</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Responsive Table / Card Container */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th scope="col" className="py-3 px-4 sm:px-6">
                  Date
                </th>
                <th scope="col" className="py-3 px-4">
                  Type
                </th>
                <th scope="col" className="py-3 px-4">
                  Category
                </th>
                <th scope="col" className="py-3 px-4">
                  Note
                </th>
                <th scope="col" className="py-3 px-4 sm:px-6 text-right">
                  Amount
                </th>
                <th scope="col" className="py-3 px-4 sm:px-6 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {transactions.map((tx) => {
                const isIncome = tx.type === 'income';
                const formattedAmount = formatCentsToUsd(tx.amountCents);
                const readableAmount = isIncome ? `+${formattedAmount}` : `-${formattedAmount}`;
                const editLabel = `Edit transaction from ${formatDateDisplay(tx.date)} for ${readableAmount}`;
                const deleteLabel = `Delete transaction from ${formatDateDisplay(tx.date)} for ${readableAmount}`;

                return (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Date */}
                    <td className="py-3.5 px-4 sm:px-6 font-medium text-slate-200 whitespace-nowrap">
                      {formatDateDisplay(tx.date)}
                    </td>

                    {/* Type Badge */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                          isIncome
                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                            : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {isIncome ? 'Income' : 'Expense'}
                      </span>
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-4 font-medium text-slate-200 whitespace-nowrap">
                      {tx.categoryName}
                    </td>

                    {/* Note */}
                    <td className="py-3.5 px-4 text-slate-400 max-w-xs truncate" title={tx.note || undefined}>
                      {tx.note ? tx.note : <span className="text-slate-400 italic">—</span>}
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap font-mono font-semibold">
                      <span className={isIncome ? 'text-emerald-400' : 'text-rose-400'}>
                        {readableAmount}
                      </span>
                    </td>

                    {/* Actions (Edit / Delete) */}
                    <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          disabled={isPublicDemo}
                          onClick={(e) => onEditTransaction?.(tx, e.currentTarget)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 transition-colors"
                          aria-label={editLabel}
                          title="Edit transaction"
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
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          disabled={isPublicDemo}
                          onClick={(e) => onDeleteTransaction?.(tx, e.currentTarget)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-950/50 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 transition-colors"
                          aria-label={deleteLabel}
                          title="Delete transaction"
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
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-1 text-xs sm:text-sm text-slate-400">
        <div>
          <span>
            Showing <strong className="font-semibold text-slate-200">{startIndex}</strong> to{' '}
            <strong className="font-semibold text-slate-200">{endIndex}</strong> of{' '}
            <strong className="font-semibold text-slate-200">{total}</strong> transactions
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="mr-2">
            Page {page} of {Math.max(1, totalPages)}
          </span>

          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="inline-flex h-8 items-center rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous page"
          >
            Previous
          </button>

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="inline-flex h-8 items-center rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
