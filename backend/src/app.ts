import { publicDemoBoundary, type PublicDemoOptions } from './publicDemo.js';
import express, { type RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { isDatabaseReady } from './db/initialize.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { createCategoryRouter } from './routes/categories.js';
import { createTransactionRouter } from './routes/transactions.js';
import { createSummaryRouter } from './routes/summary.js';
import { createBudgetRouter } from './routes/budgets.js';

// Importing the app never starts a listener or opens a database.
export function createApp(database?: Database.Database, demo?: PublicDemoOptions) {
  const app = express();
  app.disable('x-powered-by');
  if (demo) app.use(publicDemoBoundary(demo));
  app.use(express.json({ limit: 16 * 1024 }));

  const healthHandler: RequestHandler = (_request, response) => {
    if (!database || !isDatabaseReady(database)) {
      response.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable.' } });
      return;
    }
    response.status(200).json({ data: { status: 'ok', ...(demo ? { publicDemoMode: true, demoMonth: '2026-11' } : {}) } });
  };
  app.get('/api/health', healthHandler);
  if (demo) app.get('/', healthHandler);

  if (database) {
    app.use('/api/categories', createCategoryRouter(database));
    app.use('/api/transactions', createTransactionRouter(database));
    app.use('/api/summary', createSummaryRouter(database));
    app.use('/api/budgets', createBudgetRouter(database));
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
