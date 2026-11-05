import type { Category, CreateTransactionPayload, MonthlySummary, Transaction } from './api';
import type { BudgetItem } from './budgetApi';
import { isValidDate, isValidMonth } from './date';
import { DEMO_CATEGORIES, DEMO_LIMITS, DEMO_MONTH, DEMO_RECORDS } from './demoFixture';

export const DEMO_STORAGE_KEY = 'expense-tracker:interactive-demo:v1';
export const DEMO_EVENT = 'expense-tracker:demo-change';
const timestamp = '2026-11-01T00:00:00.000Z';
export const demoCategories: Category[] = DEMO_CATEGORIES.map(([name, type], index) => ({ id: index + 1, name, type }));
interface StoredBudget { categoryId: number; month: string; amountCents: number }
interface DemoState { version: 1; seedVersion: 1; nextId: number; transactions: Transaction[]; budgets: StoredBudget[] }
export interface DemoStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export class DemoError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = 'INVALID_INPUT') { super(message); }
}
function requireValue(value: unknown, message = 'Invalid demo input.'): asserts value {
  if (!value) throw new DemoError(message);
}
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function money(value: unknown): value is number { return positive(value) && value <= 100_000_000; }
function object(value: unknown): Record<string, unknown> {
  requireValue(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function categoryId(name: string, type: string): number {
  const category = demoCategories.find(item => item.name === name && item.type === type);
  if (!category) throw new Error('Canonical demo category is missing.');
  return category.id;
}
export function initialDemoState(): DemoState {
  return { version: 1, seedVersion: 1, nextId: DEMO_RECORDS.length + 1,
    transactions: DEMO_RECORDS.map(([type, name, amountCents, day, note], index) => ({
      id: index + 1, type, categoryId: categoryId(name, type), categoryName: name,
      amountCents, date: `${DEMO_MONTH}-${day}`, note, createdAt: timestamp, updatedAt: timestamp,
    })),
    budgets: DEMO_LIMITS.map(([name, amountCents]) => ({ categoryId: categoryId(name, 'expense'), month: DEMO_MONTH, amountCents })),
  };
}
function transactionInput(value: unknown): Required<CreateTransactionPayload> {
  const input = object(value);
  requireValue(Object.keys(input).every(key => ['type', 'amountCents', 'categoryId', 'date', 'note'].includes(key)));
  requireValue(input['type'] === 'income' || input['type'] === 'expense', 'Choose a valid transaction type.');
  requireValue(money(input['amountCents']), 'Amount must be an integer from 1 to 100000000 cents.');
  requireValue(positive(input['categoryId']) && demoCategories.some(c => c.id === input['categoryId'] && c.type === input['type']), 'Category must match transaction type.');
  requireValue(typeof input['date'] === 'string' && isValidDate(input['date']) && input['date'].length === 10, 'Choose a valid date between 1900 and 9999.');
  const note = Object.hasOwn(input, 'note') ? input['note'] : '';
  requireValue(typeof note === 'string' && note.trim().length <= 500 && !note.includes('\0'), 'Note must contain at most 500 characters and no NUL.');
  return { type: input['type'], amountCents: input['amountCents'], categoryId: input['categoryId'], date: input['date'], note: note.trim() };
}
function validateState(value: unknown): DemoState {
  const state = object(value);
  requireValue(state['version'] === 1 && state['seedVersion'] === 1, 'This demo storage version is unsupported. Export the stored value using browser tools before explicitly resetting.');
  requireValue(positive(state['nextId']) && Array.isArray(state['transactions']) && Array.isArray(state['budgets']));
  const ids = new Set<number>();
  for (const value of state['transactions']) {
    const row = object(value);
    transactionInput({ type: row['type'], amountCents: row['amountCents'], categoryId: row['categoryId'], date: row['date'], note: row['note'] });
    requireValue(positive(row['id']) && !ids.has(row['id']) && row['id'] < state['nextId']);
    ids.add(row['id']);
    requireValue(demoCategories.some(c => c.id === row['categoryId'] && c.name === row['categoryName']));
    for (const key of ['createdAt', 'updatedAt']) requireValue(typeof row[key] === 'string' && /^\d{4}-\d\d-\d\dT/.test(row[key]) && Number.isFinite(Date.parse(row[key])));
  }
  const keys = new Set<string>();
  for (const value of state['budgets']) {
    const row = object(value);
    requireValue(demoCategories.some(c => c.id === row['categoryId'] && c.type === 'expense') && money(row['amountCents']));
    requireValue(typeof row['month'] === 'string' && row['month'].length === 7 && isValidMonth(row['month']));
    const key = `${row['month']}:${row['categoryId']}`;
    requireValue(!keys.has(key)); keys.add(key);
  }
  const result = state as unknown as DemoState;
  for (const type of ['income', 'expense']) requireValue(result.transactions.filter(t => t.type === type).reduce((sum, t) => sum + BigInt(t.amountCents), 0n) <= BigInt(Number.MAX_SAFE_INTEGER), 'Demo totals exceed the safe range.');
  return result;
}
const asciiLower = (value: string) => value.replace(/[A-Z]/g, c => c.toLowerCase());
function pathId(value: string): number { requireValue(/^[1-9]\d*$/.exec(value)?.[0] === value && positive(Number(value))); return Number(value); }
function monthValue(value: string | null): string { requireValue(value && value.length === 7 && isValidMonth(value), 'Invalid month.'); return value; }

/** Every operation reads the latest snapshot. A write is committed only after storage succeeds. */
export class DemoRepository {
  constructor(private readonly storage: DemoStorage) {}
  private load(): DemoState {
    let raw: string | null;
    try { raw = this.storage.getItem(DEMO_STORAGE_KEY); }
    catch { throw new DemoError('Browser storage is blocked. Allow site storage and retry. Your existing data has not been replaced.', 503, 'DEMO_STORAGE_UNAVAILABLE'); }
    if (raw === null) { const state = initialDemoState(); this.persist(state); return state; }
    try { return validateState(JSON.parse(raw)); }
    catch (error) { throw new DemoError(`Stored demo data cannot be loaded. ${error instanceof Error ? error.message : ''} Use Reset Demo only if you want to discard it.`, 503, 'DEMO_STORAGE_INVALID'); }
  }
  private persist(state: DemoState) {
    validateState(state);
    try { this.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state)); }
    catch { throw new DemoError('Demo changes were not saved. Browser storage is full or blocked. Free space or allow site storage and retry.', 503, 'DEMO_STORAGE_UNAVAILABLE'); }
  }
  reset() { this.persist(initialDemoState()); }
  private summary(state: DemoState, month: string): MonthlySummary {
    const rows = state.transactions.filter(t => t.date.slice(0, 7) === month);
    const total = (type: string) => rows.filter(t => t.type === type).reduce((sum, t) => sum + t.amountCents, 0);
    const incomeCents = total('income'), expenseCents = total('expense');
    const expensesByCategory = demoCategories.filter(c => c.type === 'expense').map(c => ({ categoryId: c.id, categoryName: c.name,
      amountCents: rows.filter(t => t.type === 'expense' && t.categoryId === c.id).reduce((sum, t) => sum + t.amountCents, 0),
    })).filter(c => c.amountCents > 0).sort((a, b) => b.amountCents - a.amountCents || a.categoryId - b.categoryId);
    const dailyExpenses = Array.from({ length: 31 }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`).filter(isValidDate)
      .map(date => ({ date, amountCents: rows.filter(t => t.type === 'expense' && t.date === date).reduce((sum, t) => sum + t.amountCents, 0) }));
    return { month, incomeCents, expenseCents, balanceCents: incomeCents - expenseCents, expensesByCategory, dailyExpenses };
  }
  private budgets(state: DemoState, month: string): BudgetItem[] {
    return demoCategories.filter(c => c.type === 'expense').sort((a, b) => a.name.localeCompare(b.name)).map(c => {
      const amountCents = state.budgets.find(b => b.categoryId === c.id && b.month === month)?.amountCents ?? null;
      const spentCents = state.transactions.filter(t => t.type === 'expense' && t.categoryId === c.id && t.date.slice(0, 7) === month).reduce((sum, t) => sum + t.amountCents, 0);
      return { categoryId: c.id, categoryName: c.name, month, amountCents, spentCents,
        remainingCents: amountCents === null ? null : amountCents - spentCents,
        utilizationPercent: amountCents === null ? null : Number((BigInt(spentCents) * 2000n + BigInt(amountCents)) / (BigInt(amountCents) * 2n)) / 10,
        status: amountCents === null ? 'no_budget' : spentCents < amountCents ? 'under' : spentCents === amountCents ? 'at_limit' : 'over' };
    });
  }
  request(path: string, method = 'GET', body?: unknown): Response {
    const url = new URL(path, 'https://browser-demo.invalid');
    const json = (data: unknown, status = 200) => Response.json({ data }, { status });
    const missing = () => { throw new DemoError('Record not found.', 404, 'NOT_FOUND'); };
    const state = this.load();
    if (url.pathname === '/api/categories' && method === 'GET') {
      const type = url.searchParams.get('type');
      requireValue(type === null || type === 'income' || type === 'expense');
      return json(demoCategories.filter(c => !type || c.type === type).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)));
    }
    if (url.pathname === '/api/summary' && method === 'GET') return json(this.summary(state, monthValue(url.searchParams.get('month'))));
    if (url.pathname === '/api/budgets' && method === 'GET') {
      const month = monthValue(url.searchParams.get('month')); return json({ month, items: this.budgets(state, month) });
    }
    const budgetMatch = /^\/api\/budgets\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if (budgetMatch && ['PUT', 'DELETE'].includes(method)) {
      const categoryId = pathId(budgetMatch[1]!), month = monthValue(budgetMatch[2]!);
      requireValue(demoCategories.some(c => c.id === categoryId && c.type === 'expense'), 'Budgets require an expense category.');
      const previous = state.budgets.find(b => b.categoryId === categoryId && b.month === month);
      state.budgets = state.budgets.filter(b => b !== previous);
      if (method === 'DELETE') { if (!previous) missing(); this.persist(state); return new Response(null, { status: 204 }); }
      const input = object(body);
      requireValue(Object.keys(input).length === 1 && money(input['amountCents']));
      state.budgets.push({ categoryId, month, amountCents: input['amountCents'] }); this.persist(state);
      return json(this.budgets(state, month).find(b => b.categoryId === categoryId));
    }
    if (url.pathname === '/api/transactions' && method === 'GET') {
      const q = url.searchParams;
      requireValue([...q.keys()].every(key => ['type', 'categoryId', 'startDate', 'endDate', 'q', 'page', 'pageSize'].includes(key)) && [...q.keys()].every(key => q.getAll(key).length === 1));
      const page = q.has('page') ? pathId(q.get('page')!) : 1, pageSize = q.has('pageSize') ? pathId(q.get('pageSize')!) : 20;
      requireValue(pageSize <= 100);
      const type = q.get('type'), category = q.has('categoryId') ? pathId(q.get('categoryId')!) : null;
      requireValue(type === null || type === 'income' || type === 'expense');
      requireValue(category === null || demoCategories.some(c => c.id === category), 'Category does not exist.');
      const start = q.get('startDate'), end = q.get('endDate'), search = q.get('q')?.trim() ?? '';
      requireValue((start === null || (start.length === 10 && isValidDate(start))) && (end === null || (end.length === 10 && isValidDate(end))) && (!start || !end || start <= end) && search.length <= 100);
      const rows = state.transactions.filter(t => (!type || t.type === type) && (!category || t.categoryId === category) && (!start || t.date >= start) && (!end || t.date <= end) && asciiLower(t.note).includes(asciiLower(search)))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      const offset = (BigInt(page) - 1n) * BigInt(pageSize);
      return Response.json({ data: offset >= BigInt(rows.length) ? [] : rows.slice(Number(offset), Number(offset) + pageSize), meta: { page, pageSize, total: rows.length, totalPages: Math.ceil(rows.length / pageSize) } });
    }
    const transactionMatch = /^\/api\/transactions\/([^/]+)$/.exec(url.pathname);
    const id = transactionMatch ? pathId(transactionMatch[1]!) : null;
    const previous = state.transactions.find(t => t.id === id);
    if (id !== null && method === 'GET') return previous ? json(previous) : missing();
    if (id !== null && method === 'DELETE') {
      if (!previous) missing(); state.transactions = state.transactions.filter(t => t.id !== id); this.persist(state); return new Response(null, { status: 204 });
    }
    if ((url.pathname === '/api/transactions' && method === 'POST') || (id !== null && method === 'PUT')) {
      if (method === 'PUT' && !previous) missing();
      const input = transactionInput(body);
      requireValue(state.nextId < Number.MAX_SAFE_INTEGER, 'Demo ID range is exhausted.');
      const now = new Date().toISOString();
      const row: Transaction = { ...input, id: previous?.id ?? state.nextId++, categoryName: demoCategories.find(c => c.id === input.categoryId)!.name,
        createdAt: previous?.createdAt ?? now, updatedAt: previous ? new Date(Math.max(Date.parse(now), Date.parse(previous.updatedAt) + 1)).toISOString() : now };
      state.transactions = state.transactions.filter(t => t.id !== row.id); state.transactions.push(row); this.persist(state);
      return json(row, method === 'POST' ? 201 : 200);
    }
    return missing();
  }
}

const repository = () => new DemoRepository({ getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) });
/** Web Locks serialize read-modify-write across same-origin tabs; never fall back to a network write. */
async function locked<T>(operation: () => T): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) throw new DemoError('This demo requires browser storage and Web Locks in a secure browser context. Please use a current browser over HTTPS or localhost.', 503, 'DEMO_STORAGE_UNAVAILABLE');
  return navigator.locks.request(DEMO_STORAGE_KEY, operation);
}
export async function demoFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await locked(() => {
      init?.signal?.throwIfAborted();
      let body: unknown;
      if (init?.body) { requireValue(typeof init.body === 'string'); try { body = JSON.parse(init.body); } catch { throw new DemoError('Invalid JSON body.'); } }
      return repository().request(path, init?.method ?? 'GET', body);
    });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    const failure = error instanceof DemoError ? error : new DemoError('Browser-local demo could not complete this operation.', 503, 'DEMO_STORAGE_UNAVAILABLE');
    return Response.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status });
  }
}
export async function resetDemo(): Promise<void> {
  await locked(() => repository().reset());
  window.dispatchEvent(new Event(DEMO_EVENT));
}
