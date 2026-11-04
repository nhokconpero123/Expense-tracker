import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './api';
import { deleteBudget, fetchBudgets, saveBudget, type BudgetItem } from './budgetApi';

const item: BudgetItem = { categoryId: 4, categoryName: 'Food', month: '2026-11', amountCents: 10000,
  spentCents: 12500, remainingCents: -2500, utilizationPercent: 125, status: 'over' };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
afterEach(() => vi.unstubAllGlobals());

describe('budget HTTP client matches the existing T08 contract', () => {
  it('GETs the explicit month and forwards cancellation', async () => {
    const fetch = vi.fn(async () => response({ data: { month: item.month, items: [item] } }));
    vi.stubGlobal('fetch', fetch); const signal = new AbortController().signal;
    expect(await fetchBudgets(item.month, signal)).toEqual({ month: item.month, items: [item] });
    expect(fetch).toHaveBeenCalledWith('/api/budgets?month=2026-11', { method: 'GET', headers: { Accept: 'application/json' }, signal });
  });
  it('PUTs only amountCents to the category/month path and unwraps 200', async () => {
    const fetch = vi.fn(async () => response({ data: item })); vi.stubGlobal('fetch', fetch);
    expect(await saveBudget(4, item.month, 10000)).toEqual(item);
    expect(fetch).toHaveBeenCalledWith('/api/budgets/4/2026-11', { method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: '{"amountCents":10000}' });
  });
  it('DELETEs and never parses the empty 204 body', async () => {
    const empty = new Response(null, { status: 204 }); const json = vi.spyOn(empty, 'json');
    const fetch = vi.fn(async () => empty); vi.stubGlobal('fetch', fetch);
    await expect(deleteBudget(4, item.month)).resolves.toBeUndefined(); expect(json).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('/api/budgets/4/2026-11', { method: 'DELETE', headers: { Accept: 'application/json' } });
  });
  it.each([400, 404, 500])('preserves backend errors and fields for every method (%s)', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: { code: 'ERROR', message: 'Request rejected.', fields: { amountCents: 'Invalid amount.' } } }, status)));
    for (const call of [() => fetchBudgets(item.month), () => saveBudget(4, item.month, 1), () => deleteBudget(4, item.month)]) {
      await expect(call()).rejects.toMatchObject({ status, code: 'ERROR', message: 'Request rejected.', fields: { amountCents: 'Invalid amount.' } });
    }
  });
  it('handles non-JSON errors without losing HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
    await expect(fetchBudgets(item.month)).rejects.toMatchObject({ status: 503, message: 'Budget request failed (status 503).' });
  });
  it('propagates network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Offline'); }));
    await expect(fetchBudgets(item.month)).rejects.toThrow('Offline');
  });
  it.each([{}, { data: null }, { data: { month: '2026-12', items: [] } }, { data: { month: item.month, items: [item, item] } },
    { data: { month: item.month, items: [{ ...item, spentCents: 1.1 }] } },
    { data: { month: item.month, items: [{ ...item, status: 'under' }] } },
    { data: { month: item.month, items: [{ ...item, remainingCents: 0 }] } },
    { data: { month: item.month, items: [{ ...item, utilizationPercent: null }] } }])('rejects malformed monthly response %j', async body => {
    vi.stubGlobal('fetch', vi.fn(async () => response(body)));
    await expect(fetchBudgets(item.month)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('accepts null absent budgets and zero spending without inventing a limit', async () => {
    const absent = { ...item, amountCents: null, remainingCents: null, utilizationPercent: null, spentCents: 0, status: 'no_budget' };
    vi.stubGlobal('fetch', vi.fn(async () => response({ data: { month: item.month, items: [absent] } })));
    expect((await fetchBudgets(item.month)).items).toEqual([absent]);
  });
  it('rejects mismatched save response and malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ data: { ...item, categoryId: 5 } })));
    await expect(saveBudget(4, item.month, 10000)).rejects.toBeInstanceOf(ApiClientError);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{')));
    await expect(fetchBudgets(item.month)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('rejects invalid paths/months without sending requests', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(fetchBudgets('2026-13')).rejects.toThrow();
    await expect(saveBudget(0, item.month, 100)).rejects.toThrow();
    await expect(deleteBudget(4, '1899-12')).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
});
