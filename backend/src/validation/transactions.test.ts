import { describe, expect, it } from 'vitest';
import { validateTransactionRequest } from './transactions.js';

const valid = { type: 'expense', amountCents: 1234, categoryId: 1, date: '2024-02-29' };

describe('validateTransactionRequest', () => {
  it.each(['income', 'expense'])('accepts a complete %s create or replacement', (type) => {
    expect(validateTransactionRequest({ ...valid, type })).toEqual({ ...valid, type, note: '' });
  });
  it.each([1, 100_000_000])('accepts amount boundary %i', (amountCents) => {
    expect(validateTransactionRequest({ ...valid, amountCents }).amountCents).toBe(amountCents);
  });
  it('accepts maximum ID and final supported future date', () => {
    expect(validateTransactionRequest({ ...valid, categoryId: Number.MAX_SAFE_INTEGER, date: '9999-12-31' }))
      .toMatchObject({ categoryId: Number.MAX_SAFE_INTEGER, date: '9999-12-31' });
  });
  it.each(['', '   ', '  lunch\n', ` ${'x'.repeat(500)} `])('trims note %j', (note) => {
    expect(validateTransactionRequest({ ...valid, note }).note).toBe(note.trim());
  });
  it('rejects a note above the trimmed boundary', () => {
    expect(() => validateTransactionRequest({ ...valid, note: ` ${'x'.repeat(501)} ` })).toThrow(RangeError);
  });
  // POST and full PUT deliberately share this complete editable-field validator.
  for (const operation of ['create', 'full PUT replacement']) {
    describe(`${operation} note validation`, () => {
      it.each([
        ['beginning', '\0lunch'], ['middle', 'lun\0ch'], ['end', 'lunch\0'],
      ])('rejects NUL at the %s', (_position, note) => {
        const validate = () => validateTransactionRequest({ ...valid, note });
        expect(validate).toThrow(RangeError);
        expect(validate).toThrow('note must not contain NUL (U+0000) characters');
      });
      it.each(['', '  lunch  ', 'x'.repeat(500), 'coffee\nwith friends', 'literal \\u0000 text'])(
        'continues accepting valid note %j', (note) => {
          expect(validateTransactionRequest({ ...valid, note })).toEqual({ ...valid, note: note.trim() });
        },
      );
      it('continues normalizing an omitted note to empty', () => {
        expect(validateTransactionRequest({ ...valid }).note).toBe('');
      });
    });
  }
  it.each(['type', 'amountCents', 'categoryId', 'date'])('requires %s even for PUT', (field) => {
    const body: Record<string, unknown> = { ...valid };
    delete body[field];
    expect(() => validateTransactionRequest(body)).toThrow(TypeError);
  });
  it.each([
    { type: 'transfer' }, { type: 'Expense' }, { type: ' income ' }, { type: null }, { type: [] },
    { amountCents: 0 }, { amountCents: -1 }, { amountCents: 1.5 }, { amountCents: 100_000_001 },
    { amountCents: '1234' }, { amountCents: NaN }, { amountCents: Infinity },
    { amountCents: Number.MAX_SAFE_INTEGER + 1 }, { categoryId: '1' }, { categoryId: 0 },
    { categoryId: 1.5 }, { categoryId: Number.MAX_SAFE_INTEGER + 1 },
    { date: '1900-02-29' }, { date: '2026-04-31' }, { date: '2026-01-01\n' }, { date: null },
    { note: null }, { note: [] }, { note: {} }, { note: 1 }, { note: undefined },
  ])('rejects invalid field override %j', (override) => {
    expect(() => validateTransactionRequest({ ...valid, ...override })).toThrow();
  });
  it.each([null, undefined, [], [valid], 'body', 1, true, new Date(), {}])(
    'rejects invalid body %j', (body) => { expect(() => validateTransactionRequest(body)).toThrow(TypeError); },
  );
  it.each(['id', 'createdAt', 'updatedAt', 'notes', 'extra'])('rejects unknown field %s', (key) => {
    expect(() => validateTransactionRequest({ ...valid, [key]: 1 })).toThrow(RangeError);
  });
  it('returns fresh output without changing frozen input', () => {
    const input = Object.freeze({ ...valid, note: ' lunch ' });
    const result = validateTransactionRequest(input);
    expect(result).not.toBe(input);
    expect(input.note).toBe(' lunch ');
    expect(result.note).toBe('lunch');
  });
  it('accepts null-prototype JSON-like records', () => {
    expect(validateTransactionRequest(Object.assign(Object.create(null), valid))).toEqual({ ...valid, note: '' });
  });
  it('rejects inherited required fields', () => {
    expect(() => validateTransactionRequest(Object.create(valid))).toThrow(TypeError);
  });
  it('rejects accessor properties without executing them', () => {
    let accessed = false;
    const input = { ...valid };
    Object.defineProperty(input, 'note', { get() { accessed = true; return 'note'; } });
    expect(() => validateTransactionRequest(input)).toThrow(TypeError);
    expect(accessed).toBe(false);
  });
  it('rejects symbol and non-enumerable unknown keys', () => {
    expect(() => validateTransactionRequest({ ...valid, [Symbol('extra')]: 1 })).toThrow(RangeError);
    const input = { ...valid };
    Object.defineProperty(input, 'extra', { value: 1 });
    expect(() => validateTransactionRequest(input)).toThrow(RangeError);
  });
  it('rejects a JSON __proto__ key', () => {
    const input: unknown = JSON.parse('{"type":"expense","amountCents":1,"categoryId":1,"date":"2026-01-01","__proto__":{}}');
    expect(() => validateTransactionRequest(input)).toThrow(RangeError);
  });
});
