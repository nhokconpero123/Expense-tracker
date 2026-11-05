import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_CATEGORIES, DEMO_LIMITS, DEMO_RECORDS } from './demoFixture';
import { DEMO_STORAGE_KEY, DemoRepository, demoCategories, type DemoStorage } from './demoRepository';

function fixture() {
  const values = new Map<string, string>();
  const storage: DemoStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
  return { values, storage, repo: new DemoRepository(storage) };
}
const food = demoCategories.find(c => c.name === 'Food')!.id;
const salary = demoCategories.find(c => c.name === 'Salary')!.id;
const payload = { type: 'expense', amountCents: 1234, categoryId: food, date: '2026-11-02', note: 'Fictional test' };
async function data(repo: DemoRepository, path: string, method = 'GET', body?: unknown) {
  return (await repo.request(path, method, body).json()).data;
}

describe('browser-local demo repository', () => {
  it('uses a fixture verified against the canonical backend definitions', () => {
    const seed = readFileSync(new URL('../../../backend/src/db/seed.ts', import.meta.url), 'utf8');
    const demo = readFileSync(new URL('../../../backend/src/db/publicDemo.ts', import.meta.url), 'utf8');
    // Only parse the literal tuple arrays; do not execute or bundle backend modules.
    const parse = (source: string, pattern: RegExp) => JSON.parse(source.match(pattern)![1]!.replace(/'/g, '"').replace(/,\s*\]/g, ']'));
    expect(DEMO_CATEGORIES).toEqual(parse(seed, /CATEGORY_CATALOG = (\[[\s\S]*?\]) as const/));
    expect(DEMO_RECORDS).toEqual(parse(demo, /const records:.*?= (\[[\s\S]*?\n    \]);/));
    expect(DEMO_LIMITS).toEqual(parse(demo, /const limits:.*?= (\[[\s\S]*?\]);/));
  });
  it('initializes exact totals, categories, days and all budget states', async () => {
    const { repo } = fixture();
    const summary = await data(repo, '/api/summary?month=2026-11');
    expect([summary.incomeCents, summary.expenseCents, summary.balanceCents]).toEqual([395000, 215500, 179500]);
    expect((await repo.request('/api/transactions').json()).meta.total).toBe(13);
    expect(summary.dailyExpenses).toHaveLength(30);
    expect(summary.dailyExpenses.reduce((sum: number, day: { amountCents: number }) => sum + day.amountCents, 0)).toBe(summary.expenseCents);
    expect(summary.expensesByCategory.reduce((sum: number, c: { amountCents: number }) => sum + c.amountCents, 0)).toBe(summary.expenseCents);
    expect(new Set((await data(repo, '/api/budgets?month=2026-11')).items.map((b: { status: string }) => b.status))).toEqual(new Set(['under', 'at_limit', 'over', 'no_budget']));
  });
  it('creates, reloads, replaces and deletes without changing metadata or losing notes semantics', async () => {
    const { repo, storage } = fixture();
    const created = await data(repo, '/api/transactions', 'POST', payload);
    expect(created.id).toBe(14);
    const reloaded = new DemoRepository(storage);
    expect(await data(reloaded, `/api/transactions/${created.id}`)).toEqual(created);
    const { note: _note, ...withoutNote } = payload;
    const updated = await data(reloaded, `/api/transactions/${created.id}`, 'PUT', { ...withoutNote, amountCents: 2000 });
    expect(updated.note).toBe(''); expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt > created.updatedAt).toBe(true);
    expect((await data(repo, '/api/summary?month=2026-11')).expenseCents).toBe(217500);
    expect(repo.request(`/api/transactions/${created.id}`, 'DELETE').status).toBe(204);
    expect((await data(repo, '/api/summary?month=2026-11')).expenseCents).toBe(215500);
    expect(() => repo.request(`/api/transactions/${created.id}`)).toThrow('not found');
  });
  it.each([0, -1, 1.5, '100', null, 100_000_001, Number.MAX_SAFE_INTEGER, NaN, Infinity])('rejects invalid cents %s atomically', value => {
    const { repo, values } = fixture(); repo.request('/api/categories');
    const before = values.get(DEMO_STORAGE_KEY);
    expect(() => repo.request('/api/transactions', 'POST', { ...payload, amountCents: value })).toThrow();
    expect(values.get(DEMO_STORAGE_KEY)).toBe(before);
  });
  it.each(['2026-02-29', '2026-13-01', '1899-12-31', '2026-11-31', '2026-11-02\n'])('rejects invalid date %s', date => {
    expect(() => fixture().repo.request('/api/transactions', 'POST', { ...payload, date })).toThrow();
  });
  it.each([{ categoryId: salary }, { categoryId: 999 }, { note: null }, { note: undefined }, { note: 'x'.repeat(501) }, { note: '\0' }, { extra: true }])('rejects invalid transaction fields %j', patch => {
    expect(() => fixture().repo.request('/api/transactions', 'POST', { ...payload, ...patch })).toThrow();
  });
  it('supports leap days, future dates and trimmed notes', async () => {
    expect((await data(fixture().repo, '/api/transactions', 'POST', { ...payload, date: '2028-02-29', note: '  Fictional  ' })).note).toBe('Fictional');
  });
  it('combines filters, literal note search and pagination with deterministic order', async () => {
    const { repo } = fixture();
    await data(repo, '/api/transactions', 'POST', { ...payload, note: '100%_ABC' });
    const result = await repo.request('/api/transactions?type=expense&categoryId=4&startDate=2026-11-01&endDate=2026-11-03&q=%25_abc&page=1&pageSize=1').json();
    expect(result.meta).toEqual({ page: 1, pageSize: 1, total: 1, totalPages: 1 });
    expect(result.data[0].note).toBe('100%_ABC');
    expect((await repo.request('/api/transactions?page=9007199254740991&pageSize=100').json()).data).toEqual([]);
    expect((await data(repo, '/api/transactions?q=%00'))).toEqual([]);
  });
  it.each(['page=0', 'page=01', 'pageSize=101', 'type=all', 'categoryId=999', 'startDate=2026-11-10&endDate=2026-11-01', 'q=' + 'x'.repeat(101), 'page=1&page=2'])('rejects invalid query %s', query => {
    expect(() => fixture().repo.request('/api/transactions?' + query)).toThrow();
  });
  it('keeps IDs unique across deletes and repeated operations in separate repository instances', async () => {
    const { repo, storage } = fixture();
    const ids = new Set<number>();
    for (let index = 0; index < 25; index++) {
      const row = await data(new DemoRepository(storage), '/api/transactions', 'POST', payload);
      expect(ids.has(row.id)).toBe(false); ids.add(row.id);
      repo.request(`/api/transactions/${row.id}`, 'DELETE');
    }
    expect(ids.size).toBe(25);
  });
  it('derives all budget states and exact half-up utilization from current transactions', async () => {
    const { repo } = fixture();
    const path = `/api/budgets/${food}/2026-11`;
    let budget = await data(repo, path, 'PUT', { amountCents: 35500 });
    expect(budget.status).toBe('at_limit');
    const row = await data(repo, '/api/transactions', 'POST', { ...payload, amountCents: 1 });
    budget = (await data(repo, '/api/budgets?month=2026-11')).items.find((b: { categoryId: number }) => b.categoryId === food);
    expect([budget.spentCents, budget.remainingCents, budget.status]).toEqual([35501, -1, 'over']);
    budget = await data(repo, path, 'PUT', { amountCents: 40000 });
    expect([budget.status, budget.utilizationPercent]).toEqual(['under', 88.8]);
    repo.request(`/api/transactions/${row.id}`, 'DELETE');
    expect(repo.request(path, 'DELETE').status).toBe(204);
    budget = (await data(repo, '/api/budgets?month=2026-11')).items.find((b: { categoryId: number }) => b.categoryId === food);
    expect([budget.status, budget.amountCents, budget.remainingCents, budget.utilizationPercent]).toEqual(['no_budget', null, null, null]);
    expect(() => repo.request(path, 'DELETE')).toThrow();
  });
  it.each([0, -1, 0.1, 100000001, null])('rejects invalid budget %s', amountCents => {
    expect(() => fixture().repo.request(`/api/budgets/${food}/2026-11`, 'PUT', { amountCents })).toThrow();
  });
  it('rejects income budgets and isolates selected months', async () => {
    const { repo } = fixture();
    expect(() => repo.request(`/api/budgets/${salary}/2026-11`, 'PUT', { amountCents: 100 })).toThrow();
    await data(repo, '/api/transactions', 'POST', { ...payload, date: '2026-12-01' });
    expect((await data(repo, '/api/summary?month=2026-12')).expenseCents).toBe(1234);
    expect((await data(repo, '/api/summary?month=2026-11')).expenseCents).toBe(215500);
  });
  it.each(['not json', '{"version":2}', '{"version":1,"seedVersion":2}', '{"version":1,"seedVersion":1,"transactions":[]}'])('preserves corrupt or incompatible data %s until explicit reset', raw => {
    const { repo, values } = fixture(); values.set(DEMO_STORAGE_KEY, raw);
    expect(() => repo.request('/api/categories')).toThrow('Reset Demo');
    expect(values.get(DEMO_STORAGE_KEY)).toBe(raw);
    repo.reset(); expect(() => repo.request('/api/categories')).not.toThrow();
  });
  it('validates persisted records and duplicate IDs before reading them', () => {
    const { repo, values } = fixture(); repo.request('/api/categories');
    const state = JSON.parse(values.get(DEMO_STORAGE_KEY)!);
    state.transactions.push(state.transactions[0]); values.set(DEMO_STORAGE_KEY, JSON.stringify(state));
    expect(() => repo.request('/api/transactions')).toThrow('Stored demo data');
  });
  it('does not claim success or change persisted data when quota is exceeded', () => {
    const { repo, storage, values } = fixture(); repo.request('/api/categories');
    const before = values.get(DEMO_STORAGE_KEY);
    storage.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => repo.request('/api/transactions', 'POST', payload)).toThrow('not saved');
    expect(values.get(DEMO_STORAGE_KEY)).toBe(before);
  });
  it('handles blocked storage without replacing data', () => {
    const storage = { getItem: () => { throw new Error('SecurityError'); }, setItem: vi.fn() };
    expect(() => new DemoRepository(storage).request('/api/categories')).toThrow('storage is blocked');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('resets transactions and budgets together and leaves unrelated storage alone', async () => {
    const { repo, values, storage } = fixture();
    values.set('unrelated', 'keep');
    await data(repo, '/api/transactions', 'POST', payload);
    repo.request(`/api/budgets/${food}/2026-11`, 'DELETE');
    repo.reset(); const reload = new DemoRepository(storage);
    expect((await repo.request('/api/transactions').json()).meta.total).toBe(13);
    expect((await data(reload, '/api/summary?month=2026-11')).expenseCents).toBe(215500);
    expect((await data(reload, '/api/budgets?month=2026-11')).items.find((b: { categoryId: number }) => b.categoryId === food).amountCents).toBe(30000);
    expect(values.get('unrelated')).toBe('keep');
  });
});
