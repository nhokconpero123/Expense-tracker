export interface DateRange {
  startDate: string;
  endDate: string;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Validate an exact YYYY-MM reporting month, years 1900..9999 inclusive.
 * @throws TypeError for non-string values; RangeError for invalid format/range.
 * No whitespace trimming, clock access, or timezone conversion is performed.
 */
export function validateMonth(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('Month must be a string');
  }
  const match = /^[0-9]{4}-[0-9]{2}$/.exec(value);
  if (match?.[0] !== value) {
    throw new RangeError('Month must use exact YYYY-MM format');
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  if (year < 1900 || year > 9999 || month < 1 || month > 12) {
    throw new RangeError('Month must be within 1900-01 through 9999-12');
  }
  return value;
}

/**
 * Validate an exact Gregorian YYYY-MM-DD date, years 1900..9999 inclusive.
 * Future dates are allowed; the original canonical string is returned.
 * @throws TypeError for non-string values; RangeError for invalid format/date.
 */
export function validateDate(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('Date must be a string');
  }
  const match = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.exec(value);
  if (match?.[0] !== value) {
    throw new RangeError('Date must use exact YYYY-MM-DD format');
  }
  validateMonth(value.slice(0, 7));
  const day = Number(value.slice(8, 10));
  if (day < 1 || day > daysInMonth(Number(value.slice(0, 4)), Number(value.slice(5, 7)))) {
    throw new RangeError('Date must contain a valid Gregorian calendar day');
  }
  return value;
}

/**
 * Validate both inclusive endpoints; equal endpoints are valid.
 * @throws TypeError for non-string endpoints; RangeError for invalid/reversed dates.
 */
export function validateDateRange(startDate: unknown, endDate: unknown): DateRange {
  const start = validateDate(startDate);
  const end = validateDate(endDate);
  if (start > end) {
    throw new RangeError('startDate must not be later than endDate');
  }
  return { startDate: start, endDate: end };
}

/**
 * Return inclusive month boundaries, including 9999-12-31, without a next month.
 * @throws TypeError for non-string input; RangeError for an invalid month.
 */
export function getMonthDateRange(value: unknown): DateRange {
  const month = validateMonth(value);
  const lastDay = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
  return { startDate: `${month}-01`, endDate: `${month}-${lastDay}` };
}
