import { createConnection } from 'node:net';
import { createServer, request as httpRequest } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createPublicDemoDatabase } from './db/publicDemo.js';
import { serverConfiguration, protectDemoTransports } from './publicDemo.js';

const origin = 'https://expense-demo.pages.dev';
const host = 'expense-demo.onrender.com';
const db = createPublicDemoDatabase();
const app = createApp(db, { origin, host });
const server = createServer(app);
protectDemoTransports(server);
const snapshot = () => db.serialize().toString('base64');
function call(method: string, path: string, headers: Record<string, string> = {}, body?: string) {
  return new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const address = server.address();
    if (!address || typeof address === 'string') return reject(new Error('Missing test listener'));
    const req = httpRequest({ hostname: '127.0.0.1', port: address.port, method, path, headers: { Host: host, Connection: 'close', ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}), ...headers } }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on('error', reject); req.end(body);
  });
}
beforeAll(async () => { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); });

describe('public demo read boundary', () => {
  const routes = ['/', '/api/transactions', '/api/transactions/1', '/api/budgets/4/2026-11', '/api/categories',
    '/api/summary?month=2026-11', '/api/health', '/maintenance'];
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'TRACE', 'PROPFIND', 'M-SEARCH']) {
    it.each(routes)(`${method} %s cannot change any SQLite page`, async path => {
      const before = snapshot();
      const result = await call(method, path, { Origin: origin, 'Content-Type': 'application/json', 'X-HTTP-Method-Override': 'GET' }, '{invalid JSON');
      expect(result.status).toBe(403);
      expect(JSON.parse(result.body).error.code).toBe('PUBLIC_DEMO_READ_ONLY');
      expect(snapshot()).toBe(before);
    });
  }
  it.each(['/', '/api/health', '/api/categories', '/api/transactions', '/api/transactions/1', '/api/summary?month=2026-11', '/api/budgets?month=2026-11'])(
    'allows GET and HEAD for %s without writes', async path => {
      const before = snapshot();
      for (const method of ['GET', 'HEAD']) {
        const result = await call(method, path, { Origin: origin });
        expect(result.status).toBe(200);
        expect(result.headers['access-control-allow-origin']).toBe(origin);
        expect(result.headers['access-control-allow-credentials']).toBeUndefined();
        if (method === 'HEAD') expect(result.body).toBe('');
      }
      expect(snapshot()).toBe(before);
    });
  it.each(['CONNECT', 'UPGRADE'])('rejects %s without tunneling or mutation', async method => {
    const before = snapshot();
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No listener');
    const text = await new Promise<string>((resolve, reject) => {
      const socket = createConnection({ host: '127.0.0.1', port: address.port });
      let result = '';
      socket.on('connect', () => socket.write(method === 'CONNECT'
        ? `CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}\r\n\r\n`
        : `GET /api/health HTTP/1.1\r\nHost: ${host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`));
      socket.on('data', chunk => { result += chunk; });
      socket.on('end', () => { socket.destroy(); resolve(result); }); socket.on('error', reject);
    });
    expect(text).toContain('403 Forbidden'); expect(snapshot()).toBe(before);
  });
  it('permits originless health checks and declares fictional demo mode', async () => {
    const result = await call('GET', '/api/health');
    expect(JSON.parse(result.body)).toEqual({ data: { status: 'ok', publicDemoMode: true, demoMonth: '2026-11' } });
    expect(result.headers['access-control-allow-origin']).toBeUndefined();
  });
  it.each(['https://evil.example', 'null', origin + '.evil.test', origin + '/', 'http://expense-demo.pages.dev'])(
    'rejects disallowed Origin %s', async value => {
      for (const path of ['/', '/api/categories']) {
        const result = await call('GET', path, { Origin: value });
        expect(result.status).toBe(403); expect(result.headers['access-control-allow-origin']).toBeUndefined();
      }
    });
  it.each(['evil.example', host + '.evil.test', 'localhost', host + ':443'])(
    'rejects disallowed Host %s even with spoofed forwarding', async value => {
      expect((await call('GET', '/api/health', { Host: value, 'X-Forwarded-Host': host })).status).toBe(403);
      expect((await call('GET', '/', { Host: value, 'X-Forwarded-Host': host })).status).toBe(403);
    });
  it('handles only approved read preflights', async () => {
    const result = await call('OPTIONS', '/api/transactions', { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'accept, Content-Type' });
    expect(result.status).toBe(204); expect(result.headers['access-control-allow-methods']).toBe('GET, HEAD');
  });
  it.each(['POST', 'PUT', 'DELETE', 'PATCH', 'TRACE'])( 'rejects preflight for %s', async method => {
    expect((await call('OPTIONS', '/api/transactions', { Origin: origin, 'Access-Control-Request-Method': method })).status).toBe(403);
  });
  it('rejects arbitrary preflight headers and originless OPTIONS', async () => {
    expect((await call('OPTIONS', '/api/health')).status).toBe(403);
    expect((await call('OPTIONS', '/api/health', { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' })).status).toBe(403);
  });
  it('keeps existing request validation errors sanitized', async () => {
    const result = await call('GET', '/api/summary?month=private-invalid-input', { Origin: origin });
    expect(result.status).toBe(400); expect(result.body).not.toContain('private-invalid-input');
    expect(result.headers['access-control-allow-origin']).toBe(origin);
  });
  it('seeds exact totals, zero-filled days, and all budget states', async () => {
    const summary = JSON.parse((await call('GET', '/api/summary?month=2026-11')).body).data;
    expect([summary.incomeCents, summary.expenseCents, summary.balanceCents]).toEqual([395000, 215500, 179500]);
    expect(summary.dailyExpenses).toHaveLength(30);
    expect(JSON.parse((await call('GET', '/api/transactions')).body).data).toHaveLength(13);
    const states = JSON.parse((await call('GET', '/api/budgets?month=2026-11')).body).data.items.map((item: { status: string }) => item.status);
    expect(new Set(states)).toEqual(new Set(['under', 'at_limit', 'over', 'no_budget']));
  });
  it('ignores DATABASE_PATH, recreates fresh memory data, and enforces SQLite query-only', () => {
    const second = createPublicDemoDatabase();
    try {
      expect(second.name).toBe(':memory:'); expect(db.name).toBe(':memory:');
      expect(second.prepare('SELECT count(*) AS count FROM transactions').get()).toEqual({ count: 13 });
      expect(() => second.prepare('DELETE FROM transactions').run()).toThrow();
      expect(() => db.prepare('UPDATE budgets SET amount_cents = 1').run()).toThrow();
    } finally { second.close(); }
  });
});

describe('explicit server configuration', () => {
  it('defaults to writable localhost without public options', () => {
    expect(serverConfiguration({})).toEqual({ host: '127.0.0.1', port: 3001, demo: undefined });
  });
  it('requires read-only configuration before any hosted binding', () => {
    expect(() => serverConfiguration({ HOSTED_DEPLOYMENT: 'true' })).toThrow();
    expect(() => serverConfiguration({ PUBLIC_DEMO_MODE: 'true' })).toThrow();
    expect(() => serverConfiguration({ PUBLIC_DEMO_MODE: 'yes' })).toThrow();
    expect(serverConfiguration({ PUBLIC_DEMO_MODE: 'true', HOSTED_DEPLOYMENT: 'true', PUBLIC_DEMO_ORIGIN: origin, PUBLIC_DEMO_HOST: host, PORT: '10000' })).toEqual({ host: '0.0.0.0', port: 10000, demo: { origin, host } });
  });
  it.each(['https://example.com/path', 'http://example.com', 'https://example.com/', 'https://user@example.com', 'https://*.pages.dev', '*'])(
    'rejects unsafe configured origin %s', value => {
      expect(() => serverConfiguration({ PUBLIC_DEMO_MODE: 'true', PUBLIC_DEMO_ORIGIN: value, PUBLIC_DEMO_HOST: host })).toThrow();
    });
  it.each(['*', 'example.com:443', 'https://example.com', 'EXAMPLE.COM', ''])('rejects unsafe configured host %s', value => {
    expect(() => serverConfiguration({ PUBLIC_DEMO_MODE: 'true', PUBLIC_DEMO_ORIGIN: origin, PUBLIC_DEMO_HOST: value })).toThrow();
  });
});
