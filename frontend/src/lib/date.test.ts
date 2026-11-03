import { describe, expect, it } from 'vitest';
import {
  formatDateDisplay,
  formatMonthDisplay,
  getCurrentLocalMonth,
  getTodayLocalDate,
  isValidDate,
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

describe('isValidDate', () => {
  it.each([
    ['1900-01-01', true],
    ['2026-11-03', true],
    ['2024-02-29', true], // Leap year
    ['2023-02-29', false], // Non-leap year
    ['2026-04-31', false], // April has 30 days
    ['2026-04-30', true],
    ['9999-12-31', true],
    ['1899-12-31', false],
    ['10000-01-01', false],
    ['2026-00-01', false],
    ['2026-11-00', false],
    ['2026-11-32', false],
    ['invalid', false],
  ])('evaluates isValidDate(%j) as %s', (input, expected) => {
    expect(isValidDate(input)).toBe(expected);
  });
});

describe('getCurrentLocalMonth', () => {
  it('formats reference local date into YYYY-MM', () => {
    const d1 = new Date(2026, 10, 3);
    expect(getCurrentLocalMonth(d1)).toBe('2026-11');

    const d2 = new Date(2025, 0, 15);
    expect(getCurrentLocalMonth(d2)).toBe('2025-01');
  });

  it('defaults to current date without error', () => {
    const current = getCurrentLocalMonth();
    expect(isValidMonth(current)).toBe(true);
  });
});

describe('getTodayLocalDate', () => {
  it('formats reference local date into YYYY-MM-DD', () => {
    const d1 = new Date(2026, 10, 3);
    expect(getTodayLocalDate(d1)).toBe('2026-11-03');

    const d2 = new Date(2025, 0, 5);
    expect(getTodayLocalDate(d2)).toBe('2025-01-05');
  });

  it('defaults to today without error', () => {
    const today = getTodayLocalDate();
    expect(isValidDate(today)).toBe(true);
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

describe('formatDateDisplay', () => {
  it.each([
    ['2026-11-03', 'Nov 3, 2026'],
    ['2026-01-15', 'Jan 15, 2026'],
    ['2024-02-29', 'Feb 29, 2024'],
  ])('formats %s as %s', (date, expected) => {
    expect(formatDateDisplay(date)).toBe(expected);
  });

  it('rejects invalid date string', () => {
    expect(() => formatDateDisplay('invalid-date')).toThrow(RangeError);
  });
});
