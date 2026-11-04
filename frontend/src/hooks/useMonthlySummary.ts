import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useMonth } from '../context/MonthContext';
import { fetchMonthlySummary, type MonthlySummary } from '../lib/api';
import { SummaryLoader, type SummaryFetcher } from '../lib/summaryLoader';

export interface UseMonthlySummaryResult {
  summary: MonthlySummary | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * React hook to fetch and subscribe to monthly summary data.
 * Manages loading, empty, and error states, with built-in race condition
 * prevention and stale data eviction.
 * Automatically refreshes when transaction create/edit/delete increments summaryRevision.
 */
export function useMonthlySummary(month: string, fetcher: SummaryFetcher = fetchMonthlySummary): UseMonthlySummaryResult {
  const { summaryRevision } = useMonth();
  // A new identity hides the previous month/revision during render, before effects run.
  const loader = useMemo(() => new SummaryLoader(fetcher), [month, summaryRevision, fetcher]);

  useEffect(() => {
    void loader.load(month);
    return () => {
      loader.destroy();
    };
  }, [loader, month, summaryRevision]);

  const state = useSyncExternalStore(
    (onStoreChange) => loader.subscribe(onStoreChange),
    () => loader.getState(),
    () => loader.getState(),
  );

  const refresh = useCallback(() => {
    void loader.load(month);
  }, [loader, month]);

  return {
    summary: state.summary,
    isLoading: state.isLoading || (state.summary === null && state.error === null),
    error: state.error,
    refresh,
  };
}
