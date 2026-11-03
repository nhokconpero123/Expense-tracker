export const MAX_AMOUNT_CENTS = 100_000_000;

/**
 * Validate an already-decoded JSON amount without coercion.
 * @throws TypeError if value is not a primitive number.
 * @throws RangeError if value is not a safe integer in 1..100000000.
 */
export function validateMoneyCents(value: unknown): number {
  if (typeof value !== 'number') {
    throw new TypeError('Amount must be a JSON number in integer cents');
  }
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_AMOUNT_CENTS) {
    throw new RangeError('Amount must be a safe integer from 1 to 100000000 cents');
  }
  return value;
}
