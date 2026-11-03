import { validateMonth } from './calendar.js';
import { parsePositiveId } from './ids.js';
import { validateMoneyCents } from './money.js';
import { validateRequestObject } from './request.js';

export interface BudgetBody { amountCents: number }
export interface BudgetParams { categoryId: number; month: string }
export interface BudgetRequest extends BudgetBody, BudgetParams {}

/** @throws TypeError for missing/wrong types; RangeError for unknown/invalid values. */
export function validateBudgetBody(input: unknown): BudgetBody {
  const body = validateRequestObject(input, ['amountCents']);
  return { amountCents: validateMoneyCents(body['amountCents']) };
}

/**
 * Validate both categoryId/month route parameters, including for future DELETE use.
 * Category existence and expense-only enforcement are deferred to database tasks.
 * @throws TypeError for missing/wrong types; RangeError for unknown/invalid values.
 */
export function validateBudgetParams(input: unknown): BudgetParams {
  const params = validateRequestObject(input, ['categoryId', 'month']);
  return { categoryId: parsePositiveId(params['categoryId']), month: validateMonth(params['month']) };
}

/** Validate an upsert body and its required route parameters; does not mutate inputs. */
export function validateBudgetRequest(body: unknown, params: unknown): BudgetRequest {
  return { ...validateBudgetBody(body), ...validateBudgetParams(params) };
}
