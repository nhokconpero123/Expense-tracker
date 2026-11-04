import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './api';
import type { BudgetItem, BudgetMonth } from './budgetApi';
import { BudgetStore } from './budgetStore';

export const unbudgeted: BudgetItem = { categoryId: 4, categoryName: 'Food', month: '2026-11',
  amountCents: null, spentCents: 7500, remainingCents: null, utilizationPercent: null, status: 'no_budget' };
const configured: BudgetItem = { ...unbudgeted, amountCents: 10000, remainingCents: 2500, utilizationPercent: 75, status: 'under' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
async function setup(item = unbudgeted) {
  const api = { fetchBudgets: vi.fn(async (_month: string, _signal?: AbortSignal): Promise<BudgetMonth> => ({ month: item.month, items: [item] })),
    saveBudget: vi.fn(async () => configured), deleteBudget: vi.fn(async () => {}) };
  const store = new BudgetStore(api);
  await store.load(item.month, 0);
  return { store, api };
}

describe('BudgetStore used by the budget UI', () => {
  it('shows initial fetch failure, supports retry, and accepts an empty catalog', async () => {
    const { store, api } = await setup();
    api.fetchBudgets.mockRejectedValueOnce(new Error('Unavailable'));
    await store.load('2026-11', 0);
    expect(store.getState()).toMatchObject({ data: null, loading: false, error: 'Unavailable' });
    api.fetchBudgets.mockResolvedValueOnce({ month: '2026-11', items: [] });
    await store.load('2026-11', 0);
    expect(store.getState()).toMatchObject({ data: { items: [] }, loading: false, error: null });
  });
  it('sets a budget with exact cents and refreshes spending', async () => {
    const { store, api } = await setup();
    store.open(unbudgeted, 'save');
    store.setAmount('12.34');
    await store.submit();
    expect(api.saveBudget).toHaveBeenCalledExactlyOnceWith(4, '2026-11', 1234);
    expect(api.fetchBudgets).toHaveBeenCalledTimes(2);
    expect(store.getState()).toMatchObject({ editor: null, pending: false, notice: 'Budget saved.' });
  });
  it('prefills and replaces an existing budget', async () => {
    const { store, api } = await setup(configured);
    store.open(configured, 'save');
    expect(store.getState().editor?.amount).toBe('100.00');
    store.setAmount('200');
    await store.submit();
    expect(api.saveBudget).toHaveBeenCalledWith(4, '2026-11', 20000);
  });
  it.each(['', '0', '-1', '1.001', '1e2', '1,000', '$1', '1000000.01', ' 1 '])('rejects invalid amount %j without a write', async amount => {
    const { store, api } = await setup();
    store.open(unbudgeted, 'save'); store.setAmount(amount);
    await store.submit();
    expect(api.saveBudget).not.toHaveBeenCalled();
    expect(store.getState().editor).toMatchObject({ amount, amountError: expect.any(String) });
  });
  it.each([['0.01', 1], ['0001.2', 120], ['1000000.00', 100000000]])('accepts boundary and exact amount %s', async (amount, cents) => {
    const { store, api } = await setup();
    store.open(unbudgeted, 'save'); store.setAmount(amount as string); await store.submit();
    expect(api.saveBudget).toHaveBeenCalledWith(4, '2026-11', cents);
  });
  it('canceling delete or edit sends no mutation', async () => {
    const { store, api } = await setup(configured);
    for (const mode of ['remove', 'save'] as const) {
      store.open(configured, mode); store.cancel(); await store.submit();
      expect(store.getState().editor).toBeNull();
    }
    expect(api.deleteBudget).not.toHaveBeenCalled(); expect(api.saveBudget).not.toHaveBeenCalled();
  });
  it('confirmed removal reloads the unbudgeted category with spending intact', async () => {
    const { store, api } = await setup(configured);
    api.fetchBudgets.mockResolvedValue({ month: '2026-11', items: [unbudgeted] });
    store.open(configured, 'remove'); await store.submit();
    expect(api.deleteBudget).toHaveBeenCalledExactlyOnceWith(4, '2026-11');
    expect(store.getState().data?.items[0]).toMatchObject({ spentCents: 7500, amountCents: null });
    expect(store.getState().notice).toContain('Transactions are preserved');
  });
  it.each(['save', 'remove'] as const)('preserves dialog after %s API failure and permits retry', async mode => {
    const { store, api } = await setup(configured);
    const error = new ApiClientError('Invalid amount.', 400, 'VALIDATION_ERROR', { amountCents: 'Amount rejected.' });
    if (mode === 'save') api.saveBudget.mockRejectedValueOnce(error);
    else api.deleteBudget.mockRejectedValueOnce(error);
    store.open(configured, mode); store.setAmount('12.34'); await store.submit();
    expect(store.getState()).toMatchObject({ pending: false, editor: { amount: '12.34', error: 'Invalid amount.', amountError: 'Amount rejected.' } });
    expect(api.fetchBudgets).toHaveBeenCalledTimes(1);
    await store.submit(); expect(store.getState().editor).toBeNull();
  });
  it.each(['save', 'remove'] as const)('blocks duplicate %s requests and cancel while pending', async mode => {
    const { store, api } = await setup(configured);
    const write = deferred<BudgetItem>(); const remove = deferred<void>();
    api.saveBudget.mockReturnValueOnce(write.promise); api.deleteBudget.mockReturnValueOnce(remove.promise);
    store.open(configured, mode);
    const first = store.submit(); await store.submit(); store.cancel(); store.setAmount('88');
    expect(store.getState()).toMatchObject({ pending: true, editor: { amount: '100.00' } });
    expect(mode === 'save' ? api.saveBudget : api.deleteBudget).toHaveBeenCalledTimes(1);
    write.resolve(configured); remove.resolve(); await first;
    expect(store.getState().pending).toBe(false);
  });
  it.each(['save', 'remove'] as const)('reports successful %s separately from refresh failure and retries only GET', async mode => {
    const { store, api } = await setup(configured);
    api.fetchBudgets.mockRejectedValueOnce(new Error('Offline'));
    store.open(configured, mode); await store.submit();
    expect(store.getState()).toMatchObject({ editor: null, pending: false, data: null, error: 'Offline' });
    const successMessage = mode === 'remove' ? 'Budget removed. Transactions are preserved.' : 'Budget saved.';
    expect(store.getState().notice).toContain(successMessage);
    const refreshedItem = mode === 'remove' ? unbudgeted : configured;
    api.fetchBudgets.mockResolvedValueOnce({ month: '2026-11', items: [refreshedItem] });
    await store.load('2026-11', 0);
    expect(store.getState()).toMatchObject({ error: null, loading: false,
      data: { month: '2026-11', items: [refreshedItem] }, notice: successMessage });
    expect(store.getState().notice).not.toContain('Refresh failed');
    expect(api.fetchBudgets).toHaveBeenCalledTimes(3);
    expect(mode === 'save' ? api.saveBudget : api.deleteBudget).toHaveBeenCalledTimes(1);
  });
  it.each(['save', 'remove'] as const)('retains success and current error when retry after %s also fails', async mode => {
    const { store, api } = await setup(configured);
    api.fetchBudgets.mockRejectedValueOnce(new Error('Initial refresh failed'));
    store.open(configured, mode); await store.submit();
    api.fetchBudgets.mockRejectedValueOnce(new Error('Retry is still offline'));
    await store.load('2026-11', 0);
    expect(store.getState()).toMatchObject({ editor: null, pending: false, loading: false, data: null,
      error: 'Retry is still offline',
      notice: mode === 'remove' ? 'Budget removed. Transactions are preserved.' : 'Budget saved.' });
    expect(mode === 'save' ? api.saveBudget : api.deleteBudget).toHaveBeenCalledTimes(1);
  });
  it('does not clear a newer GET error when a superseded retry succeeds late', async () => {
    const { store, api } = await setup(configured);
    api.fetchBudgets.mockRejectedValueOnce(new Error('Initial refresh failed'));
    store.open(configured, 'save'); await store.submit();
    const oldRetry = deferred<BudgetMonth>();
    api.fetchBudgets.mockReturnValueOnce(oldRetry.promise);
    const retrying = store.load('2026-11', 0);
    api.fetchBudgets.mockRejectedValueOnce(new Error('Newer request failed'));
    await store.load('2026-11', 1);
    const newerState = store.getState();
    oldRetry.resolve({ month: '2026-11', items: [configured] }); await retrying;
    expect(store.getState()).toBe(newerState);
    expect(store.getState()).toMatchObject({ revision: 1, data: null, error: 'Newer request failed', notice: 'Budget saved.' });
  });
  it('does not overwrite newer mutation feedback when an older retry succeeds late', async () => {
    const { store, api } = await setup(configured);
    api.fetchBudgets.mockRejectedValueOnce(new Error('Initial refresh failed'));
    store.open(configured, 'save'); await store.submit();
    const oldRetry = deferred<BudgetMonth>();
    api.fetchBudgets.mockReturnValueOnce(oldRetry.promise);
    const retrying = store.load('2026-11', 0);
    await store.load('2026-11', 1);
    store.open(configured, 'remove');
    api.fetchBudgets.mockRejectedValueOnce(new Error('Removal refresh failed'));
    await store.submit();
    const newerState = store.getState();
    oldRetry.resolve({ month: '2026-11', items: [configured] }); await retrying;
    expect(store.getState()).toBe(newerState);
    expect(store.getState()).toMatchObject({ data: null, error: 'Removal refresh failed',
      notice: 'Budget removed. Transactions are preserved.' });
  });
  it('does not restore a prior month notice or clear the selected month error after a late retry', async () => {
    const { store, api } = await setup(configured);
    api.fetchBudgets.mockRejectedValueOnce(new Error('Initial refresh failed'));
    store.open(configured, 'save'); await store.submit();
    const oldRetry = deferred<BudgetMonth>();
    api.fetchBudgets.mockReturnValueOnce(oldRetry.promise);
    const retrying = store.load('2026-11', 0);
    api.fetchBudgets.mockRejectedValueOnce(new Error('December unavailable'));
    await store.load('2026-12', 0);
    const decemberState = store.getState();
    oldRetry.resolve({ month: '2026-11', items: [configured] }); await retrying;
    expect(store.getState()).toBe(decemberState);
    expect(store.getState()).toMatchObject({ month: '2026-12', data: null, notice: null, error: 'December unavailable' });
  });
  it('aborts previous month and ignores its late success even if fetch ignores cancellation', async () => {
    const { store, api } = await setup();
    const old = deferred<BudgetMonth>();
    api.fetchBudgets.mockReturnValueOnce(old.promise);
    const first = store.load('2026-11', 0);
    const signal = api.fetchBudgets.mock.calls.at(-1)?.[1];
    api.fetchBudgets.mockResolvedValueOnce({ month: '2026-12', items: [] });
    await store.load('2026-12', 0);
    expect(signal?.aborted).toBe(true);
    old.resolve({ month: '2026-11', items: [unbudgeted] }); await first;
    expect(store.getState().data).toEqual({ month: '2026-12', items: [] });
  });
  it('clears stale data immediately and ignores late failure from old month', async () => {
    const { store, api } = await setup(); const old = deferred<BudgetMonth>();
    api.fetchBudgets.mockReturnValueOnce(old.promise);
    const first = store.load('2026-12', 0);
    expect(store.getState()).toMatchObject({ data: null, loading: true });
    await store.load('2026-11', 0); old.reject(new Error('Old failure')); await first;
    expect(store.getState()).toMatchObject({ error: null, data: { month: '2026-11' } });
  });
  it('does not let an old-month write overwrite the selected month', async () => {
    const { store, api } = await setup(configured); const write = deferred<BudgetItem>();
    api.saveBudget.mockReturnValueOnce(write.promise);
    store.open(configured, 'save'); const saving = store.submit();
    api.fetchBudgets.mockResolvedValueOnce({ month: '2026-12', items: [] });
    await store.load('2026-12', 0); write.resolve(configured); await saving;
    expect(store.getState()).toMatchObject({ month: '2026-12', editor: null, pending: false, notice: null, data: { items: [] } });
    expect(api.fetchBudgets).toHaveBeenCalledTimes(2);
  });
  it('refreshes on transaction revision and ignores a superseded same-month read', async () => {
    const { store, api } = await setup(); const old = deferred<BudgetMonth>();
    api.fetchBudgets.mockReturnValueOnce(old.promise);
    const previous = store.load('2026-11', 0);
    api.fetchBudgets.mockResolvedValueOnce({ month: '2026-11', items: [{ ...unbudgeted, spentCents: 99 }] });
    await store.load('2026-11', 1); old.resolve({ month: '2026-11', items: [unbudgeted] }); await previous;
    expect(store.getState()).toMatchObject({ revision: 1, data: { items: [{ spentCents: 99 }] } });
  });
  it('allows a transaction revision during a budget write without abandoning the write result', async () => {
    const { store, api } = await setup(configured); const write = deferred<BudgetItem>();
    api.saveBudget.mockReturnValueOnce(write.promise);
    store.open(configured, 'save'); const saving = store.submit();
    await store.load('2026-11', 1);
    write.resolve(configured); await saving;
    expect(store.getState()).toMatchObject({ revision: 1, editor: null, pending: false, notice: 'Budget saved.' });
    expect(api.fetchBudgets).toHaveBeenCalledTimes(3);
  });
  it('disposal blocks late reads and allows a fresh subscription/load', async () => {
    const { store, api } = await setup(); const old = deferred<BudgetMonth>();
    api.fetchBudgets.mockReturnValueOnce(old.promise);
    const listener = vi.fn(); const unsubscribe = store.subscribe(listener);
    const first = store.load('2026-11', 0); store.destroy(); unsubscribe(); listener.mockClear();
    old.resolve({ month: '2026-11', items: [] }); await first;
    expect(listener).not.toHaveBeenCalled();
    await store.load('2026-11', 0); expect(store.getState().data?.items).toHaveLength(1);
  });
});
