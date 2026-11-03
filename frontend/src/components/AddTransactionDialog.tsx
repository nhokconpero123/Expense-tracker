import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Category, CreateTransactionPayload, TransactionType } from '../lib/api';
import { getTodayLocalDate, isValidDate } from '../lib/date';
import { parseUsdToCents } from '../lib/money';

export interface AddTransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onSubmit: (
    payload: CreateTransactionPayload,
  ) => Promise<{ success: boolean; refreshFailed?: boolean; error?: string }>;
}

export function AddTransactionDialog({
  isOpen,
  onClose,
  categories,
  onSubmit,
}: AddTransactionDialogProps) {
  const [type, setType] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState<string>('');
  const [categoryId, setCategoryId] = useState<number>(0);
  const [date, setDate] = useState<string>(() => getTodayLocalDate());
  const [note, setNote] = useState<string>('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const amountInputRef = useRef<HTMLInputElement>(null);

  // Available categories matching the selected type
  const filteredCategories = categories.filter((category) => category.type === type);

  // Focus amount input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setFieldErrors({});
      setSubmitError(null);
      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  // When type changes, clear category selection if it belongs to a different type
  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy['categoryId'];
      return copy;
    });
    const currentCategoryMatches = categories.some(
      (category) => category.id === categoryId && category.type === newType,
    );
    if (!currentCategoryMatches) {
      setCategoryId(0);
    }
  };

  const validate = (): { valid: boolean; cents?: number | undefined } => {
    const errors: Record<string, string> = {};

    // Validate amount
    let cents: number | undefined;
    if (!amountStr.trim()) {
      errors['amount'] = 'Amount is required';
    } else {
      try {
        cents = parseUsdToCents(amountStr.trim());
      } catch (err: unknown) {
        errors['amount'] =
          err instanceof Error
            ? err.message
            : 'Amount must be between 0.01 and 1,000,000.00 with at most 2 decimal places';
      }
    }

    // Validate category
    if (categoryId <= 0) {
      errors['categoryId'] = 'Please select a category';
    }

    // Validate date
    if (!date) {
      errors['date'] = 'Date is required';
    } else if (!isValidDate(date)) {
      errors['date'] = 'Please enter a valid date in YYYY-MM-DD format (1900-9999)';
    }

    // Validate note
    if (note.includes('\0')) {
      errors['note'] = 'Note must not contain NUL characters';
    } else if (note.trim().length > 500) {
      errors['note'] = 'Note must not exceed 500 characters';
    }

    setFieldErrors(errors);
    return { valid: Object.keys(errors).length === 0, cents };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    setSubmitError(null);
    const { valid, cents } = validate();
    if (!valid || cents === undefined) {
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: CreateTransactionPayload = {
        type,
        amountCents: cents,
        categoryId,
        date,
      };
      const trimmedNote = note.trim();
      if (trimmedNote) {
        payload.note = trimmedNote;
      }

      const result = await onSubmit(payload);

      if (result.success) {
        // Reset form fields
        setAmountStr('');
        setCategoryId(0);
        setDate(getTodayLocalDate());
        setNote('');
        setFieldErrors({});
        setSubmitError(null);
        onClose();
      } else {
        // Requirement 18: Preserve entered fields on error
        setSubmitError(result.error || 'Failed to save transaction. Please check your input.');
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-transaction-title"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 id="add-transaction-title" className="text-lg font-bold text-slate-100">
              Record Transaction
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Add a new income or expense entry to your ledger.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            aria-label="Close dialog"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {submitError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-rose-800/80 bg-rose-950/40 p-3 text-xs text-rose-200"
          >
            <p className="font-semibold">Unable to save transaction</p>
            <p className="mt-0.5">{submitError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Transaction Type Segmented Toggle */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">
              Type
            </label>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => handleTypeChange('expense')}
                className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  type === 'expense'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Expense</span>
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('income')}
                className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  type === 'income'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Income</span>
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label
              htmlFor="tx-amount"
              className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1"
            >
              Amount (USD) <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-slate-400">
                $
              </span>
              <input
                id="tx-amount"
                ref={amountInputRef}
                type="text"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                aria-invalid={Boolean(fieldErrors['amount'])}
                aria-describedby={fieldErrors['amount'] ? 'tx-amount-error' : undefined}
                className={`w-full rounded-lg border bg-slate-950 py-2 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 ${
                  fieldErrors['amount']
                    ? 'border-rose-500 focus-visible:ring-rose-400'
                    : 'border-slate-800 focus-visible:ring-emerald-400'
                }`}
              />
            </div>
            {fieldErrors['amount'] && (
              <p id="tx-amount-error" className="mt-1 text-xs text-rose-400">
                {fieldErrors['amount']}
              </p>
            )}
          </div>

          {/* Category */}
          <div>
            <label
              htmlFor="tx-category"
              className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1"
            >
              Category <span className="text-rose-400">*</span>
            </label>
            <select
              id="tx-category"
              value={categoryId || ''}
              onChange={(e) => setCategoryId(Number(e.target.value))}
              aria-invalid={Boolean(fieldErrors['categoryId'])}
              aria-describedby={fieldErrors['categoryId'] ? 'tx-category-error' : undefined}
              className={`w-full rounded-lg border bg-slate-950 px-3 py-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 ${
                fieldErrors['categoryId']
                  ? 'border-rose-500 focus-visible:ring-rose-400'
                  : 'border-slate-800 focus-visible:ring-emerald-400'
              }`}
            >
              <option value="" disabled>
                Select a category
              </option>
              {filteredCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {fieldErrors['categoryId'] && (
              <p id="tx-category-error" className="mt-1 text-xs text-rose-400">
                {fieldErrors['categoryId']}
              </p>
            )}
          </div>

          {/* Date */}
          <div>
            <label
              htmlFor="tx-date"
              className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1"
            >
              Transaction Date <span className="text-rose-400">*</span>
            </label>
            <input
              id="tx-date"
              type="date"
              value={date}
              min="1900-01-01"
              max="9999-12-31"
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={Boolean(fieldErrors['date'])}
              aria-describedby={fieldErrors['date'] ? 'tx-date-error' : undefined}
              className={`w-full rounded-lg border bg-slate-950 px-3 py-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 ${
                fieldErrors['date']
                  ? 'border-rose-500 focus-visible:ring-rose-400'
                  : 'border-slate-800 focus-visible:ring-emerald-400'
              }`}
            />
            {fieldErrors['date'] && (
              <p id="tx-date-error" className="mt-1 text-xs text-rose-400">
                {fieldErrors['date']}
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="tx-note"
                className="block text-xs font-medium uppercase tracking-wider text-slate-400"
              >
                Note (Optional)
              </label>
              <span className="text-[11px] text-slate-400 font-mono">
                {note.length}/500
              </span>
            </div>
            <textarea
              id="tx-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Weekly grocery trip"
              aria-invalid={Boolean(fieldErrors['note'])}
              aria-describedby={fieldErrors['note'] ? 'tx-note-error' : undefined}
              className={`w-full rounded-lg border bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 ${
                fieldErrors['note']
                  ? 'border-rose-500 focus-visible:ring-rose-400'
                  : 'border-slate-800 focus-visible:ring-emerald-400'
              }`}
            />
            {fieldErrors['note'] && (
              <p id="tx-note-error" className="mt-1 text-xs text-rose-400">
                {fieldErrors['note']}
              </p>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Transaction</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
