import { describe, expect, it } from 'vitest';
import { parseUsdToCents } from './money';

describe('parseUsdToCents', () => {
  it.each([
    ['0.01', 1], ['12.34', 1234], ['1000000.00', 100_000_000],
    ['1000000', 100_000_000], ['999999.99', 99_999_999],
    ['1', 100], ['12.3', 1230], ['0.1', 10], ['0.29', 29], ['1.01', 101],
    ['19.99', 1999], ['00012.34', 1234], ['00.01', 1],
  ] as const)('converts %s exactly to %i cents', (input, expected) => {
    expect(parseUsdToCents(input)).toBe(expected);
  });

  it.each(['', ' ', '0', '0.0', '0.00', '000.00', '-1', '-0.01', '-0', '+1',
    '12.345', '0.001', '1.000', '.01', '12.', '1..2', '1.2.3', '1e2', '1E2',
    'NaN', 'Infinity', '-Infinity', '0x10', '$12.34', '1,000.00', '12,34',
    '1_000', ' 12.34', '12.34 ', '12.34\n', '12.34\r\n', '\t1', '1\t',
    '\u00a01', '1\u00a0', '1 2', '１.２３', '١.٢٣', '1\0',
    '1000000.01', '1000001', '9007199254740991', '9007199254740993.00',
    '9'.repeat(400)])('rejects invalid USD input %j', (input) => {
    expect(() => parseUsdToCents(input)).toThrow(RangeError);
  });

  it.each([12.34, 0, NaN, Infinity, -Infinity, null, undefined, [], ['1.00'], {}, true,
    1n, new String('1.00')])('rejects non-string input %s', (input) => {
    expect(() => parseUsdToCents(input)).toThrow(TypeError);
  });

  it('never rounds excessive precision into a valid amount', () => {
    expect(() => parseUsdToCents('0.009')).toThrow(RangeError);
    expect(() => parseUsdToCents('999999.999')).toThrow(RangeError);
  });
});
