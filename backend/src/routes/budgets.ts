import type Database from 'better-sqlite3';
import { Router } from 'express';
import { NotFoundError, RequestValidationError, validateInput } from '../middleware/errors.js';
import { BudgetCategoryError, BudgetNotFoundError, getBudgetMonth, removeBudget, saveBudget } from '../services/budgets.js';
import { validateBudgetParams, validateBudgetRequest } from '../validation/budgets.js';
import { validateSummaryQuery } from '../validation/summary.js';
import { validateRequestObject } from '../validation/request.js';

export function createBudgetRouter(db: Database.Database): Router {
  const router = Router();
  router.get('/', (request, response) => {
    const { month } = validateInput(() => validateSummaryQuery(request.query));
    response.json({ data: getBudgetMonth(db, month) });
  });
  router.put('/:categoryId/:month', (request, response) => {
    validateInput(() => validateRequestObject(request.query, []));
    const input = validateInput(() => validateBudgetRequest(request.body, request.params));
    try { response.json({ data: saveBudget(db, input) }); }
    catch (error) {
      if (error instanceof BudgetCategoryError) throw new RequestValidationError('categoryId');
      throw error;
    }
  });
  router.delete('/:categoryId/:month', (request, response) => {
    validateInput(() => validateRequestObject(request.query, []));
    const input = validateInput(() => validateBudgetParams(request.params));
    try { removeBudget(db, input); response.status(204).end(); }
    catch (error) {
      if (error instanceof BudgetCategoryError) throw new RequestValidationError('categoryId');
      if (error instanceof BudgetNotFoundError) throw new NotFoundError();
      throw error;
    }
  });
  return router;
}
