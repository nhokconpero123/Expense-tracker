import { useEffect, useRef, useState } from 'react';
import { useMonth } from '../context/MonthContext';
import type { TransactionFilters } from '../lib/api';
import { transactionsToCsv } from '../lib/transactionCsv';
import { collectTransactions, downloadTransactionCsv } from '../lib/transactionExport';

export function TransactionExport({ filters }: { filters: TransactionFilters }) {
  const { summaryRevision } = useMonth();
  const identity = JSON.stringify([filters, summaryRevision]);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const controllerRef = useRef<AbortController | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    setMessage(''); setError(false);
    return () => { controllerRef.current?.abort(); };
  }, [identity]);

  const start = async () => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    restoreFocus.current = false;
    const capturedIdentity = identity;
    setBusy(true); setError(false); setMessage('Preparing CSV export...');
    try {
      const rows = await collectTransactions({ ...filters }, controller.signal, (loaded, total) => {
        if (!controller.signal.aborted && currentIdentity.current === capturedIdentity) setMessage(`Preparing CSV: ${loaded} of ${total} transactions.`);
      });
      controller.signal.throwIfAborted();
      if (currentIdentity.current !== capturedIdentity) return;
      if (rows.length === 0) { setMessage('No transactions match the current filters. Nothing was downloaded.'); return; }
      const csv = transactionsToCsv(rows);
      controller.signal.throwIfAborted();
      downloadTransactionCsv(csv);
      setMessage(`CSV download started for ${rows.length} transactions.`);
    } catch (failure) {
      if (currentIdentity.current !== capturedIdentity) return;
      if (controller.signal.aborted) setMessage('CSV export canceled. Nothing was downloaded.');
      else { setError(true); setMessage(failure instanceof Error ? failure.message : 'CSV export failed. Try again.'); }
    } finally {
      if (controllerRef.current === controller) { controllerRef.current = null; setBusy(false); }
      if (restoreFocus.current && currentIdentity.current === capturedIdentity) requestAnimationFrame(() => buttonRef.current?.focus());
    }
  };

  const cancel = () => {
    restoreFocus.current = true;
    controllerRef.current?.abort();
  };

  return <section aria-label="CSV export" className="flex max-w-full flex-col gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <button ref={buttonRef} type="button" onClick={() => { void start(); }} disabled={busy}
        className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? 'Exporting CSV...' : 'Export CSV'}
      </button>
      {busy && <button type="button" onClick={cancel}
        className="rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">Cancel export</button>}
    </div>
    <p className="text-xs text-slate-400">All matching rows. Maximum 10,000 rows / 16 MiB.</p>
    <p role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'} className={`max-w-sm text-sm ${error ? 'text-rose-300' : 'text-slate-300'}`}>{message}</p>
  </section>;
}
