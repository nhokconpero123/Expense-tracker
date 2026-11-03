import express from 'express';
import type Database from 'better-sqlite3';
import { isDatabaseReady } from './db/initialize.js';
import { errorHandler, notFound } from './middleware/errors.js';

// Importing the app never starts a listener or opens a database.
export function createApp(database?: Database.Database) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: 16 * 1024 }));

  app.get('/api/health', (_request, response) => {
    if (!database || !isDatabaseReady(database)) {
      response.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable.' } });
      return;
    }
    response.status(200).json({ data: { status: 'ok' } });
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
