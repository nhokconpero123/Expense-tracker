import { validateRequestObject } from './request.js';
import { validateTransactionType } from './transactions.js';
import type { TransactionType } from './transactions.js';

/** Only an optional scalar type is accepted; absent and invalid values are distinct. */
export function validateCategoryQuery(input: unknown): { type?: TransactionType } {
  const query = validateRequestObject(input, ['type']);
  return Object.hasOwn(query, 'type') ? { type: validateTransactionType(query['type']) } : {};
}
