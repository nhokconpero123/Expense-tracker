import { describe, expect, it } from 'vitest';
import {
  formatMonthDisplay,
  getCurrentLocalMonth,
  isValidMonth,
  shiftMonth,
} from './date';

describe('isValidMonth', () => {
  it.each([
    ['1900-01', true],
    ['2026-11', true],
    ['2026-12', true],
    ['9999-12', true],
    ['1899-12', false],
    ['10000-01', false],
    ['2026-00', false],
    ['2026-13', false],
    ['2026-1', false],
    ['2026/11', false],
    ['', false],
    ['invalid', false],
  ])('evaluates isValidMonth(%j) as %s', (input, expected) => {
    expect(isValidMonth(input)).toBe(expected);
  });
});

describe('getCurrentLocalMonth', () => {
  it('formats reference local date into YYYY-MM', () => {
    // Construct local dates (year, monthIndex, day)
    const d1 = new Date(2026, 10, 3); // Nov is month 10
    expect(getCurrentLocalMonth(d1)).toBe('2026-11');

    const d2 = new Date(2025, 0, 15); // Jan is month 0
    expect(getCurrentLocalMonth(d2)).toBe('2025-01');
  });

  it('defaults to current date without error', () => {
    const current = getCurrentLocalMonth();
    expect(isValidMonth(current)).toBe(true);
  });
});

describe('shiftMonth', () => {
  it.each([
    ['2026-11', 1, '2026-12'],
    ['2026-11', -1, '2026-10'],
    ['2026-12', 1, '2027-01'],
    ['2026-01', -1, '2025-12'],
    ['2026-11', 12, '2027-11'],
    ['2026-11', -12, '2025-11'],
    ['2026-11', 0, '2026-11'],
  ])('shifts %s by %i to %s', (month, delta, expected) => {
    expect(shiftMonth(month, delta)).toBe(expected);
  });

  it('rejects out of range years', () => {
    expect(() => shiftMonth('9999-12', 1)).toThrow(RangeError);
    expect(() => shiftMonth('1900-01', -1)).toThrow(RangeError);
  });

  it('rejects invalid inputs', () => {
    expect(() => shiftMonth('invalid', 1)).toThrow(RangeError);
    expect(() => shiftMonth('2026-11', 1.5)).toThrow(RangeError);
  });
});

describe('formatMonthDisplay', () => {
  it.each([
    ['2026-01', 'January 2026'],
    ['2026-02', 'February 2026'],
    ['2026-11', 'November 2026'],
    ['2026-12', 'December 2026'],
  ])('formats %s as %s', (month, expected) => {
    expect(formatMonthDisplay(month)).toBe(expected);
  });

  it('rejects invalid month string', () => {
    expect(() => formatMonthDisplay('2026-13')).toThrow(RangeError);
  });
});

