import type Database from 'better-sqlite3';
import { Router } from 'express';
import { validateInput } from '../middleware/errors.js';
import { listCategories } from '../repositories/categories.js';
import { validateCategoryQuery } from '../validation/categories.js';

export function createCategoryRouter(db: Database.Database): Router {
  const router = Router();
  router.get('/', (request, response) => {
    const query = validateInput(() => validateCategoryQuery(request.query));
    response.json({ data: listCategories(db, query.type) });
  });
  return router;
}
