import { describe, expect, it } from 'vitest';
import { validateTransactionQuery } from './queries.js';

describe('validateTransactionQuery', () => {
  it('defaults pagination without adding absent filters', () => {
    expect(validateTransactionQuery({})).toEqual({ page: 1, pageSize: 20 });
  });
  it('retains all filters for AND matching without changing case or literals', () => {
    const query = Object.freeze({ type: 'expense', categoryId: '123456', startDate: '2024-02-29',
      endDate: '9999-12-31', q: '  Lunch %_  ', page: '2', pageSize: '100' });
    expect(validateTransactionQuery(query)).toEqual({ ...query, categoryId: 123456, q: 'Lunch %_', page: 2, pageSize: 100 });
    expect(query.q).toBe('  Lunch %_  ');
  });
  it.each(['income', 'expense'])('accepts type %s', (type) => {
    expect(validateTransactionQuery({ type }).type).toBe(type);
  });
  it.each([{ startDate: '1900-01-01' }, { endDate: '9999-12-31' },
    { startDate: '2024-02-29', endDate: '2024-02-29' }])('accepts open/equal range %j', (range) => {
    expect(validateTransactionQuery(range)).toEqual({ page: 1, pageSize: 20, ...range });
  });
  it.each(['', ' ', '\t\n'])('omits blank search %j', (q) => {
    expect(validateTransactionQuery({ q })).toEqual({ page: 1, pageSize: 20 });
  });
  it('accepts 100 trimmed search characters and rejects 101', () => {
    expect(validateTransactionQuery({ q: ` ${'x'.repeat(100)} ` }).q).toBe('x'.repeat(100));
    expect(() => validateTransactionQuery({ q: ` ${'x'.repeat(101)} ` })).toThrow(RangeError);
  });
  it.each(['1', '100'])('accepts pageSize boundary %s', (pageSize) => {
    expect(validateTransactionQuery({ pageSize }).pageSize).toBe(Number(pageSize));
  });
  it('accepts maximum safe page and category ID', () => {
    expect(validateTransactionQuery({ page: '9007199254740991', categoryId: '9007199254740991' }))
      .toMatchObject({ page: Number.MAX_SAFE_INTEGER, categoryId: Number.MAX_SAFE_INTEGER });
  });
  for (const key of ['page', 'pageSize', 'categoryId']) {
    it.each(['', '0', '01', '-1', '+1', '1.5', '1.0', '1e2', '0x10', ' 1', '1 ', '1\n',
      'NaN', 'Infinity', '9007199254740992', 1, null, undefined, [], ['1'], {}])(
      `rejects malformed ${key} %j`, (value) => {
        expect(() => validateTransactionQuery({ [key]: value })).toThrow();
      },
    );
  }
  it.each(['101', '9007199254740991'])('rejects over-limit pageSize %s', (pageSize) => {
    expect(() => validateTransactionQuery({ pageSize })).toThrow(RangeError);
  });
  for (const key of ['type', 'startDate', 'endDate', 'q']) {
    it.each([null, undefined, 1, true, [], ['income'], {}])(`rejects non-scalar-string ${key} %j`, (value) => {
      expect(() => validateTransactionQuery({ [key]: value })).toThrow(TypeError);
    });
  }
  it.each([{ type: 'transfer' }, { type: 'Income' }, { type: ' expense ' },
    { startDate: '1900-02-29' }, { endDate: '2026-04-31' }, { startDate: '1899-12-31' },
    { endDate: '10000-01-01' }, { startDate: '2026-01-01\n' },
    { startDate: '2027-01-01', endDate: '2026-12-31' }])('rejects invalid filters %j', (query) => {
    expect(() => validateTransactionQuery(query)).toThrow(RangeError);
  });
  it.each(['month', 'sort', 'limit', 'extra'])('rejects unknown query key %s', (key) => {
    expect(() => validateTransactionQuery({ [key]: '1' })).toThrow(RangeError);
  });
  it.each([null, undefined, [], 'query', 1, true, new URLSearchParams()])('rejects wrong query shape %j', (query) => {
    expect(() => validateTransactionQuery(query)).toThrow(TypeError);
  });
  it('accepts null-prototype query records', () => {
    expect(validateTransactionQuery(Object.assign(Object.create(null), { page: '2' }))).toEqual({ page: 2, pageSize: 20 });
  });
});
