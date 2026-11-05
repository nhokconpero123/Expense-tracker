import { useRef, useState } from 'react';
import { useTransactionDialog } from '../hooks/useTransactionDialog';
import { resetDemo } from '../lib/demoRepository';
import { budgetButtonClass } from './BudgetCard';

export function DemoNotice() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const cancel = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const dialog = useTransactionDialog(open, pending, () => setOpen(false), cancel);
  async function confirm() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(null);
    try { await resetDemo(); setOpen(false); setNotice('Demo reset. Original November 2026 transactions and budgets restored.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Reset failed. Please allow browser storage and retry.'); }
    finally { busy.current = false; setPending(false); }
  }
  return <aside aria-label="Interactive demo information" className="border-b border-emerald-800 bg-emerald-950 px-4 py-3 text-center text-sm text-emerald-100">
    <p>Interactive portfolio demo. All financial data is fictional and saved only in this browser. You can add, edit, delete, or reset demo data.</p>
    <details className="my-2"><summary className="cursor-pointer">Storage and privacy</summary>
      <p className="mx-auto mt-2 max-w-3xl">Changes are not synced to an account or other devices. Independent browser profiles have separate data; people and tabs sharing this browser profile share demo state. Clearing site storage may remove changes. Private browsing may limit persistence. Use fictional information only. This is not a production financial service.</p>
    </details>
    <button type="button" className={budgetButtonClass} onClick={() => { setError(null); setOpen(true); }}>Reset Demo</button>
    <p role="status" aria-live="polite">{notice}</p>
    {open && <dialog {...dialog} aria-modal="true" aria-labelledby="reset-demo-title" aria-describedby="reset-demo-description"
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 backdrop:bg-slate-950/80">
      <h2 id="reset-demo-title" className="text-lg font-bold">Reset Demo?</h2>
      <p id="reset-demo-description" className="my-4">This discards all browser-local demo changes, including transactions and budgets, and restores the original fictional November 2026 dataset. Other tabs in this browser profile will also update.</p>
      {error && <p role="alert" className="my-3 text-rose-300">{error}</p>}
      <div className="flex justify-end gap-3">
        <button ref={cancel} type="button" disabled={pending} className={budgetButtonClass} onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" disabled={pending} className={budgetButtonClass} onClick={() => { void confirm(); }}>{pending ? 'Resetting...' : 'Confirm reset'}</button>
      </div>
    </dialog>}
  </aside>;
}
