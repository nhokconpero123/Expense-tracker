import { ApiClientError, fetchMonthlySummary, type DailyExpense, type MonthlySummary } from './api';
import { isValidDate, isValidMonth } from './date';
import { formatCentsToUsd } from './money';

export type AnalyticsView = 'chart' | 'table';
export interface AnalyticsViewState { view: AnalyticsView; selectedCategoryId: number | null; dailyTableExpanded: boolean }
export type AnalyticsViewAction = { type: 'view'; view: AnalyticsView } |
  { type: 'select'; categoryId: number } | { type: 'clear' } | { type: 'toggle-days' };
export const INITIAL_ANALYTICS_VIEW: AnalyticsViewState = { view: 'chart', selectedCategoryId: null, dailyTableExpanded: false };

export function analyticsViewReducer(state: AnalyticsViewState, action: AnalyticsViewAction): AnalyticsViewState {
  switch (action.type) {
    case 'view': return { ...state, view: action.view };
    case 'select': return { ...state, selectedCategoryId: action.categoryId };
    case 'clear': return { ...state, selectedCategoryId: null };
    case 'toggle-days': return { ...state, dailyTableExpanded: !state.dailyTableExpanded };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
function isCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Validate the chart inputs; do not fill days, regroup categories, or replace server totals. */
export function assertAnalyticsSummary(value: unknown, month: string): asserts value is MonthlySummary {
  const invalid = () => { throw new ApiClientError('Invalid analytics summary received. Please retry.', 500, 'INVALID_RESPONSE'); };
  if (!isValidMonth(month) || !isRecord(value) || value.month !== month || !isCents(value.incomeCents) ||
      !isCents(value.expenseCents) || !Number.isSafeInteger(value.balanceCents) ||
      !Array.isArray(value.dailyExpenses) || !Array.isArray(value.expensesByCategory)) return invalid();
  const daily = value.dailyExpenses;
  if (daily.length < 28 || daily.length > 31 || daily.some((row: unknown, index: number) =>
    !isRecord(row) || row.date !== `${month}-${String(index + 1).padStart(2, '0')}` ||
    typeof row.date !== 'string' || !isValidDate(row.date) || !isCents(row.amountCents)) ||
    isValidDate(`${month}-${daily.length + 1}`)) return invalid();
  const ids = new Set<number>();
  for (const row of value.expensesByCategory as unknown[]) {
    if (!isRecord(row) || !Number.isSafeInteger(row.categoryId) || typeof row.categoryId !== 'number' ||
        row.categoryId < 1 || typeof row.categoryName !== 'string' || !row.categoryName ||
        !isCents(row.amountCents) || row.amountCents === 0 || ids.has(row.categoryId)) return invalid();
    ids.add(row.categoryId);
  }
}

export async function fetchAnalyticsSummary(month: string, signal?: AbortSignal): Promise<MonthlySummary> {
  const summary = await fetchMonthlySummary(month, signal);
  assertAnalyticsSummary(summary, month);
  return summary;
}

/** Show at most four dates, including both endpoints, without changing the daily series. */
export function selectDailyTicks(daily: readonly DailyExpense[]): string[] {
  if (daily.length <= 4) return daily.map(row => row.date);
  return Array.from({ length: 4 }, (_, index) => daily[Math.round(index * (daily.length - 1) / 3)]!.date);
}
export function formatDayTick(date: string): string {
  return isValidDate(date) ? String(Number(date.slice(8))) : '';
}

export function dailyAmountTicks(daily: readonly DailyExpense[]): number[] {
  const maximum = Math.max(1, ...daily.map(row => row.amountCents));
  return [...new Set([0, Number(BigInt(maximum) / 2n), maximum])];
}

/** Compact axis labels are approximate; tooltips and tables always show exact USD. */
export function formatAxisCents(cents: number): string {
  if (!isCents(cents)) return '';
  const units = [[100_000_000_000_000n, 'T'], [100_000_000_000n, 'B'],
    [100_000_000n, 'M'], [100_000n, 'K']] as const;
  for (const [unit, suffix] of units) {
    if (BigInt(cents) >= unit) {
      const tenths = (BigInt(cents) * 10n + unit / 2n) / unit;
      return `$${tenths / 10n}${tenths % 10n ? `.${tenths % 10n}` : ''}${suffix}`;
    }
  }
  return formatCentsToUsd(cents);
}

const CATEGORY_COLORS = ['#34d399', '#60a5fa', '#fbbf24', '#a78bfa', '#fb7185', '#22d3ee', '#fb923c', '#e879f9'];
export function categoryColor(categoryId: number): string {
  return CATEGORY_COLORS[(categoryId - 1) % CATEGORY_COLORS.length]!;
}
