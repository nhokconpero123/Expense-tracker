import { createApp } from './app.js';
import { openDatabase } from './db/connection.js';
import { initializeDatabase } from './db/initialize.js';

const portText = process.env['PORT'] ?? '3001';
const port = Number(portText);
if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const host = '127.0.0.1';
try {
  const db = openDatabase();
  try { initializeDatabase(db); } catch (error) { db.close(); throw error; }
  const server = createApp(db).listen(port, host, () => {
    console.log(`Expense Tracker API listening at http://${host}:${port}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    db.close();
    console.error(`API failed to start (${error.code ?? 'unknown error'})`);
    process.exitCode = 1;
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      server.close(() => { db.close(); process.exit(0); });
    });
  }
} catch {
  console.error('API startup failed. Check database configuration and migrations.');
  process.exitCode = 1;
}
