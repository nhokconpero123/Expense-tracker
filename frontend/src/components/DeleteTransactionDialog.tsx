import { useRef, type RefObject } from 'react';
import { useTransactionDialog } from '../hooks/useTransactionDialog';
import type { Transaction } from '../lib/api';
import { formatDateDisplay } from '../lib/date';
import { formatCentsToUsd } from '../lib/money';

export interface DeleteTransactionDialogProps {
  isOpen: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
  deleteError: string | null;
  fallbackFocus?: RefObject<HTMLHeadingElement | null>;
}

export function DeleteTransactionDialog({
  isOpen,
  transaction,
  onClose,
  onConfirm,
  isDeleting,
  deleteError,
  fallbackFocus,
}: DeleteTransactionDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const dialog = useTransactionDialog(isOpen && transaction !== null, isDeleting, onClose, cancelButtonRef, fallbackFocus);

  if (!isOpen || !transaction) {
    return null;
  }

  const isIncome = transaction.type === 'income';
  const formattedAmount = formatCentsToUsd(transaction.amountCents);

  return (
    <dialog {...dialog}
      role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl bg-slate-900 p-0 text-slate-100 backdrop:bg-slate-950/80">
      {/* Modal Dialog Content */}
      <div className="relative w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 shadow-2xl shadow-rose-950/20">
        <div className="flex items-start gap-4">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20"
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
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <h2 id="delete-dialog-title" className="text-lg font-bold text-slate-100">
              Delete Transaction
            </h2>
            <p id="delete-dialog-description" className="mt-1 text-sm text-slate-400">
              Are you sure you want to permanently remove this transaction? This action cannot be undone.
            </p>
          </div>
        </div>

        {/* Transaction Summary Box */}
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Date</span>
            <span className="font-medium text-slate-200">{formatDateDisplay(transaction.date)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Type</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
                isIncome
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                  : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
              }`}
            >
              {isIncome ? 'Income' : 'Expense'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Category</span>
            <span className="font-medium text-slate-200">{transaction.categoryName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Amount</span>
            <span
              className={`font-mono font-semibold ${
                isIncome ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isIncome ? `+${formattedAmount}` : `-${formattedAmount}`}
            </span>
          </div>
          {transaction.note && (
            <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-1">
              <span className="text-xs text-slate-400">Note</span>
              <span className="text-xs text-slate-300 italic wrap-break-word">{transaction.note}</span>
            </div>
          )}
        </div>

        {/* Error message */}
        {deleteError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-rose-800/80 bg-rose-950/40 p-3 text-xs text-rose-300"
          >
            {deleteError}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="h-10 rounded-xl border border-slate-700 bg-slate-800 px-4 text-sm font-semibold text-slate-200 hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="h-10 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete Transaction'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

