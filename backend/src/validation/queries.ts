import { validateDate, validateDateRange } from './calendar.js';
import { parsePositiveId } from './ids.js';
import { validateRequestObject } from './request.js';
import { validateTransactionType } from './transactions.js';
import type { TransactionType } from './transactions.js';

export interface TransactionQuery {
  type?: TransactionType;
  categoryId?: number;
  startDate?: string;
  endDate?: string;
  q?: string;
  page: number;
  pageSize: number;
}

/**
 * Validate scalar query strings; absent fields alone receive defaults/omission.
 * q length uses UTF-16 code units after trimming; blank q is omitted. Filters are
 * retained together for later AND matching, without category existence checks.
 * @throws TypeError for wrong shapes/types; RangeError for unknown/invalid values.
 */
export function validateTransactionQuery(input: unknown): TransactionQuery {
  const query = validateRequestObject(input,
    ['type', 'categoryId', 'startDate', 'endDate', 'q', 'page', 'pageSize']);
  const result: TransactionQuery = {
    page: Object.hasOwn(query, 'page') ? parsePositiveId(query['page']) : 1,
    pageSize: Object.hasOwn(query, 'pageSize') ? parsePositiveId(query['pageSize']) : 20,
  };
  if (result.pageSize > 100) throw new RangeError('pageSize must be from 1 to 100');
  if (Object.hasOwn(query, 'type')) result.type = validateTransactionType(query['type']);
  if (Object.hasOwn(query, 'categoryId')) result.categoryId = parsePositiveId(query['categoryId']);
  if (Object.hasOwn(query, 'startDate')) result.startDate = validateDate(query['startDate']);
  if (Object.hasOwn(query, 'endDate')) result.endDate = validateDate(query['endDate']);
  if (result.startDate !== undefined && result.endDate !== undefined) {
    validateDateRange(result.startDate, result.endDate);
  }
  if (Object.hasOwn(query, 'q')) {
    if (typeof query['q'] !== 'string') throw new TypeError('q must be a string');
    const q = query['q'].trim();
    if (q.length > 100) throw new RangeError('q must be at most 100 characters after trimming');
    if (q !== '') result.q = q;
  }
  return result;
}
