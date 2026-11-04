import { useCallback, useEffect, useRef, useState } from 'react';
import { useMonth } from '../context/MonthContext';
import {
  ApiClientError,
  createTransaction,
  deleteTransaction,
  fetchCategories,
  fetchTransactions,
  updateTransaction,
  type Category,
  type CreateTransactionPayload,
  type Transaction,
  type TransactionFilters,
  type TransactionListMeta,
} from '../lib/api';

export interface TransactionFilterValues {
  type: 'all' | 'income' | 'expense';
  categoryId: number;
  startDate: string;
  endDate: string;
  q: string;
}

export const INITIAL_FILTERS: TransactionFilterValues = {
  type: 'all',
  categoryId: 0,
  startDate: '',
  endDate: '',
  q: '',
};

export const INITIAL_META: TransactionListMeta = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
};

export interface TransactionRefreshResult {
  requestId: number;
  status: 'success' | 'failed' | 'obsolete';
}
export interface TransactionMutationResult {
  success: boolean;
  refreshFailed?: boolean;
  refreshRequestId?: number;
  error?: string;
}

export interface UseTransactionsResult {
  transactions: Transaction[];
  meta: TransactionListMeta;
  isLoading: boolean;
  error: string | null;
  filters: TransactionFilterValues;
  categories: Category[];
  isCategoriesLoading: boolean;
  categoriesError: string | null;
  retryCategories: () => Promise<void>;
  lastSuccessfulRequestId: number;
  setFilter: <K extends keyof TransactionFilterValues>(
    key: K,
    value: TransactionFilterValues[K],
  ) => void;
  resetFilters: () => void;
  setPage: (page: number) => void;
  refresh: () => Promise<TransactionRefreshResult>;
  addTransaction: (
    payload: CreateTransactionPayload,
  ) => Promise<TransactionMutationResult>;
  editTransaction: (
    id: number,
    payload: CreateTransactionPayload,
  ) => Promise<TransactionMutationResult>;
  removeTransaction: (
    id: number,
  ) => Promise<TransactionMutationResult>;
}

export function useTransactions(): UseTransactionsResult {
  const { notifyTransactionCreated } = useMonth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const categoriesControllerRef = useRef<AbortController | null>(null);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState<boolean>(true);

  const [filters, setFilters] = useState<TransactionFilterValues>(INITIAL_FILTERS);
  const [page, setPageState] = useState<number>(1);
  const pageSize = 20;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [meta, setMeta] = useState<TransactionListMeta>(INITIAL_META);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const queryIdentity = JSON.stringify([filters, page]);
  const [loadedIdentity, setLoadedIdentity] = useState('');
  const [lastSuccessfulRequestId, setLastSuccessfulRequestId] = useState(0);
  const mountedRef = useRef(false);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const activeRequestIdRef = useRef<number>(0);
  const requestedIdentity = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => {
    abortControllerRef.current?.abort();
    activeRequestIdRef.current++;
  }, []);

  const retryCategories = useCallback(async () => {
    if (categoriesControllerRef.current && !categoriesControllerRef.current.signal.aborted) return;
    const controller = new AbortController();
    categoriesControllerRef.current = controller;
    setIsCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const data = await fetchCategories(undefined, controller.signal);
      if (!controller.signal.aborted) setCategories(data);
    } catch (error) {
      if (!controller.signal.aborted) setCategoriesError(error instanceof Error ? error.message : 'Failed to load categories');
    } finally {
      if (categoriesControllerRef.current === controller) {
        categoriesControllerRef.current = null;
        if (!controller.signal.aborted) setIsCategoriesLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    void retryCategories();
    return () => { categoriesControllerRef.current?.abort(); };
  }, [retryCategories]);

  // Fetch transactions based on filters and page
  const loadTransactions = useCallback(
    async (targetPage = page): Promise<TransactionRefreshResult> => {
      const requestId = ++activeRequestIdRef.current;
      if (!mountedRef.current) return { requestId, status: 'obsolete' };

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);
      requestedIdentity.current = JSON.stringify([filters, targetPage]);
      setLoadedIdentity(requestedIdentity.current);
      setTransactions([]);
      setMeta({ ...INITIAL_META, page: targetPage });

      const queryFilters: TransactionFilters = {
        type: filters.type,
        page: targetPage,
        pageSize,
      };
      if (filters.categoryId > 0) {
        queryFilters.categoryId = filters.categoryId;
      }
      if (filters.startDate) {
        queryFilters.startDate = filters.startDate;
      }
      if (filters.endDate) {
        queryFilters.endDate = filters.endDate;
      }
      const trimmedQ = filters.q.trim();
      if (trimmedQ) {
        queryFilters.q = trimmedQ;
      }

      try {
        const response = await fetchTransactions(queryFilters, controller.signal);

        if (activeRequestIdRef.current === requestId && !controller.signal.aborted) {
          setLastSuccessfulRequestId(requestId);
          setTransactions(response.data);
          setMeta(response.meta);
          setError(null);
          return { requestId, status: 'success' };
        }
        return { requestId, status: 'obsolete' };
      } catch (err: unknown) {
        if (controller.signal.aborted || activeRequestIdRef.current !== requestId) return { requestId, status: 'obsolete' };
        if (activeRequestIdRef.current === requestId) {
          const message =
            err instanceof ApiClientError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Failed to load transactions';
          setError(message);
        }
        return { requestId, status: 'failed' };
      } finally {
        if (activeRequestIdRef.current === requestId && !controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [filters, page, pageSize],
  );

  useEffect(() => {
    if (requestedIdentity.current !== queryIdentity || abortControllerRef.current?.signal.aborted) void loadTransactions();
    const controller = abortControllerRef.current;
    return () => { controller?.abort(); };
  }, [loadTransactions, queryIdentity]);

  const setFilter = useCallback(
    <K extends keyof TransactionFilterValues>(key: K, value: TransactionFilterValues[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      // Requirement 8: Reset page to 1 when filters change
      setPageState(1);
    },
    [],
  );

  const resetFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    // Requirement 9: Reset page to 1 on clear
    setPageState(1);
  }, []);

  const setPage = useCallback((newPage: number) => {
    setPageState(newPage);
  }, []);

  const refresh = useCallback(() => loadTransactions(), [loadTransactions]);

  const addTransaction = useCallback(
    async (
      payload: CreateTransactionPayload,
    ): Promise<TransactionMutationResult> => {
      try {
        await createTransaction(payload);
        // Refresh dashboard summary data
        notifyTransactionCreated();

        // Refresh transactions list
        const refreshed = await loadTransactions();
        return { success: true, refreshFailed: refreshed.status === 'failed', refreshRequestId: refreshed.requestId };
      } catch (err: unknown) {
        const message =
          err instanceof ApiClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to create transaction';
        return { success: false, error: message };
      }
    },
    [loadTransactions, notifyTransactionCreated],
  );

  const editTransaction = useCallback(
    async (
      id: number,
      payload: CreateTransactionPayload,
    ): Promise<TransactionMutationResult> => {
      try {
        await updateTransaction(id, payload);
        // Refresh dashboard summary data
        notifyTransactionCreated();

        // Refresh transactions list
        const refreshed = await loadTransactions(page);
        return { success: true, refreshFailed: refreshed.status === 'failed', refreshRequestId: refreshed.requestId };
      } catch (err: unknown) {
        const message =
          err instanceof ApiClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to update transaction';
        return { success: false, error: message };
      }
    },
    [page, loadTransactions, notifyTransactionCreated],
  );

  const removeTransaction = useCallback(
    async (
      id: number,
    ): Promise<TransactionMutationResult> => {
      try {
        await deleteTransaction(id);
        // Refresh dashboard summary data
        notifyTransactionCreated();

        // Requirement 16: Adjust pagination after deleting the final row of a page
        const targetPage = transactions.length === 1 && page > 1 ? page - 1 : page;
        if (targetPage !== page) {
          setPageState(targetPage);
        }

        // Refresh transactions list
        const refreshed = await loadTransactions(targetPage);
        return { success: true, refreshFailed: refreshed.status === 'failed', refreshRequestId: refreshed.requestId };
      } catch (err: unknown) {
        const message =
          err instanceof ApiClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to delete transaction';
        return { success: false, error: message };
      }
    },
    [transactions.length, page, loadTransactions, notifyTransactionCreated],
  );

  return {
    transactions: loadedIdentity === queryIdentity ? transactions : [],
    meta: loadedIdentity === queryIdentity ? meta : { ...INITIAL_META, page },
    isLoading: loadedIdentity !== queryIdentity || isLoading,
    error: loadedIdentity === queryIdentity ? error : null,
    filters,
    categories,
    isCategoriesLoading,
    categoriesError,
    retryCategories,
    lastSuccessfulRequestId,
    setFilter,
    resetFilters,
    setPage,
    refresh,
    addTransaction,
    editTransaction,
    removeTransaction,
  };
}
