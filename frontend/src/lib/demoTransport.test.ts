import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from './api';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });
function browser() {
  vi.stubEnv('VITE_PUBLIC_DEMO_MODE', 'true');
  vi.stubEnv('VITE_API_BASE_URL', 'https://expense-tracker-oeow.onrender.com');
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  let queue = Promise.resolve();
  const request = vi.fn((_name: string, operation: () => unknown) => {
    const result = queue.then(operation); queue = result.then(() => undefined, () => undefined); return result;
  });
  vi.stubGlobal('window', { localStorage: storage });
  vi.stubGlobal('navigator', { locks: { request } });
  const network = vi.fn(() => { throw new Error('No network API is available.'); });
  vi.stubGlobal('fetch', network);
  return { values, storage, request, network };
}
describe('interactive demo through existing application clients', () => {
  it('exports fresh filtered records across pages after CRUD without any network fallback', async () => {
    const { network } = browser(); const api = await import('./api');
    const { collectTransactions } = await import('./transactionExport');
    const food = (await api.fetchCategories()).find(c => c.name === 'Food')!.id;
    const created: Transaction[] = [];
    for (let index = 0; index < 105; index++) created.push(await api.createTransaction({ type: 'expense', categoryId: food,
      amountCents: index + 1, date: '2026-11-30', note: `Q%_\\ export ${index}` }));
    await api.updateTransaction(created[0]!.id, { type: 'expense', categoryId: food, amountCents: 1234, date: '2026-11-30', note: 'Q%_\\ edited 日本語' });
    await api.deleteTransaction(created[1]!.id);
    const rows = await collectTransactions({ type: 'expense', categoryId: food, startDate: '2026-11-30', endDate: '2026-11-30', q: ' Q%_\\ ', page: 2 }, new AbortController().signal);
    expect(rows).toHaveLength(104); expect(rows[0]!.id).toBe(created.at(-1)!.id);
    expect(rows.find(row => row.id === created[0]!.id)).toMatchObject({ amountCents: 1234, note: 'Q%_\\ edited 日本語' });
    expect(rows.some(row => row.id === created[1]!.id)).toBe(false); expect(network).not.toHaveBeenCalled();
  });
  it('keeps transactions, budgets and all summary views on the same local data with no network fallback', async () => {
    const { network } = browser();
    const api = await import('./api'); const budgets = await import('./budgetApi');
    const categories = await api.fetchCategories();
    const food = categories.find(c => c.type === 'expense' && c.name === 'Food')!.id;
    const before = await api.fetchMonthlySummary('2026-11');
    const row = await api.createTransaction({ type: 'expense', amountCents: 500, categoryId: food, date: '2026-11-30' });
    expect((await api.fetchMonthlySummary('2026-11')).expenseCents).toBe(before.expenseCents + 500);
    expect((await budgets.fetchBudgets('2026-11')).items.find(b => b.categoryId === food)?.spentCents).toBe(36000);
    expect((await api.fetchTransactions({ q: '', pageSize: 100 })).meta.total).toBe(14);
    expect((await budgets.saveBudget(food, '2026-11', 36000)).status).toBe('at_limit');
    await api.updateTransaction(row.id, { type: 'expense', amountCents: 1000, categoryId: food, date: '2026-12-01' });
    expect((await api.fetchMonthlySummary('2026-11')).expenseCents).toBe(before.expenseCents);
    expect((await api.fetchMonthlySummary('2026-12')).expenseCents).toBe(1000);
    await api.deleteTransaction(row.id); await budgets.deleteBudget(food, '2026-11');
    expect((await api.fetchMonthlySummary('2026-12')).expenseCents).toBe(0);
    expect((await budgets.fetchBudgets('2026-11')).items.find(b => b.categoryId === food)?.status).toBe('no_budget');
    expect(network).not.toHaveBeenCalled();
  });
  it('serializes rapid repeated client mutations through the shared lock', async () => {
    const { network, request } = browser(); const api = await import('./api');
    const food = (await api.fetchCategories()).find(c => c.name === 'Food')!.id;
    const rows = await Promise.all(Array.from({ length: 30 }, () => api.createTransaction({ type: 'expense', amountCents: 1, categoryId: food, date: '2026-11-30' })));
    expect(new Set(rows.map(r => r.id)).size).toBe(30);
    expect((await api.fetchMonthlySummary('2026-11')).expenseCents).toBe(215530);
    expect(request).toHaveBeenCalledTimes(32); expect(network).not.toHaveBeenCalled();
  });
  it('does not mutate an aborted request or attempt a network fallback', async () => {
    const { values, network } = browser(); const { apiFetch } = await import('./deployment');
    const controller = new AbortController(); controller.abort();
    await expect(apiFetch('/api/categories', { signal: controller.signal })).rejects.toThrow();
    expect(values.size).toBe(0); expect(network).not.toHaveBeenCalled();
  });
  it('shows a safe error if Web Locks are unavailable', async () => {
    const { values, network } = browser(); vi.stubGlobal('navigator', {});
    const { apiFetch } = await import('./deployment');
    const response = await apiFetch('/api/categories');
    expect(response.status).toBe(503); expect((await response.json()).error.code).toBe('DEMO_STORAGE_UNAVAILABLE');
    expect(values.size).toBe(0); expect(network).not.toHaveBeenCalled();
  });
});
