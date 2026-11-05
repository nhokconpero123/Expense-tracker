import { createServer } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { openDatabase } from './db/connection.js';
import { initializeDatabase } from './db/initialize.js';

// Bind explicitly to loopback: Supertest's implicit listener uses a wildcard host.
const database = openDatabase({ mode: 'test' });
initializeDatabase(database);
const server = createServer(createApp(database));

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  database.close();
});

describe('GET /api/health', () => {
  it('reports database readiness with the original success JSON', async () => {
    const response = await request(server).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ data: { status: 'ok' } });
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('root health route', () => {
  it('returns 404 in local mode', async () => {
    expect((await request(server).get('/')).status).toBe(404);
  });

  it.each(['ready', 'missing', 'closed', 'uninitialized'])(
    'matches health status and JSON in public demo mode with a %s database', async condition => {
      const db = condition === 'missing' ? undefined : openDatabase({ mode: 'test' });
      if (db && condition !== 'uninitialized') initializeDatabase(db);
      if (condition === 'closed') db?.close();
      const demo = { origin: 'https://expense-demo.pages.dev', host: 'expense-demo.onrender.com' };
      const demoServer = createServer(createApp(db, demo));
      await new Promise<void>((resolve, reject) => {
        demoServer.once('error', reject);
        demoServer.listen(0, '127.0.0.1', resolve);
      });
      try {
        for (const origin of [undefined, demo.origin]) {
          const get = (path: string) => {
            const req = request(demoServer).get(path).set('Host', demo.host);
            return origin ? req.set('Origin', origin) : req;
          };
          const health = await get('/api/health');
          const root = await get('/');
          expect(root.status).toBe(health.status);
          expect(root.body).toEqual(health.body);
          expect(root.status).toBe(condition === 'ready' ? 200 : 503);
          expect(root.body).toEqual(condition === 'ready'
            ? { data: { status: 'ok', publicDemoMode: true, demoMonth: '2026-11' } }
            : { error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable.' } });
        }
      } finally {
        await new Promise<void>((resolve, reject) => {
          demoServer.close(error => error ? reject(error) : resolve());
        });
        if (db?.open) db.close();
      }
    },
  );
});
