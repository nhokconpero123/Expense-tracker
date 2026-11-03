const MAX_AMOUNT_CENTS = 100_000_000;

/**
 * Format integer cents into a USD currency string (e.g. 200000 -> "$2,000.00").
 * Handles positive amounts, zero, and negative balances (e.g. -7550 -> "-$75.50").
 * @throws TypeError if input is not a number.
 * @throws RangeError if input is not a safe integer.
 */
export function formatCentsToUsd(cents: number): string {
  if (typeof cents !== 'number') {
    throw new TypeError('Cents amount must be a number');
  }
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('Cents amount must be a safe integer');
  }

  // Avoid "-$0.00" by normalizing negative zero
  const safeCents = cents === 0 ? 0 : cents;
  const dollars = safeCents / 100;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Parse unsigned USD input into 1..100000000 cents without rounding.
 * Accept whole dollars or one/two decimal places; leading zeros are allowed.
 * Whitespace, signs, separators, currency symbols, and exponents are rejected.
 * @throws TypeError if input is not a primitive string.
 * @throws RangeError if the format or resulting amount is invalid.
 */
export function parseUsdToCents(input: unknown): number {
  if (typeof input !== 'string') {
    throw new TypeError('USD amount must be a decimal string');
  }
  const match = /^([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(input);
  if (!match || match[0] !== input) {
    throw new RangeError('USD amount must contain whole dollars and at most two decimal places');
  }

  const dollars = match[1]!;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const centsDigits = `${dollars}${fraction}`.replace(/^0+/, '') || '0';
  // Bound the digit count before converting; arbitrarily large input cannot round.
  if (centsDigits.length > String(MAX_AMOUNT_CENTS).length) {
    throw new RangeError('USD amount must be between 0.01 and 1000000.00');
  }
  const cents = Number(centsDigits);
  if (cents < 1 || cents > MAX_AMOUNT_CENTS) {
    throw new RangeError('USD amount must be between 0.01 and 1000000.00');
  }
  return cents;
}
