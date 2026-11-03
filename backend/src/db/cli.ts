import { openDatabase } from './connection.js';
import { initializeDatabase } from './initialize.js';

try {
  const db = openDatabase();
  try {
    initializeDatabase(db);
    console.log('Database initialized successfully. Existing records preserved.');
  } finally { db.close(); }
} catch {
  console.error('Database initialization failed. Check configuration and migration compatibility.');
  process.exitCode = 1;
}
