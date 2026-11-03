/**
 * Validate a numeric ID without coercion or checking database existence.
 * @throws TypeError if value is not a primitive number.
 * @throws RangeError if value is not a positive safe integer.
 */
export function validatePositiveId(value: unknown): number {
  if (typeof value !== 'number') {
    throw new TypeError('ID must be a JSON number');
  }
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('ID must be a positive safe integer');
  }
  return value;
}

/**
 * Parse a canonical positive decimal path/query ID (no leading zeros).
 * Never trims whitespace or accepts signs, decimals, or exponent notation.
 * @throws TypeError if value is not a primitive string.
 * @throws RangeError if its format or numeric range is invalid.
 */
export function parsePositiveId(value: unknown): number {
  if (typeof value !== 'string') {
    throw new TypeError('Path/query ID must be a string');
  }
  // Compare the entire match because JavaScript's $ can precede a final newline.
  const match = /^[1-9][0-9]*$/.exec(value);
  if (match?.[0] !== value) {
    throw new RangeError('Path/query ID must contain only digits without leading zeros');
  }
  return validatePositiveId(Number(value));
}
