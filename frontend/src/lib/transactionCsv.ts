import type { Transaction } from './api';

export const MAX_CSV_BYTES = 16 * 1024 * 1024;

/** Text prefix protects the initial spreadsheet import; spreadsheet re-saving can remove it. */
export function csvText(value: string): string {
  const riskyStart = /^[=+\-@\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\uff1d\uff0b\uff0d\uff20]/u;
  return riskyStart.test(value) ? `'${value}` : value;
}

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

export function transactionsToCsv(rows: readonly Transaction[]): string {
  const encoder = new TextEncoder();
  const lines = ['\uFEFF' + ['Date', 'Type', 'Category', 'Amount (USD)', 'Note'].map(quote).join(',') + '\r\n'];
  let bytes = encoder.encode(lines[0]).byteLength;
  for (const row of rows) {
    if (!Number.isSafeInteger(row.amountCents) || row.amountCents < 1 || row.amountCents > 100_000_000) {
      throw new Error('Export received an invalid transaction amount. Refresh and try again.');
    }
    const cents = BigInt(row.amountCents);
    const amount = `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
    const line = [row.date, row.type, csvText(row.categoryName), amount, csvText(row.note)].map(quote).join(',') + '\r\n';
    bytes += encoder.encode(line).byteLength;
    if (bytes > MAX_CSV_BYTES) throw new Error('Export exceeds the 16 MiB CSV limit. Narrow your filters and try again.');
    lines.push(line);
  }
  return lines.join('');
}
