import { validateMonth } from './calendar.js';
import { validateRequestObject } from './request.js';

/** Explicit month only; list filters/pagination never influence a summary request. */
export function validateSummaryQuery(input: unknown): { month: string } {
  const query = validateRequestObject(input, ['month']);
  return { month: validateMonth(query['month']) };
}
