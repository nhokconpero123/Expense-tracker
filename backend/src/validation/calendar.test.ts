import { describe, expect, it } from 'vitest';
import { getMonthDateRange, validateDate, validateDateRange, validateMonth } from './calendar.js';

const wrongTypes: unknown[] = [null, undefined, 20260101, NaN, Infinity, true, false,
  [], ['2026-01-01'], {}, new String('2026-01-01'), new Date(0), 1n];

describe('validateDate', () => {
  it.each(['1900-01-01', '1900-02-28', '1904-02-29', '2000-02-29', '2024-02-29',
    '2400-02-29', '2026-04-30', '2026-12-31', '2027-01-01', '9996-02-29', '9999-12-31'])(
    'accepts valid date %s, including future dates', (date) => {
      expect(validateDate(date)).toBe(date);
    },
  );

  it.each(['1899-12-31', '0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29',
    '2200-02-29', '2300-02-29', '2023-02-29', '2024-02-30', '2026-04-31',
    '2026-06-31', '2026-09-31', '2026-11-31', '2026-01-00', '2026-01-32',
    '2026-00-01', '2026-13-01', '', '2026-1-01', '2026-01-1', '26-01-01',
    '2026/01/01', '+2026-01-01', '2026-01-01T00:00:00Z', '2026-01-01Z',
    ' 2026-01-01', '2026-01-01 ', '2026-01-01\n', '2026-01-01\r\n',
    '\t2026-01-01', '2026-01-01\u00a0', '２０２６-01-01', '2026-٠١-01', '2026-01-01\0'])(
    'rejects invalid date %j', (date) => {
      expect(() => validateDate(date)).toThrow(RangeError);
    },
  );
  it.each(wrongTypes)('rejects non-string date %s', (value) => {
    expect(() => validateDate(value)).toThrow(TypeError);
  });
});

describe('validateMonth', () => {
  it.each(['1900-01', '2000-02', '2026-12', '2027-01', '9999-12'])(
    'accepts canonical month %s', (month) => {
      expect(validateMonth(month)).toBe(month);
    },
  );
  it.each(['1899-12', '0000-01', '10000-01', '2026-00', '2026-13', '', '2026-1',
    '26-01', '2026/01', '+2026-01', '2026-01-01', '2026-01T00:00:00Z',
    ' 2026-01', '2026-01 ', '2026-01\n', '2026-01\r\n', '\t2026-01',
    '2026-01\u00a0', '２０２６-01', '2026-٠١', '2026-01\0'])(
    'rejects invalid month %j', (month) => {
      expect(() => validateMonth(month)).toThrow(RangeError);
    },
  );
  it.each(wrongTypes)('rejects non-string month %s', (value) => {
    expect(() => validateMonth(value)).toThrow(TypeError);
  });
});

describe('validateDateRange', () => {
  it.each([
    ['2024-02-29', '2024-02-29'], ['2026-01-31', '2026-02-01'],
    ['2026-12-31', '2027-01-01'], ['1900-01-01', '9999-12-31'],
    ['9999-12-01', '9999-12-31'], ['2026-03-08', '2026-03-09'],
    ['2026-11-01', '2026-11-02'],
  ] as const)('accepts inclusive range %s through %s', (startDate, endDate) => {
    expect(validateDateRange(startDate, endDate)).toEqual({ startDate, endDate });
  });
  it.each([
    ['2026-02-01', '2026-01-31'], ['2027-01-01', '2026-12-31'],
    ['9999-12-31', '1900-01-01'], ['2026-02-30', '2026-03-01'],
    ['2026-01-01', '2026-02-30'], ['1899-12-31', '2026-01-01'],
    ['2026-01-01', '10000-01-01'], ['2026-01-01 ', '2026-01-02'],
    ['2026-01-01', '2026-01-02\n'],
  ] as const)('rejects invalid/reversed range %j through %j', (start, end) => {
    expect(() => validateDateRange(start, end)).toThrow(RangeError);
  });
  it.each(wrongTypes)('rejects wrong type %s at either endpoint', (value) => {
    expect(() => validateDateRange(value, '2026-01-01')).toThrow(TypeError);
    expect(() => validateDateRange('2026-01-01', value)).toThrow(TypeError);
  });
});

describe('getMonthDateRange', () => {
  it.each([
    ['1900-01', '1900-01-31'], ['1900-02', '1900-02-28'],
    ['2000-02', '2000-02-29'], ['2100-02', '2100-02-28'],
    ['2400-02', '2400-02-29'], ['2026-04', '2026-04-30'],
    ['2026-06', '2026-06-30'], ['2026-09', '2026-09-30'],
    ['2026-11', '2026-11-30'], ['2026-12', '2026-12-31'],
    ['2027-01', '2027-01-31'], ['9999-12', '9999-12-31'],
  ] as const)('returns inclusive boundaries for %s', (month, endDate) => {
    const range = getMonthDateRange(month);
    expect(range).toEqual({ startDate: `${month}-01`, endDate });
    expect(validateDateRange(range.startDate, range.endDate)).toEqual(range);
  });
  it.each(['1899-12', '10000-01', '2026-13', '2026-1', '9999-12\n'])(
    'rejects invalid boundary month %j', (value) => {
      expect(() => getMonthDateRange(value)).toThrow(RangeError);
    },
  );
  it.each(wrongTypes)('rejects non-string boundary month %s', (value) => {
    expect(() => getMonthDateRange(value)).toThrow(TypeError);
  });
});
