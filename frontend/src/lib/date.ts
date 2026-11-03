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
  const monthName = MONTH_NAMES[monthIndex];
  return `${monthName} ${yearStr}`;
}

