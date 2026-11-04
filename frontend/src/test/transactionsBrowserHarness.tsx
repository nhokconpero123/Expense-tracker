import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MonthProvider, useMonth } from '../context/MonthContext';
import { MonthSelector } from '../components/MonthSelector';
import { Transactions } from '../pages/Transactions';
import type { Transaction, CreateTransactionPayload } from '../lib/api';
import '../styles.css';

type Mode = 'success' | 'error' | 'network' | 'hold' | 'hold_error';
type Resource = 'categories' | 'list' | 'write';
const modes: Record<Resource, Mode> = { categories: new URLSearchParams(location.search).has('categoryError') ? 'error' : 'success', list: 'success', write: 'success' };
const categories = [{ id: 4, name: 'Food', type: 'expense' }, { id: 1, name: 'Salary', type: 'income' }];
const original: Transaction = { id: 1, type: 'expense', categoryId: 4, categoryName: 'Food', amountCents: 1234,
  date: '2024-02-03', note: 'Original lunch', createdAt: '2024-02-03T12:00:00.000Z', updatedAt: '2024-02-03T12:00:00.000Z' };
let rows = [{ ...original }];
let nextId = 2;
const requests: { id: number; method: string; url: string; body: unknown }[] = [];
const pending = new Map<number, () => void>();
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin);
  const method = init?.method ?? 'GET';
  const resource: Resource = url.pathname === '/api/categories' && method === 'GET' ? 'categories' :
    url.pathname === '/api/transactions' && method === 'GET' ? 'list' : 'write';
  if (url.origin !== location.origin || !['/api/categories', '/api/transactions'].some(p => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
    throw new Error('Unexpected request in isolated transaction tests');
  }
  const id = requests.length + 1;
  const body: CreateTransactionPayload | null = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
  requests.push({ id, method, url: url.pathname + url.search, body });
  const mode = modes[resource];
  const snapshot = rows.map(row => ({ ...row }));
  // Deliberately settle even aborted reads to exercise production stale-response guards.
  if (mode.startsWith('hold')) await new Promise<void>(resolve => pending.set(id, resolve));
  if (mode === 'network') throw new TypeError('Simulated network failure');
  if (mode === 'error' || mode === 'hold_error') return Response.json({ error: { code: 'INTERNAL_ERROR', message: `Simulated ${resource} failure` } }, { status: 500 });
  if (resource === 'categories') return Response.json({ data: categories });
  if (resource === 'list') {
    const q = url.searchParams;
    const filtered = snapshot.filter(row => (!q.has('type') || row.type === q.get('type')) &&
      (!q.has('categoryId') || row.categoryId === Number(q.get('categoryId'))) &&
      (!q.has('q') || row.note.toLowerCase().includes(q.get('q')!.toLowerCase())));
    const page = Number(q.get('page') ?? 1), pageSize = Number(q.get('pageSize') ?? 20);
    return Response.json({ data: filtered.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, pageSize, total: filtered.length, totalPages: Math.ceil(filtered.length / pageSize) } });
  }
  const target = Number(url.pathname.split('/').at(-1));
  if (method === 'DELETE') { rows = rows.filter(row => row.id !== target); return new Response(null, { status: 204 }); }
  if (!body || (method !== 'POST' && method !== 'PUT')) throw new Error('Unexpected mutation');
  const saved = { ...original, ...body, id: method === 'POST' ? nextId++ : target,
    categoryName: categories.find(c => c.id === body.categoryId)?.name ?? '' };
  if (method === 'POST') rows.push(saved); else rows = rows.map(row => row.id === target ? saved : row);
  return Response.json({ data: saved }, { status: method === 'POST' ? 201 : 200 });
};
const harness = {
  configure(resource: Resource, mode: Mode) { modes[resource] = mode; },
  release(id?: number) {
    for (const [key, resolve] of pending) if (id === undefined || id === key) { pending.delete(key); resolve(); }
  },
  setRowCount(count: number) { rows = Array.from({ length: count }, (_, i) => ({ ...original, id: i + 1, note: `Row ${i + 1}` })); nextId = count + 1; },
  requests,
};
declare global { interface Window { transactionsHarness: typeof harness } }
window.transactionsHarness = harness;
function MonthActions() {
  const state = useMonth();
  return <aside aria-label="Test month controls">
    <MonthSelector /><output id="selected-month">{state.month}</output><output id="transaction-revision">{state.summaryRevision}</output>
    <button onClick={() => state.setMonth('1900-01')}>Select minimum month</button>
    <button onClick={() => state.setMonth('9999-12')}>Select maximum month</button>
    <button onClick={() => state.setMonth('2024-12')}>Select December</button>
    <button onClick={state.goToPreviousMonth}>Direct previous</button><button onClick={state.goToNextMonth}>Direct next</button>
  </aside>;
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing test root');
createRoot(root).render(<StrictMode><MonthProvider initialMonth="2024-02">
  <main className="mx-auto max-w-7xl p-4"><Transactions /></main><MonthActions />
</MonthProvider></StrictMode>);
