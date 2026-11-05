import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });
describe('deployment transport', () => {
  it('preserves local API paths by default', async () => {
    vi.stubEnv('VITE_API_BASE_URL', ''); vi.stubEnv('VITE_PUBLIC_DEMO_MODE', 'false');
    const { apiUrl, apiFetch } = await import('./deployment');
    expect(apiUrl('/api/summary?month=2026-11')).toBe('/api/summary?month=2026-11');
    const fetcher = vi.fn().mockResolvedValue(new Response()); vi.stubGlobal('fetch', fetcher);
    await apiFetch('/api/categories', { method: 'GET' });
    expect(fetcher).toHaveBeenCalledWith('/api/categories', { method: 'GET' });
  });
  it('routes to an exact HTTPS origin without sending cookies', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://expense-demo.onrender.com/');
    const { apiFetch } = await import('./deployment');
    const fetcher = vi.fn().mockResolvedValue(new Response()); vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    await apiFetch('/api/budgets?month=2026-11', { signal: controller.signal });
    expect(fetcher).toHaveBeenCalledWith('https://expense-demo.onrender.com/api/budgets?month=2026-11', { signal: controller.signal, credentials: 'omit' });
  });
  it.each(['http://example.com', 'https://example.com/api', 'https://user:password@example.com', '//example.com', 'https://example.com?token=value'])(
    'rejects unsafe API origin %s', async base => {
      const { apiUrl } = await import('./deployment'); expect(() => apiUrl('/api/categories', base)).toThrow();
    });
  it.each(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'TRACE'])('never sends %s over the network in public-demo mode', async method => {
    vi.stubEnv('VITE_PUBLIC_DEMO_MODE', 'true');
    vi.stubEnv('VITE_API_BASE_URL', 'https://expense-demo.onrender.com');
    const values = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); } } });
    vi.stubGlobal('navigator', { locks: { request: async (_key: string, operation: () => unknown) => operation() } });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { apiFetch } = await import('./deployment');
    const response = await apiFetch('/api/transactions', { method });
    expect(response).toBeInstanceOf(Response);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('enables editing and explains browser-local fictional data', async () => {
    vi.stubEnv('VITE_PUBLIC_DEMO_MODE', 'true'); vi.resetModules();
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { default: App } = await import('../App');
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Interactive portfolio demo.');
    expect(html).toContain('saved only in this browser');
    expect(html).toContain('Reset Demo');
    const { BudgetCard } = await import('../components/BudgetCard');
    const card = renderToStaticMarkup(<BudgetCard item={{ categoryId: 4, categoryName: 'Food', month: '2026-11', amountCents: 100, spentCents: 50, remainingCents: 50, utilizationPercent: 50, status: 'under' }} onEdit={() => {}} onRemove={() => {}} />);
    expect(card).not.toContain('disabled=""');
    const { MonthProvider } = await import('../context/MonthContext');
    const { Transactions } = await import('../pages/Transactions');
    const transactions = renderToStaticMarkup(<MonthProvider><Transactions /></MonthProvider>);
    const buttons = transactions.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(buttons.find(button => button.includes('Add Transaction'))).not.toContain('disabled=""');
    const { TransactionTable } = await import('../components/TransactionTable');
    const table = renderToStaticMarkup(<TransactionTable transactions={[{ id: 1, type: 'expense', amountCents: 100, categoryId: 4, categoryName: 'Food', date: '2026-11-01', note: 'Fictional', createdAt: '', updatedAt: '' }]}
      meta={{ page: 1, pageSize: 20, total: 1, totalPages: 1 }} isLoading={false} isFiltered={false}
      onPageChange={() => {}} onResetFilters={() => {}} onOpenAddModal={() => {}} />);
    for (const action of ['Edit transaction', 'Delete transaction']) {
      expect((table.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []).find(button => button.includes(action))).not.toContain('disabled=""');
    }
  });
});