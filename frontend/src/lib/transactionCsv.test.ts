import { describe, expect, it } from 'vitest';
import type { Transaction } from './api';
import { csvText, transactionsToCsv } from './transactionCsv';

const row: Transaction = { id: 1, categoryId: 4, categoryName: 'Food', type: 'expense', amountCents: 1234,
  date: '2026-11-03', note: '', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' };

// Independent state-machine parser checks quoted embedded line breaks and separators.
function parse(csv: string): string[][] {
  const records: string[][] = []; let fields: string[] = [], value = '', quoted = false;
  const source = csv.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { value += '"'; index++; } else quoted = !quoted;
    } else if (character === ',' && !quoted) { fields.push(value); value = ''; }
    else if (character === '\r' && source[index + 1] === '\n' && !quoted) {
      fields.push(value); records.push(fields); fields = []; value = ''; index++;
    } else value += character;
  }
  expect(quoted).toBe(false); expect(value).toBe(''); return records;
}

describe('transaction CSV encoding', () => {
  it('round-trips quotes, separators, embedded line breaks, Unicode and empty notes', () => {
    const note = 'Coffee, "tea"; Unicode 日本語 café\r\nnext\nlast\rend';
    const csv = transactionsToCsv([{ ...row, note }, row]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(parse(csv)).toEqual([['Date', 'Type', 'Category', 'Amount (USD)', 'Note'],
      ['2026-11-03', 'expense', 'Food', '12.34', note], ['2026-11-03', 'expense', 'Food', '12.34', '']]);
  });
  it.each([[1, '0.01'], [10, '0.10'], [1234, '12.34'], [100_000_000, '1000000.00']])('formats %i cents exactly', (cents, expected) => {
    expect(parse(transactionsToCsv([{ ...row, amountCents: cents }]))[1]?.[3]).toBe(expected);
  });
  it.each(['=1+2', '+SUM(A1)', '-1+2', '@SUM(A1)', '\t=2', '\r=2', '\n=2', ' =2', '\u00a0=2', '\u0001=2', '\u200b=2', '\ufeff=2', '＝2', '＋2', '－2', '＠2'])('prefixes risky text %j before quoting', value => {
    const parsed = parse(transactionsToCsv([{ ...row, categoryName: value, note: value }]));
    expect(parsed[1]?.[2]).toBe(`'${value}`); expect(parsed[1]?.[4]).toBe(`'${value}`);
  });
  it('prevents delimiter/quote payloads from creating extra cells', () => {
    const note = '=1+2";,=3+4';
    const record = parse(transactionsToCsv([{ ...row, note }]))[1]!;
    expect(record).toHaveLength(5); expect(record[4]).toBe(`'${note}`);
    expect(csvText('regular text')).toBe('regular text'); expect(csvText('')).toBe('');
  });
  it.each([0, -1, 0.1, NaN, Infinity, 100_000_001, Number.MAX_SAFE_INTEGER])('rejects invalid cents %s', amountCents => {
    expect(() => transactionsToCsv([{ ...row, amountCents }])).toThrow(/invalid transaction amount/);
  });
  it('refuses oversized encoded CSV rather than truncating it', () => {
    const note = '日'.repeat(500);
    expect(() => transactionsToCsv(Array.from({ length: 12_000 }, () => ({ ...row, note })))).toThrow(/16 MiB/);
  });
});
