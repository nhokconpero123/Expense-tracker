import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useMonth } from '../context/MonthContext';
import { type MonthlySummary } from '../lib/api';
import { SummaryLoader } from '../lib/summaryLoader';

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
 * Automatically refreshes when summaryRevision changes from transaction creation.
 */
export function useMonthlySummary(month: string): UseMonthlySummaryResult {
  const { summaryRevision } = useMonth();
  const loader = useMemo(() => new SummaryLoader(), []);

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
    isLoading: state.isLoading,
    error: state.error,
    refresh,
  };
}
