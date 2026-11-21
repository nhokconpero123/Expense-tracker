import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Transaction, TransactionFilters, TransactionListResponse } from './api';
import { collectTransactions, downloadTransactionCsv } from './transactionExport';

const row = (id: number): Transaction => ({ id, categoryId: 4, categoryName: 'Food', type: 'expense', amountCents: 1234,
  date: '2026-11-03', note: `Record ${id}`, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' });
function response(page: number, total = 205): TransactionListResponse {
  return { data: Array.from({ length: Math.max(0, Math.min(100, total - (page - 1) * 100)) }, (_, index) => row(total - (page - 1) * 100 - index)),
    meta: { page, pageSize: 100, total, totalPages: Math.ceil(total / 100) } };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('bounded transaction export collection', () => {
  it('collects all 205 records despite visible page 2 and preserves captured filters/order', async () => {
    const filters = { type: 'expense' as const, categoryId: 4, startDate: '2026-11-01', endDate: '2026-11-30', q: '%_\\', page: 2, pageSize: 20 };
    const original = { ...filters };
    const fetchPage = vi.fn(async (query: TransactionFilters = {}) => response(query.page!));
    const progress = vi.fn();
    const rows = await collectTransactions(filters, new AbortController().signal, progress, fetchPage);
    expect(rows.map(item => item.id)).toEqual(Array.from({ length: 205 }, (_, index) => 205 - index));
    expect(filters).toEqual(original);
    expect(fetchPage.mock.calls.map(([query]) => query!.page)).toEqual([1, 2, 3, 1]);
    for (const [query] of fetchPage.mock.calls) { expect(query).toBeDefined(); expect(query).toEqual({ ...filters, page: query!.page, pageSize: 100 }); }
    expect(progress.mock.calls).toEqual([[100, 205], [200, 205], [205, 205]]);
  });
  it('returns empty without pretending a file exists', async () => {
    const fetchPage = vi.fn(async () => response(1, 0));
    expect(await collectTransactions({}, new AbortController().signal, undefined, fetchPage)).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
  it.each(['total', 'page', 'pageSize', 'totalPages', 'length', 'duplicate', 'order', 'invalid-row', 'recheck'])('rejects %s inconsistency without a partial result', async problem => {
    let reads = 0;
    const fetchPage = async (query: TransactionFilters = {}) => {
      const result = response(query.page!); reads++;
      if (problem === 'recheck' && reads === 4) result.data[0] = { ...result.data[0]!, note: 'Changed' };
      if (query.page === 2) {
        if (problem === 'total') result.meta.total++;
        if (problem === 'page') result.meta.page++;
        if (problem === 'pageSize') result.meta.pageSize = 101;
        if (problem === 'totalPages') result.meta.totalPages++;
        if (problem === 'length') result.data.pop();
        if (problem === 'duplicate') result.data[0] = row(205);
        if (problem === 'order') result.data[1] = row(999);
        if (problem === 'invalid-row') result.data[0] = { ...result.data[0]!, amountCents: 0.01 };
      }
      return result;
    };
    await expect(collectTransactions({}, new AbortController().signal, undefined, fetchPage)).rejects.toThrow(/changed|inconsistent/);
  });
  it('refuses an over-limit total before fetching additional pages', async () => {
    const fetchPage = vi.fn(async () => response(1, 10001));
    await expect(collectTransactions({}, new AbortController().signal, undefined, fetchPage)).rejects.toThrow(/10,000/);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
  it('does not request anything if already canceled', async () => {
    const controller = new AbortController(); controller.abort(); const fetchPage = vi.fn();
    await expect(collectTransactions({}, controller.signal, undefined, fetchPage)).rejects.toThrow();
    expect(fetchPage).not.toHaveBeenCalled();
  });
  it('checks cancellation even when the transport ignores abort', async () => {
    const controller = new AbortController(); let calls = 0;
    const fetchPage = async (query: TransactionFilters = {}) => { calls++; if (calls === 2) controller.abort(); return response(query.page!); };
    await expect(collectTransactions({}, controller.signal, undefined, fetchPage)).rejects.toThrow(); expect(calls).toBe(2);
  });
  it('propagates request/storage failure rather than returning collected rows', async () => {
    const fetchPage = async (query: TransactionFilters = {}) => { if (query.page === 2) throw new Error('Storage unavailable'); return response(1); };
    await expect(collectTransactions({}, new AbortController().signal, undefined, fetchPage)).rejects.toThrow('Storage unavailable');
  });
});

describe('CSV download lifecycle', () => {
  it('uses a Blob, safe filename and deferred URL cleanup without leaking a link', async () => {
    vi.useFakeTimers();
    const click = vi.fn(), remove = vi.fn(); const link = { href: '', download: '', click, remove };
    vi.stubGlobal('document', { createElement: () => link, body: { append: vi.fn() } });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic'); const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    downloadTransactionCsv('\uFEFFCSV', new Date('2026-11-20T01:02:03.000Z'));
    expect([...new Uint8Array(await (create.mock.calls[0]![0] as Blob).arrayBuffer())]).toEqual([239, 187, 191, 67, 83, 86]);
    expect(link.download).toBe('expense-tracker-transactions-2026-11-20T01-02-03-000Z.csv');
    expect(click).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledTimes(1); expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers(); expect(revoke).toHaveBeenCalledWith('blob:synthetic');
  });
  it('revokes immediately when download creation fails', () => {
    vi.stubGlobal('document', { createElement: () => { throw new Error('Download blocked'); } });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic'); const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    expect(() => downloadTransactionCsv('CSV')).toThrow('Download blocked'); expect(revoke).toHaveBeenCalledTimes(1);
  });
});
