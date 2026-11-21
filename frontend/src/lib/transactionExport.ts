import { fetchTransactions, type Transaction, type TransactionFilters, type TransactionListResponse } from './api';
import { isValidDate } from './date';

export const MAX_EXPORT_ROWS = 10_000;
const PAGE_SIZE = 100;
const changed = () => new Error('Transaction data changed or an export response was inconsistent. Refresh and try again.');

function validateRow(row: Transaction): void {
  if (!row || !Number.isSafeInteger(row.id) || row.id < 1 || !['income', 'expense'].includes(row.type)
    || !Number.isSafeInteger(row.categoryId) || row.categoryId < 1 || typeof row.categoryName !== 'string'
    || typeof row.note !== 'string' || row.note.length > 500 || row.note.includes('\0')
    || typeof row.date !== 'string' || row.date.length !== 10 || !isValidDate(row.date)
    || !Number.isSafeInteger(row.amountCents) || row.amountCents < 1 || row.amountCents > 100_000_000
    || typeof row.createdAt !== 'string' || typeof row.updatedAt !== 'string') throw changed();
}

function validatePage(response: TransactionListResponse, page: number, total?: number): void {
  const meta = response?.meta;
  if (!meta || !Array.isArray(response.data) || !Number.isSafeInteger(meta.total) || meta.total < 0
    || meta.page !== page || meta.pageSize !== PAGE_SIZE || meta.totalPages !== Math.ceil(meta.total / PAGE_SIZE)
    || (total !== undefined && meta.total !== total)
    || response.data.length !== Math.max(0, Math.min(PAGE_SIZE, meta.total - (page - 1) * PAGE_SIZE))) throw changed();
  if (meta.total > MAX_EXPORT_ROWS) throw new Error('Export is limited to 10,000 transactions. Narrow your filters and try again.');
  response.data.forEach(validateRow);
}

/** Bounded offset pagination with detectable-change checks; this is not an atomic snapshot. */
export async function collectTransactions(
  filters: TransactionFilters,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void = () => {},
  fetchPage: typeof fetchTransactions = fetchTransactions,
): Promise<Transaction[]> {
  const captured = { ...filters, pageSize: PAGE_SIZE };
  signal.throwIfAborted();
  const first = await fetchPage({ ...captured, page: 1 }, signal);
  signal.throwIfAborted();
  validatePage(first, 1);
  const firstRows = JSON.stringify(first.data);
  const { total, totalPages } = first.meta;
  if (total === 0) return [];
  const rows: Transaction[] = [];
  const ids = new Set<number>();
  for (let page = 1; page <= totalPages; page++) {
    signal.throwIfAborted();
    const response = page === 1 ? first : await fetchPage({ ...captured, page }, signal);
    signal.throwIfAborted();
    validatePage(response, page, total);
    for (const row of response.data) {
      const previous = rows.at(-1);
      if (ids.has(row.id) || (previous && (previous.date < row.date || (previous.date === row.date && previous.id <= row.id)))) throw changed();
      ids.add(row.id);
      rows.push({ ...row });
    }
    onProgress(rows.length, total);
    // Yield to the browser so progress and Cancel remain usable for in-memory demo reads.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  signal.throwIfAborted();
  const recheck = await fetchPage({ ...captured, page: 1 }, signal);
  signal.throwIfAborted();
  validatePage(recheck, 1, total);
  if (rows.length !== total || JSON.stringify(recheck.data) !== firstRows) throw changed();
  return rows;
}

export function downloadTransactionCsv(csv: string, now = new Date()): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  let link: HTMLAnchorElement | undefined;
  try {
    link = document.createElement('a');
    link.href = url;
    link.download = `expense-tracker-transactions-${now.toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.append(link);
    link.click();
    // Give the browser time to consume the URL before releasing its backing Blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally { link?.remove(); }
}
