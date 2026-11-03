const MIN_YEAR = 1900;
const MAX_YEAR = 9999;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Validates whether a string is a canonical YYYY-MM month between 1900 and 9999.
 */
export function isValidMonth(month: string): boolean {
  if (typeof month !== 'string') return false;
  const match = /^([0-9]{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return false;
  const year = Number(match[1]);
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

/**
 * Validates whether a string is a valid Gregorian calendar date in YYYY-MM-DD format (years 1900-9999).
 */
export function isValidDate(date: string): boolean {
  if (typeof date !== 'string') return false;
  const match = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.exec(date);
  if (!match) return false;
  if (!isValidMonth(date.slice(0, 7))) return false;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return day >= 1 && day <= daysInMonth(year, month);
}

/**
 * Returns the current local calendar month in YYYY-MM format.
 * Never uses UTC so that it matches the user's local wall clock.
 */
export function getCurrentLocalMonth(referenceDate = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const result = `${year}-${month}`;
  if (!isValidMonth(result)) {
    throw new RangeError(`Current local month ${result} is outside supported range 1900-9999`);
  }
  return result;
}

/**
 * Returns the current local calendar date in YYYY-MM-DD format.
 */
export function getTodayLocalDate(referenceDate = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');
  const result = `${year}-${month}-${day}`;
  if (!isValidDate(result)) {
    throw new RangeError(`Current local date ${result} is outside supported range 1900-9999`);
  }
  return result;
}

/**
 * Shift a YYYY-MM string by delta months (+1, -1, etc.).
 * Bounds result between years 1900 and 9999.
 */
export function shiftMonth(month: string, delta: number): string {
  if (!isValidMonth(month)) {
    throw new RangeError(`Invalid month format: ${month}`);
  }
  if (!Number.isInteger(delta)) {
    throw new RangeError('Delta must be an integer');
  }

  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthNum = Number(monthStr);

  // Total months from year 0
  const totalMonths = year * 12 + (monthNum - 1) + delta;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12 + 12) % 12 + 1;

  if (newYear < MIN_YEAR || newYear > MAX_YEAR) {
    throw new RangeError(`Resulting year ${newYear} is outside supported range 1900-9999`);
  }

  return `${newYear}-${String(newMonth).padStart(2, '0')}`;
}

/**
 * Formats YYYY-MM into human-readable English: "November 2026".
 */
export function formatMonthDisplay(month: string): string {
  if (!isValidMonth(month)) {
    throw new RangeError(`Invalid month format: ${month}`);
  }
  const [yearStr, monthStr] = month.split('-');
  const monthIndex = Number(monthStr) - 1;
  const monthName = MONTH_NAMES[monthIndex]!;
  return `${monthName} ${yearStr}`;
}

/**
 * Formats YYYY-MM-DD into human-readable English: "Nov 3, 2026".
 */
export function formatDateDisplay(date: string): string {
  if (!isValidDate(date)) {
    throw new RangeError(`Invalid date format: ${date}`);
  }
  const [yearStr, monthStr, dayStr] = date.split('-');
  const monthIndex = Number(monthStr) - 1;
  const monthName = MONTH_NAMES[monthIndex]!;
  return `${monthName.slice(0, 3)} ${Number(dayStr)}, ${yearStr}`;
}
