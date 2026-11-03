import { describe, expect, it } from 'vitest';
import { validateMoneyCents } from './money.js';

describe('validateMoneyCents', () => {
  it.each([1, 1234, 99_999_999, 100_000_000])('accepts valid cents %s', (value) => {
    expect(validateMoneyCents(value)).toBe(value);
  });

  it.each([0, -0, -1, 0.01, 1.5, 100_000_001, NaN, Infinity, -Infinity,
    Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER])(
    'rejects invalid numeric cents %s', (value) => {
      expect(() => validateMoneyCents(value)).toThrow(RangeError);
    },
  );

  it.each(['1', ' 1 ', '', null, undefined, [], [1], {}, true, false, 1n, new Number(1)])(
    'rejects wrong amount type %s', (value) => {
      expect(() => validateMoneyCents(value)).toThrow(TypeError);
    },
  );

  it('provides a clear range error', () => {
    expect(() => validateMoneyCents(0)).toThrow('1 to 100000000 cents');
  });
});
