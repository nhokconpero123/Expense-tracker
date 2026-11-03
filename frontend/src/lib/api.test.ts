import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, fetchMonthlySummary } from './api';

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

