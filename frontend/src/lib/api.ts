import { isValidMonth } from './date';

export type TransactionType = 'income' | 'expense';

export interface Category {
  id: number;
  name: string;
  type: TransactionType;
}

export interface Transaction {
  id: number;
  type: TransactionType;
  amountCents: number;
  categoryId: number;
  categoryName: string;
  date: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TransactionListResponse {
  data: Transaction[];
  meta: TransactionListMeta;
}

export interface TransactionFilters {
  type?: TransactionType | 'all';
  categoryId?: number;
  startDate?: string;
  endDate?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateTransactionPayload {
  type: TransactionType;
  amountCents: number;
  categoryId: number;
  date: string;
  note?: string;
}

export interface ExpenseByCategory {
  categoryId: number;
  categoryName: string;
  amountCents: number;
}

export interface DailyExpense {
  date: string;
  amountCents: number;
}

export interface MonthlySummary {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  expensesByCategory: ExpenseByCategory[];
  dailyExpenses: DailyExpense[];
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export interface ApiSuccessResponse<T> {
  data: T;
  meta?: TransactionListMeta;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/**
 * Builds standard query string combining filters with backend AND semantics.
 * Omits empty or 'all' values.
 */
export function buildTransactionQueryString(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  if (filters.page !== undefined && filters.page > 0) {
    params.set('page', String(filters.page));
  }
  if (filters.pageSize !== undefined && filters.pageSize > 0) {
    params.set('pageSize', String(filters.pageSize));
  }
  if (filters.type && filters.type !== 'all') {
    params.set('type', filters.type);
  }
  if (filters.categoryId !== undefined && filters.categoryId > 0) {
    params.set('categoryId', String(filters.categoryId));
  }
  if (filters.startDate) {
    params.set('startDate', filters.startDate);
  }
  if (filters.endDate) {
    params.set('endDate', filters.endDate);
  }
  if (filters.q !== undefined) {
    const trimmed = filters.q.trim();
    if (trimmed !== '') {
      params.set('q', trimmed);
    }
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

/**
 * Fetches monthly summary data from GET /api/summary?month=YYYY-MM.
 */
export async function fetchMonthlySummary(
  month: string,
  signal?: AbortSignal,
): Promise<MonthlySummary> {
  if (!isValidMonth(month)) {
    throw new ApiClientError('Invalid month parameter', 400, 'INVALID_INPUT');
  }

  const init: RequestInit = {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  };
  if (signal) {
    init.signal = signal;
  }

  const response = await fetch(`/api/summary?month=${encodeURIComponent(month)}`, init);

  if (!response.ok) {
    let code: string | undefined;
    let message = `Request failed with status ${response.status}`;
    let fields: Record<string, string> | undefined;

    try {
      const errorJson = (await response.json()) as ApiErrorResponse;
      if (errorJson?.error) {
        code = errorJson.error.code;
        message = errorJson.error.message || message;
        fields = errorJson.error.fields;
      }
    } catch {
      // Fallback
    }

    throw new ApiClientError(message, response.status, code, fields);
  }

  const json = (await response.json()) as ApiSuccessResponse<MonthlySummary>;
  if (!json || typeof json !== 'object' || !json.data) {
    throw new ApiClientError('Invalid response shape received from server', 500, 'INVALID_RESPONSE');
  }

  return json.data;
}

/**
 * Fetches seeded category catalog from GET /api/categories.
 */
export async function fetchCategories(
  type?: TransactionType,
  signal?: AbortSignal,
): Promise<Category[]> {
  const query = type ? `?type=${encodeURIComponent(type)}` : '';
  const init: RequestInit = {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  };
  if (signal) {
    init.signal = signal;
  }

  const response = await fetch(`/api/categories${query}`, init);

  if (!response.ok) {
    let code: string | undefined;
    let message = `Failed to fetch categories (status ${response.status})`;
    let fields: Record<string, string> | undefined;

    try {
      const errorJson = (await response.json()) as ApiErrorResponse;
      if (errorJson?.error) {
        code = errorJson.error.code;
        message = errorJson.error.message || message;
        fields = errorJson.error.fields;
      }
    } catch {
      // Fallback
    }

    throw new ApiClientError(message, response.status, code, fields);
  }

  const json = (await response.json()) as ApiSuccessResponse<Category[]>;
  if (!json || typeof json !== 'object' || !Array.isArray(json.data)) {
    throw new ApiClientError('Invalid response shape for categories', 500, 'INVALID_RESPONSE');
  }

  return json.data;
}

/**
 * Fetches paginated and filtered transactions from GET /api/transactions.
 */
export async function fetchTransactions(
  filters: TransactionFilters = {},
  signal?: AbortSignal,
): Promise<TransactionListResponse> {
  const query = buildTransactionQueryString(filters);
  const init: RequestInit = {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  };
  if (signal) {
    init.signal = signal;
  }

  const response = await fetch(`/api/transactions${query}`, init);

  if (!response.ok) {
    let code: string | undefined;
    let message = `Failed to fetch transactions (status ${response.status})`;
    let fields: Record<string, string> | undefined;

    try {
      const errorJson = (await response.json()) as ApiErrorResponse;
      if (errorJson?.error) {
        code = errorJson.error.code;
        message = errorJson.error.message || message;
        fields = errorJson.error.fields;
      }
    } catch {
      // Fallback
    }

    throw new ApiClientError(message, response.status, code, fields);
  }

  const json = (await response.json()) as TransactionListResponse;
  if (!json || typeof json !== 'object' || !Array.isArray(json.data) || !json.meta) {
    throw new ApiClientError('Invalid response shape for transactions', 500, 'INVALID_RESPONSE');
  }

  return json;
}

/**
 * Submits a new transaction to POST /api/transactions.
 */
export async function createTransaction(
  payload: CreateTransactionPayload,
  signal?: AbortSignal,
): Promise<Transaction> {
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  };
  if (signal) {
    init.signal = signal;
  }

  const response = await fetch('/api/transactions', init);

  if (!response.ok) {
    let code: string | undefined;
    let message = `Failed to create transaction (status ${response.status})`;
    let fields: Record<string, string> | undefined;

    try {
      const errorJson = (await response.json()) as ApiErrorResponse;
      if (errorJson?.error) {
        code = errorJson.error.code;
        message = errorJson.error.message || message;
        fields = errorJson.error.fields;
      }
    } catch {
      // Fallback
    }

    throw new ApiClientError(message, response.status, code, fields);
  }

  const json = (await response.json()) as ApiSuccessResponse<Transaction>;
  if (!json || typeof json !== 'object' || !json.data) {
    throw new ApiClientError('Invalid response shape for created transaction', 500, 'INVALID_RESPONSE');
  }

  return json.data;
}

/**
 * Replaces an existing transaction through PUT /api/transactions/:id.
 * Complete replacement semantics: omitted note becomes an empty string.
 */
export async function updateTransaction(
  id: number,
  payload: CreateTransactionPayload,
  signal?: AbortSignal,
): Promise<Transaction> {
  const init: RequestInit = {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      type: payload.type,
      amountCents: payload.amountCents,
      categoryId: payload.categoryId,
      date: payload.date,
      note: payload.note ?? '',
    }),
  };
  if (signal) {
    init.signal = signal;
  }

  const response = await fetch(`/api/transactions/${id}`, init);

  if (!response.ok) {
    let code: string | undefined;
    let message = `Failed to update transaction (status ${response.status})`;
    let fields: Record<string, string> | undefined;

    try {
      const errorJson = (await response.json()) as ApiErrorResponse;
      if (errorJson?.error) {
        code = errorJson.error.code;
        message = errorJson.error.message || message;
        fields = errorJson.error.fields;
      }
    } catch {
      // Fallback
    }

    throw new ApiClientError(message, response.status, code, fields);
  }

  const json = (await response.json()) as ApiSuccessResponse<Transaction>;
  if (!json || typeof json !== 'object' || !json.data) {
    throw new ApiClientError('Invalid response shape for updated transaction', 500, 'INVALID_RESPONSE');
  }

  return json.data;
}

/**
 * Deletes a transaction through DELETE /api/transactions/:id.
 * Handles empty 204 No Content response on success.
 */
export async function deleteTransaction(
  id: number,
  signal?: AbortSignal,
): Promise<void> {
  const init: RequestInit = {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  };
  if (signal) {
    init.signal = signal;
  }

  const response = await fetch(`/api/transactions/${id}`, init);

  if (response.status === 204) {
    return;
  }

  let code: string | undefined;
  let message = `Failed to delete transaction (status ${response.status})`;
  let fields: Record<string, string> | undefined;

  try {
    const errorJson = (await response.json()) as ApiErrorResponse;
    if (errorJson?.error) {
      code = errorJson.error.code;
      message = errorJson.error.message || message;
      fields = errorJson.error.fields;
    }
  } catch {
    // Fallback
  }

  throw new ApiClientError(message, response.status, code, fields);
}

