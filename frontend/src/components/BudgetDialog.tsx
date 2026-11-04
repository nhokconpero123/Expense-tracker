import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { BudgetEditor, BudgetStore } from '../lib/budgetStore';
import { formatMonthDisplay } from '../lib/date';
import { formatCentsToUsd } from '../lib/money';
import { budgetButtonClass } from './BudgetCard';

export function BudgetDialog({ editor, pending, store, fallbackFocus }: {
  editor: BudgetEditor; pending: boolean; store: BudgetStore; fallbackFocus: RefObject<HTMLHeadingElement | null>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const removing = editor.mode === 'remove';
  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal();
    (removing ? cancelRef.current : amountRef.current)?.focus();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
      else fallbackFocus.current?.focus();
    };
  }, [removing, fallbackFocus]);
  useLayoutEffect(() => {
    // Disabled pending controls need an in-dialog keyboard target.
    if (pending) dialogRef.current?.focus();
  }, [pending]);
  useEffect(() => {
    if (editor.amountError) amountRef.current?.focus();
    else if (editor.error) errorRef.current?.focus();
  }, [editor.amountError, editor.error]);

  return (
    <dialog ref={dialogRef} aria-labelledby="budget-dialog-title" aria-describedby="budget-dialog-description"
      aria-modal="true" onCancel={event => { event.preventDefault(); store.cancel(); }}
      onKeyDown={event => {
        if (event.key === 'Tab' && !event.defaultPrevented) {
          const dialog = event.currentTarget;
          const controls = [...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')]
            .filter(control => control.tabIndex >= 0 && !control.matches(':disabled') && control.getClientRects().length > 0);
          const first = controls[0], last = controls.at(-1);
          // Native modality keeps the background inert; explicitly wrap the focus cycle.
          if (!first || !last) { event.preventDefault(); dialog.focus(); }
          else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
            event.preventDefault(); first.focus();
          }
          return;
        }
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        // Keep dismissal local and use the same pending-state guard as Cancel.
        event.preventDefault();
        event.stopPropagation();
        store.cancel();
      }}
      onClose={event => {
        const dialog = event.currentTarget;
        // Ignore queued close events from effect cleanup after a modal was reopened.
        if (dialog.open || !dialog.isConnected) return;
        if (store.getState().pending) dialog.showModal();
        else store.cancel();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-600 bg-slate-900 p-6 text-slate-100 shadow-2xl backdrop:bg-slate-950/85">
      <h2 id="budget-dialog-title" className="text-xl font-bold">{removing ? 'Remove budget' : editor.item.amountCents === null ? 'Set budget' : 'Edit budget'}</h2>
      <p id="budget-dialog-description" className="mt-2 text-sm text-slate-300">
        {editor.item.categoryName} · {formatMonthDisplay(editor.item.month)}.
        {removing && ` Remove the ${formatCentsToUsd(editor.item.amountCents ?? 0)} limit? All transactions and spending will be preserved.`}
      </p>
      <form noValidate onSubmit={event => { event.preventDefault(); void store.submit(); }} aria-busy={pending}>
        {!removing && <div className="mt-5">
          <label htmlFor="budget-amount" className="block text-sm font-medium">Monthly budget (USD)</label>
          <input ref={amountRef} id="budget-amount" type="text" inputMode="decimal" autoComplete="off" required
            value={editor.amount} disabled={pending} onChange={event => store.setAmount(event.target.value)}
            aria-invalid={!!editor.amountError} aria-describedby={`budget-amount-hint${editor.amountError ? ' budget-amount-error' : ''}`}
            className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-600 bg-slate-950 px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50" />
          <p id="budget-amount-hint" className="mt-2 text-xs text-slate-400">Enter $0.01 to $1,000,000.00, with up to two decimal places.</p>
          {editor.amountError && <p role="alert" id="budget-amount-error" className="mt-2 text-sm text-rose-300">{editor.amountError}</p>}
        </div>}
        {editor.error && <div ref={errorRef} tabIndex={-1} role="alert" className="mt-4 rounded-lg border border-rose-700 p-3 text-sm text-rose-300 focus-visible:outline focus-visible:outline-2">{editor.error}</div>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" disabled={pending} onClick={() => store.cancel()} className={budgetButtonClass}>Cancel</button>
          <button type="submit" disabled={pending} className={`${budgetButtonClass} ${removing ? 'border-rose-500 text-rose-300' : 'border-emerald-500 text-emerald-300'}`}>
            {pending ? (removing ? 'Removing...' : 'Saving...') : removing ? 'Remove budget' : 'Save budget'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
