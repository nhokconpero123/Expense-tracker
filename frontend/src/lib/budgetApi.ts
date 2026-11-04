import { ApiClientError, type ApiErrorResponse } from './api';
import { isValidMonth } from './date';

export interface BudgetItem {
  categoryId: number;
  categoryName: string;
  month: string;
  amountCents: number | null;
  spentCents: number;
  remainingCents: number | null;
  utilizationPercent: number | null;
  status: 'no_budget' | 'under' | 'at_limit' | 'over';
}

export interface BudgetMonth { month: string; items: BudgetItem[] }

function invalidResponse(): never {
  throw new ApiClientError('Invalid budget response.', 500, 'INVALID_RESPONSE');
}

function isBudgetItem(value: unknown, month: string): value is BudgetItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as BudgetItem;
  if (!Number.isSafeInteger(item.categoryId) || item.categoryId < 1 ||
      typeof item.categoryName !== 'string' || item.month !== month ||
      !Number.isSafeInteger(item.spentCents) || item.spentCents < 0) return false;
  if (item.amountCents === null) {
    return item.remainingCents === null && item.utilizationPercent === null && item.status === 'no_budget';
  }
  return Number.isSafeInteger(item.amountCents) && item.amountCents > 0 && item.amountCents <= 100_000_000 &&
    Number.isSafeInteger(item.remainingCents) && item.remainingCents === item.amountCents - item.spentCents &&
    typeof item.utilizationPercent === 'number' && Number.isFinite(item.utilizationPercent) && item.utilizationPercent >= 0 &&
    item.status === (item.spentCents < item.amountCents ? 'under' : item.spentCents === item.amountCents ? 'at_limit' : 'over');
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let error: ApiErrorResponse['error'] | undefined;
    try { error = ((await response.json()) as ApiErrorResponse)?.error; } catch { /* Use the HTTP fallback. */ }
    throw new ApiClientError(error?.message || `Budget request failed (status ${response.status}).`,
      response.status, error?.code, error?.fields);
  }
  return response;
}

function budgetPath(categoryId: number, month: string): string {
  if (!Number.isSafeInteger(categoryId) || categoryId < 1 || !isValidMonth(month)) {
    throw new RangeError('Invalid budget category or month.');
  }
  return `/api/budgets/${categoryId}/${month}`;
}

async function readData(response: Response): Promise<unknown> {
  try { return ((await response.json()) as { data?: unknown })?.data; }
  catch { return invalidResponse(); }
}

export async function fetchBudgets(month: string, signal?: AbortSignal): Promise<BudgetMonth> {
  if (!isValidMonth(month)) throw new RangeError('Invalid budget month.');
  const response = await request(`/api/budgets?${new URLSearchParams({ month })}`, {
    method: 'GET', headers: { Accept: 'application/json' }, ...(signal ? { signal } : {}),
  });
  const data = await readData(response) as BudgetMonth | undefined;
  if (!data || data.month !== month || !Array.isArray(data.items) ||
      !data.items.every(item => isBudgetItem(item, month)) ||
      new Set(data.items.map(item => item.categoryId)).size !== data.items.length) invalidResponse();
  return data;
}

export async function saveBudget(categoryId: number, month: string, amountCents: number): Promise<BudgetItem> {
  const response = await request(budgetPath(categoryId, month), {
    method: 'PUT', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ amountCents }),
  });
  const data = await readData(response);
  if (!isBudgetItem(data, month) || data.categoryId !== categoryId || data.amountCents !== amountCents) invalidResponse();
  return data;
}

export async function deleteBudget(categoryId: number, month: string): Promise<void> {
  const response = await request(budgetPath(categoryId, month), { method: 'DELETE', headers: { Accept: 'application/json' } });
  if (response.status !== 204) invalidResponse();
}
