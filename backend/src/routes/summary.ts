import type Database from 'better-sqlite3';
import { Router } from 'express';
import { validateInput } from '../middleware/errors.js';
import { getMonthlySummary } from '../services/summary.js';
import { validateSummaryQuery } from '../validation/summary.js';

export function createSummaryRouter(db: Database.Database): Router {
  const router = Router();
  router.get('/', (request, response) => {
    const { month } = validateInput(() => validateSummaryQuery(request.query));
    response.json({ data: getMonthlySummary(db, month) });
  });
  return router;
}
