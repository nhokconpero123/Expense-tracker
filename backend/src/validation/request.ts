/** Validate a plain request record without reading accessors or accepting unknown keys. */
export function validateRequestObject(value: unknown, allowedKeys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Request must be a plain object');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Request must be a plain object');
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowedKeys.includes(key)) {
      throw new RangeError('Request contains an unknown field');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) {
      throw new TypeError('Request fields must be data properties');
    }
  }
  return value as Record<string, unknown>;
}
