import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MonthProvider } from '../context/MonthContext';
import { Budgets } from '../pages/Budgets';
import type { BudgetItem } from '../lib/budgetApi';
import '../styles.css';

// Isolated test entry only: every fetch is intercepted before the production page mounts.
const limits = new Map<number, number>([[4, 10000]]);
const categories = [{ id: 4, name: 'Food', spent: 7500 }, { id: 6, name: 'Transport', spent: 2500 }];
const month = '2024-02';
function item(id: number): BudgetItem {
  const category = categories.find(row => row.id === id);
  if (!category) throw new Error('Unknown fixture category');
  const amount = limits.get(id) ?? null;
  return { categoryId: id, categoryName: category.name, month, amountCents: amount, spentCents: category.spent,
    remainingCents: amount === null ? null : amount - category.spent,
    utilizationPercent: amount === null ? null : Math.round(category.spent * 1000 / amount) / 10,
    status: amount === null ? 'no_budget' : category.spent < amount ? 'under' : category.spent === amount ? 'at_limit' : 'over' };
}
let writeMode: 'success' | 'error' | 'hold' | 'hold_error' = 'success';
const pending: (() => void)[] = [];
const requests: { method: string; path: string; body: unknown }[] = [];
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin);
  const method = init?.method ?? 'GET';
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/budgets')) throw new Error('Unexpected budget fixture request');
  requests.push({ method, path: url.pathname + url.search, body });
  if (method === 'GET') {
    if (url.pathname !== '/api/budgets' || url.searchParams.get('month') !== month) throw new Error('Unexpected budget fixture month');
    return Response.json({ data: { month, items: categories.map(category => item(category.id)) } });
  }
  const match = /^\/api\/budgets\/(4|6)\/2024-02$/.exec(url.pathname);
  if (!match || (method !== 'PUT' && method !== 'DELETE')) throw new Error('Unexpected budget mutation path');
  const id = Number(match[1]), mode = writeMode;
  if (mode.startsWith('hold')) await new Promise<void>(resolve => pending.push(resolve));
  if (mode === 'error' || mode === 'hold_error') return Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Simulated budget write failure' } }, { status: 500 });
  if (method === 'DELETE') { limits.delete(id); return new Response(null, { status: 204 }); }
  if (!body || typeof body !== 'object' || !('amountCents' in body) || typeof body.amountCents !== 'number') throw new Error('Unexpected budget payload');
  limits.set(id, body.amountCents);
  return Response.json({ data: item(id) });
};
const harness = {
  requests, backgroundActivations: 0,
  configure(mode: typeof writeMode) { writeMode = mode; },
  release() { pending.splice(0).forEach(resolve => resolve()); },
  snapshot() { return categories.map(category => item(category.id)); },
};
declare global { interface Window { budgetHarness: typeof harness } }
window.budgetHarness = harness;
const root = document.getElementById('root');
if (!root) throw new Error('Missing test root');
createRoot(root).render(<StrictMode><MonthProvider initialMonth={month}>
  <button id="budget-background" className="m-4" onClick={() => { harness.backgroundActivations++; }}>Background action</button>
  <main className="mx-auto max-w-7xl p-4"><Budgets /></main>
</MonthProvider></StrictMode>);
