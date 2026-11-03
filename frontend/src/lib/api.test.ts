import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClientError,
  buildTransactionQueryString,
  createTransaction,
  fetchCategories,
  fetchMonthlySummary,
  fetchTransactions,
} from './api';

describe('buildTransactionQueryString', () => {
  it('returns empty string when no filters are set', () => {
    expect(buildTransactionQueryString({})).toBe('');
  });

  it('omits all and empty values', () => {
    expect(buildTransactionQueryString({ type: 'all', q: '   ' })).toBe('');
  });

  it('combines multiple filters correctly using AND query format', () => {
    const qs = buildTransactionQueryString({
      type: 'expense',
      categoryId: 4,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      q: 'coffee shop',
      page: 2,
      pageSize: 20,
    });
    expect(qs).toBe('?page=2&pageSize=20&type=expense&categoryId=4&startDate=2026-11-01&endDate=2026-11-30&q=coffee+shop');
  });

  it('trims search query q', () => {
    const qs = buildTransactionQueryString({ q: '  lunch  ' });
    expect(qs).toBe('?q=lunch');
  });
});

describe('fetchMonthlySummary', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects invalid month format before fetching', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    await expect(fetchMonthlySummary('invalid-month')).rejects.toThrow(ApiClientError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches and returns monthly summary data on 200 OK', async () => {
    const mockSummary = {
      month: '2026-11',
      incomeCents: 200000,
      expenseCents: 7550,
      balanceCents: 192450,
      expensesByCategory: [
        { categoryId: 4, categoryName: 'Food', amountCents: 7550 },
      ],
      dailyExpenses: [
        { date: '2026-11-01', amountCents: 7550 },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: mockSummary }),
    } as unknown as Response);

    const result = await fetchMonthlySummary('2026-11');
    expect(result).toEqual(mockSummary);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/summary?month=2026-11',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      }),
    );
  });

  it('throws ApiClientError with server error details on 400', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid month parameter',
          fields: { month: 'Must be YYYY-MM' },
        },
      }),
    } as unknown as Response);

    await expect(fetchMonthlySummary('2026-11')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid month parameter',
      fields: { month: 'Must be YYYY-MM' },
    });
  });

  it('handles non-JSON error responses gracefully on 500', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('Malformed JSON');
      },
    } as unknown as Response);

    await expect(fetchMonthlySummary('2026-11')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 500,
      message: 'Request failed with status 500',
    });
  });

  it('throws ApiClientError when response shape lacks data envelope', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response);

    await expect(fetchMonthlySummary('2026-11')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 500,
      code: 'INVALID_RESPONSE',
    });
  });

  it('propagates abort signal error', async () => {
    const controller = new AbortController();
    controller.abort();

    globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
      if (options?.signal?.aborted) {
        return Promise.reject(new DOMException('The user aborted a request.', 'AbortError'));
      }
      return Promise.resolve(new Response());
    });

    await expect(fetchMonthlySummary('2026-11', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('fetchCategories', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches categories without filter', async () => {
    const mockCategories = [
      { id: 1, name: 'Salary', type: 'income' },
      { id: 4, name: 'Food', type: 'expense' },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: mockCategories }),
    } as unknown as Response);

    const categories = await fetchCategories();
    expect(categories).toEqual(mockCategories);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/categories',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('fetches categories filtered by type', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 4, name: 'Food', type: 'expense' }] }),
    } as unknown as Response);

    await fetchCategories('expense');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/categories?type=expense',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('fetchTransactions', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches transactions with combined filters', async () => {
    const mockData = {
      data: [
        {
          id: 1,
          type: 'expense',
          amountCents: 1250,
          categoryId: 4,
          categoryName: 'Food',
          date: '2026-11-03',
          note: 'Coffee',
          createdAt: '2026-11-03T12:00:00Z',
          updatedAt: '2026-11-03T12:00:00Z',
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    } as unknown as Response);

    const result = await fetchTransactions({ type: 'expense', page: 1 });
    expect(result).toEqual(mockData);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/transactions?page=1&type=expense',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('handles error response from server', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid startDate',
        },
      }),
    } as unknown as Response);

    await expect(fetchTransactions({ startDate: 'invalid' })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 400,
      message: 'Invalid startDate',
    });
  });
});

describe('createTransaction', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('submits transaction and returns created record', async () => {
    const payload = {
      type: 'expense' as const,
      amountCents: 1500,
      categoryId: 4,
      date: '2026-11-03',
      note: 'Lunch',
    };

    const mockCreated = {
      id: 10,
      ...payload,
      categoryName: 'Food',
      createdAt: '2026-11-03T14:00:00Z',
      updatedAt: '2026-11-03T14:00:00Z',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: mockCreated }),
    } as unknown as Response);

    const result = await createTransaction(payload);
    expect(result).toEqual(mockCreated);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/transactions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      }),
    );
  });

  it('throws ApiClientError when create fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Category does not match type',
          fields: { categoryId: 'Invalid category' },
        },
      }),
    } as unknown as Response);

    await expect(
      createTransaction({
        type: 'income',
        amountCents: 1000,
        categoryId: 4, // food is expense
        date: '2026-11-03',
      }),
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Category does not match type',
    });
  });
});
