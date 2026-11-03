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
