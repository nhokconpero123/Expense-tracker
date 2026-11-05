import { serverConfiguration, protectDemoTransports } from './publicDemo.js';
import { createPublicDemoDatabase } from './db/publicDemo.js';
import { createApp } from './app.js';
import { openDatabase } from './db/connection.js';
import { initializeDatabase } from './db/initialize.js';

const { port, host, demo } = serverConfiguration(process.env);
try {
  const db = demo ? createPublicDemoDatabase() : openDatabase();
  try { if (!demo) initializeDatabase(db); } catch (error) { db.close(); throw error; }
  const server = createApp(db, demo).listen(port, host, () => {
    console.log(`Expense Tracker API listening at http://${host}:${port}`);
  });

  if (demo) protectDemoTransports(server);

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
