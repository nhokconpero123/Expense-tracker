import { describe, expect, it } from 'vitest';
import { validateBudgetBody, validateBudgetParams, validateBudgetRequest } from './budgets.js';

describe('budget validators', () => {
  it.each([1, 100_000_000])('accepts amount boundary %i', (amountCents) => {
    expect(validateBudgetBody({ amountCents })).toEqual({ amountCents });
  });
  it.each([0, -1, 1.5, 100_000_001, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1,
    '1', null, undefined, [], {}])('rejects invalid amount %j', (amountCents) => {
    expect(() => validateBudgetBody({ amountCents })).toThrow();
  });
  it.each([{}, null, undefined, [], 'body', 1, true])('rejects missing amount or wrong body %j', (body) => {
    expect(() => validateBudgetBody(body)).toThrow(TypeError);
  });
  it.each(['categoryId', 'month', 'id', 'extra'])('rejects unknown body key %s', (key) => {
    expect(() => validateBudgetBody({ amountCents: 1, [key]: '1' })).toThrow(RangeError);
  });
  it.each([
    { categoryId: '1', month: '1900-01' },
    { categoryId: '9007199254740991', month: '9999-12' },
  ])('accepts route boundaries %j', (params) => {
    expect(validateBudgetParams(params)).toEqual({ ...params, categoryId: Number(params.categoryId) });
  });
  it.each(['0', '01', '+1', '-1', '1.0', '1e2', ' 1', '1\n', '9007199254740992', 1, null, [], undefined])(
    'rejects invalid route category %j', (categoryId) => {
      expect(() => validateBudgetParams({ categoryId, month: '2026-01' })).toThrow();
    },
  );
  it.each(['1899-12', '10000-01', '2026-00', '2026-13', '2026-1', '2026-01-01',
    '2026-01\n', null, [], undefined])('rejects invalid route month %j', (month) => {
    expect(() => validateBudgetParams({ categoryId: '1', month })).toThrow();
  });
  it.each([{}, { categoryId: '1' }, { month: '2026-01' }, null, [], 'params'])('rejects incomplete params %j', (params) => {
    expect(() => validateBudgetParams(params)).toThrow(TypeError);
  });
  it('rejects unknown route parameters', () => {
    expect(() => validateBudgetParams({ categoryId: '1', month: '2026-01', extra: '1' })).toThrow(RangeError);
  });
  it('composes body and params without mutating inputs or checking categories', () => {
    const body = Object.freeze({ amountCents: 1 });
    const params = Object.freeze({ categoryId: '123456', month: '9999-12' });
    expect(validateBudgetRequest(body, params)).toEqual({ amountCents: 1, categoryId: 123456, month: '9999-12' });
    expect(body).toEqual({ amountCents: 1 });
    expect(params.categoryId).toBe('123456');
  });
  it('rejects invalid components through the composed helper', () => {
    expect(() => validateBudgetRequest({ amountCents: 0 }, { categoryId: '1', month: '2026-01' })).toThrow(RangeError);
    expect(() => validateBudgetRequest({ amountCents: 1 }, { categoryId: '01', month: '2026-01' })).toThrow(RangeError);
  });
});
