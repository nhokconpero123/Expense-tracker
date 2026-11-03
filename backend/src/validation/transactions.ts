import { validateDate } from './calendar.js';
import { validatePositiveId } from './ids.js';
import { validateMoneyCents } from './money.js';
import { validateRequestObject } from './request.js';

export type TransactionType = 'income' | 'expense';

export interface TransactionRequest {
  type: TransactionType;
  amountCents: number;
  categoryId: number;
  date: string;
  note: string;
}

/** @throws TypeError for non-strings; RangeError for unsupported types. */
export function validateTransactionType(value: unknown): TransactionType {
  if (typeof value !== 'string') throw new TypeError('type must be a string');
  if (value !== 'income' && value !== 'expense') {
    throw new RangeError('type must be income or expense');
  }
  return value;
}

/**
 * Validate complete POST/PUT editable fields, returning a fresh normalized object.
 * Omitted note becomes empty; explicit undefined/null is invalid. Length uses UTF-16
 * code units after trimming. Category existence/type checks belong to the service.
 * @throws TypeError for missing/wrong types; RangeError for unknown/invalid values.
 */
export function validateTransactionRequest(input: unknown): TransactionRequest {
  const body = validateRequestObject(input, ['type', 'amountCents', 'categoryId', 'date', 'note']);
  let note = '';
  if (Object.hasOwn(body, 'note')) {
    if (typeof body['note'] !== 'string') throw new TypeError('note must be a string');
    note = body['note'].trim();
    if (note.length > 500) throw new RangeError('note must be at most 500 characters after trimming');
  }
  return {
    type: validateTransactionType(body['type']),
    amountCents: validateMoneyCents(body['amountCents']),
    categoryId: validatePositiveId(body['categoryId']),
    date: validateDate(body['date']),
    note,
  };
}
