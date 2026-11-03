import { isValidMonth } from './date';

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
 * Fetches monthly summary data from GET /api/summary?month=YYYY-MM.
 * Throws ApiClientError for 4xx/5xx responses.
 * Propagates AbortError when signal is aborted.
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
      // Fallback to default message if body is not valid JSON
    }

    throw new ApiClientError(message, response.status, code, fields);
  }

  const json = (await response.json()) as ApiSuccessResponse<MonthlySummary>;
  if (!json || typeof json !== 'object' || !json.data) {
    throw new ApiClientError('Invalid response shape received from server', 500, 'INVALID_RESPONSE');
  }

  return json.data;
}
