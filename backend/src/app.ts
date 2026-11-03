import express from 'express';

// Importing the app never starts a listener or opens a database.
export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_request, response) => {
    response.status(200).json({ data: { status: 'ok' } });
  });

  return app;
}
