import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, type MonthlySummary } from './api';
import { SummaryLoader } from './summaryLoader';

function createMockSummary(month: string, balanceCents = 1000): MonthlySummary {
  return {
    month,
    incomeCents: 200000,
    expenseCents: 199000,
    balanceCents,
    expensesByCategory: [],
    dailyExpenses: [],
  };
}

describe('SummaryLoader', () => {
  it('starts with default uninitialized state', () => {
    const loader = new SummaryLoader();
    expect(loader.getState()).toEqual({
      summary: null,
      isLoading: false,
      error: null,
    });
  });

  it('notifies subscribers on loading and successful resolution', async () => {
    const mockSummary = createMockSummary('2026-11', 192450);
    const mockFetcher = vi.fn().mockResolvedValue(mockSummary);
    const loader = new SummaryLoader(mockFetcher);

    const states: ReturnType<typeof loader.getState>[] = [];
    const unsubscribe = loader.subscribe((state) => {
      states.push({ ...state });
    });

    const loadPromise = loader.load('2026-11');
    expect(loader.getState().isLoading).toBe(true);
    expect(loader.getState().summary).toBe(null);

    await loadPromise;

    expect(loader.getState()).toEqual({
      summary: mockSummary,
      isLoading: false,
      error: null,
    });
    expect(states.length).toBeGreaterThanOrEqual(2);

    unsubscribe();
  });

  it('sets error state and clears summary on failure', async () => {
    const mockFetcher = vi.fn().mockRejectedValue(
      new ApiClientError('Database is unavailable', 503, 'DATABASE_UNAVAILABLE'),
    );
    const loader = new SummaryLoader(mockFetcher);

    await loader.load('2026-11');

    expect(loader.getState()).toEqual({
      summary: null,
      isLoading: false,
      error: 'Database is unavailable',
    });
  });

  it('protects against stale asynchronous responses when month changes rapidly', async () => {
    let resolveMonthA!: (value: MonthlySummary) => void;
    const promiseMonthA = new Promise<MonthlySummary>((resolve) => {
      resolveMonthA = resolve;
    });

    const summaryA = createMockSummary('2026-10', 1000);
    const summaryB = createMockSummary('2026-11', 2000);

    const mockFetcher = vi.fn().mockImplementation((month: string) => {
      if (month === '2026-10') return promiseMonthA;
      if (month === '2026-11') return Promise.resolve(summaryB);
      throw new Error(`Unexpected month: ${month}`);
    });

    const loader = new SummaryLoader(mockFetcher);

    // Rapidly request month A then month B
    const loadAPromise = loader.load('2026-10');
    const loadBPromise = loader.load('2026-11');

    // Month B resolves immediately
    await loadBPromise;
    expect(loader.getState().summary?.month).toBe('2026-11');
    expect(loader.getState().summary?.balanceCents).toBe(2000);

    // Now Month A resolves late
    resolveMonthA(summaryA);
    await loadAPromise;

    // Month A's late response must be ignored and not overwrite Month B
    expect(loader.getState().summary?.month).toBe('2026-11');
    expect(loader.getState().summary?.balanceCents).toBe(2000);
  });

  it('ensures failed refreshes do not display old data as current', async () => {
    const summaryNov = createMockSummary('2026-11', 5000);
    let shouldFail = false;

    const mockFetcher = vi.fn().mockImplementation(() => {
      if (shouldFail) {
        return Promise.reject(new Error('Network error on refresh'));
      }
      return Promise.resolve(summaryNov);
    });

    const loader = new SummaryLoader(mockFetcher);

    // Initial load succeeds
    await loader.load('2026-11');
    expect(loader.getState().summary?.balanceCents).toBe(5000);

    // Subsequent refresh fails
    shouldFail = true;
    await loader.load('2026-11');

    expect(loader.getState().summary).toBe(null);
    expect(loader.getState().error).toBe('Network error on refresh');
    expect(loader.getState().isLoading).toBe(false);
  });

  it('aborts active fetch on destroy', () => {
    let capturedSignal: AbortSignal | undefined;
    const mockFetcher = vi.fn().mockImplementation((_month, signal?: AbortSignal) => {
      capturedSignal = signal;
      return new Promise(() => {}); // never resolves
    });

    const loader = new SummaryLoader(mockFetcher);
    void loader.load('2026-11');

    expect(capturedSignal?.aborted).toBe(false);
    loader.destroy();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it.each(['success', 'failure'] as const)('ignores an older same-month refresh %s after a newer request', async outcome => {
    let resolve!: (value: MonthlySummary) => void;
    let reject!: (error: Error) => void;
    const previous = new Promise<MonthlySummary>((res, rej) => { resolve = res; reject = rej; });
    const latest = createMockSummary('2026-11', 2000);
    const fetcher = vi.fn().mockReturnValueOnce(previous).mockResolvedValueOnce(latest);
    const loader = new SummaryLoader(fetcher);
    const oldRequest = loader.load('2026-11');
    await loader.load('2026-11');
    if (outcome === 'success') resolve(createMockSummary('2026-11', 1000));
    else reject(new Error('Old request failed'));
    await oldRequest;
    expect(loader.getState()).toEqual({ summary: latest, isLoading: false, error: null });
  });

  it('ignores the first A response after an A to B to A month change', async () => {
    let resolve!: (value: MonthlySummary) => void;
    const previous = new Promise<MonthlySummary>(res => { resolve = res; });
    const latest = createMockSummary('2026-11', 3000);
    const fetcher = vi.fn().mockReturnValueOnce(previous).mockResolvedValueOnce(createMockSummary('2026-12', 2000)).mockResolvedValueOnce(latest);
    const loader = new SummaryLoader(fetcher);
    const oldRequest = loader.load('2026-11');
    await loader.load('2026-12'); await loader.load('2026-11');
    resolve(createMockSummary('2026-11', 1000)); await oldRequest;
    expect(loader.getState().summary).toBe(latest);
  });

  it('does not publish a late response after destruction even when fetch ignores abort', async () => {
    let resolve!: (value: MonthlySummary) => void;
    const loader = new SummaryLoader(() => new Promise(res => { resolve = res; }));
    const pending = loader.load('2026-11');
    loader.destroy(); const state = loader.getState();
    resolve(createMockSummary('2026-11')); await pending;
    expect(loader.getState()).toBe(state);
  });
});

