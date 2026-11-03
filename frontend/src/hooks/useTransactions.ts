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

export interface UseTransactionsResult {
  transactions: Transaction[];
  meta: TransactionListMeta;
  isLoading: boolean;
  error: string | null;
  filters: TransactionFilterValues;
  categories: Category[];
  isCategoriesLoading: boolean;
  setFilter: <K extends keyof TransactionFilterValues>(
    key: K,
    value: TransactionFilterValues[K],
  ) => void;
  resetFilters: () => void;
  setPage: (page: number) => void;
  refresh: () => Promise<void>;
  addTransaction: (
    payload: CreateTransactionPayload,
  ) => Promise<{ success: boolean; refreshFailed?: boolean; error?: string }>;
  editTransaction: (
    id: number,
    payload: CreateTransactionPayload,
  ) => Promise<{ success: boolean; refreshFailed?: boolean; error?: string }>;
  removeTransaction: (
    id: number,
  ) => Promise<{ success: boolean; refreshFailed?: boolean; error?: string }>;
}

export function useTransactions(): UseTransactionsResult {
  const { notifyTransactionCreated } = useMonth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState<boolean>(true);

  const [filters, setFilters] = useState<TransactionFilterValues>(INITIAL_FILTERS);
  const [page, setPageState] = useState<number>(1);
  const pageSize = 20;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [meta, setMeta] = useState<TransactionListMeta>(INITIAL_META);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const activeRequestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load category catalog on mount
  useEffect(() => {
    const controller = new AbortController();
    setIsCategoriesLoading(true);

    fetchCategories(undefined, controller.signal)
      .then((data) => {
        setCategories(data);
        setIsCategoriesLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setIsCategoriesLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, []);

  // Fetch transactions based on filters and page
  const loadTransactions = useCallback(
    async (targetPage = page): Promise<void> => {
      const requestId = ++activeRequestIdRef.current;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);

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

        if (activeRequestIdRef.current === requestId) {
          setTransactions(response.data);
          setMeta(response.meta);
          setError(null);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (activeRequestIdRef.current === requestId) {
          const message =
            err instanceof ApiClientError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Failed to load transactions';
          setError(message);
        }
        throw err;
      } finally {
        if (activeRequestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    },
    [filters, page, pageSize],
  );

  useEffect(() => {
    void loadTransactions().catch(() => {});
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadTransactions]);

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

  const refresh = useCallback(async () => {
    try {
      await loadTransactions();
    } catch {
      // Handled in loadTransactions
    }
  }, [loadTransactions]);

  const addTransaction = useCallback(
    async (
      payload: CreateTransactionPayload,
    ): Promise<{ success: boolean; refreshFailed?: boolean; error?: string }> => {
      try {
        await createTransaction(payload);
        // Refresh dashboard summary data
        notifyTransactionCreated();

        // Refresh transactions list
        try {
          await loadTransactions();
          return { success: true };
        } catch {
          // Requirement 17 & 22: Refresh failure is not misreported as save failure
          return { success: true, refreshFailed: true };
        }
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
    ): Promise<{ success: boolean; refreshFailed?: boolean; error?: string }> => {
      try {
        await updateTransaction(id, payload);
        // Refresh dashboard summary data
        notifyTransactionCreated();

        // Refresh transactions list
        try {
          await loadTransactions(page);
          return { success: true };
        } catch {
          return { success: true, refreshFailed: true };
        }
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
    ): Promise<{ success: boolean; refreshFailed?: boolean; error?: string }> => {
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
        try {
          await loadTransactions(targetPage);
          return { success: true };
        } catch {
          return { success: true, refreshFailed: true };
        }
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
    transactions,
    meta,
    isLoading,
    error,
    filters,
    categories,
    isCategoriesLoading,
    setFilter,
    resetFilters,
    setPage,
    refresh,
    addTransaction,
    editTransaction,
    removeTransaction,
  };
}
