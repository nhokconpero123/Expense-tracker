import express from 'express';
import { errorHandler, notFound } from './middleware/errors.js';

// Importing the app never starts a listener or opens a database.
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: 16 * 1024 }));

  app.get('/api/health', (_request, response) => {
    response.status(200).json({ data: { status: 'ok' } });
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
