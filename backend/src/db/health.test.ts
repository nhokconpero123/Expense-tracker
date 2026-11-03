import { createServer } from 'node:http';
import type Database from 'better-sqlite3';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { openDatabase } from './connection.js';
import { initializeDatabase } from './initialize.js';

async function health(db?: Database.Database) {
  const server = createServer(createApp(db));
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try { return await request(server).get('/api/health'); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

describe('database readiness HTTP contract', () => {
  it('preserves health success with an initialized database', async () => {
    const db = openDatabase({ mode: 'test' });
    try {
      initializeDatabase(db);
      const response = await health(db);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { status: 'ok' } });
    } finally { db.close(); }
  });
  it.each(['missing', 'closed', 'uninitialized', 'schema-missing', 'catalog-missing', 'foreign-keys-disabled', 'future-version'])(
    'returns generic 503 for %s database readiness', async (condition) => {
      const db = openDatabase({ mode: 'test' });
      try {
        if (condition !== 'uninitialized') initializeDatabase(db);
        if (condition === 'closed') db.close();
        if (condition === 'schema-missing') db.exec('DROP TABLE budgets');
        if (condition === 'catalog-missing') db.exec("DELETE FROM categories WHERE name = 'Food'");
        if (condition === 'foreign-keys-disabled') db.pragma('foreign_keys = OFF');
        if (condition === 'future-version') db.exec('INSERT INTO schema_migrations(version) VALUES (2)');
        const response = await health(condition === 'missing' ? undefined : db);
        expect(response.status).toBe(503);
        expect(response.headers['content-type']).toMatch(/application\/json/);
        expect(response.body).toEqual({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable.' } });
        expect(response.text).not.toMatch(/sqlite|SELECT|stack|Error:|\.db|\.sqlite|[A-Z]:\\/);
      } finally { if (db.open) db.close(); }
    },
  );
  it('does not initialize or reseed from a health request', async () => {
    const db = openDatabase({ mode: 'test' });
    try {
      await health(db);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([]);
    } finally { db.close(); }
  });
});
