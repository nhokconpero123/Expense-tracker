import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useMonth } from '../context/MonthContext';
import { BudgetStore } from '../lib/budgetStore';

export function useBudgets() {
  const { month, summaryRevision } = useMonth();
  const store = useMemo(() => new BudgetStore(), []);
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  useEffect(() => () => store.destroy(), [store]);
  useEffect(() => {
    void store.load(month, summaryRevision);
  }, [store, month, summaryRevision]);
  // Hide the previous snapshot during render, before the effect starts the next request.
  const current = state.month === month && state.revision === summaryRevision;
  return { store, state: current ? state : { ...state, data: null, editor: null, notice: null, error: null, loading: true },
    refresh: () => { void store.load(month, summaryRevision); } };
}
