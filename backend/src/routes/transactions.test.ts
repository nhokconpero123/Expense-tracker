import { createServer } from 'node:http';
import type Database from 'better-sqlite3';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { createTestDatabaseFile, openDatabase } from '../db/connection.js';
import { initializeDatabase } from '../db/initialize.js';

let db: Database.Database;
let server: Server;
async function listen(database: Database.Database): Promise<Server> {
  const listener = createServer(createApp(database));
  await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  return listener;
}
async function close(listener: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}
beforeEach(async () => {
  db = openDatabase({ mode: 'test' }); initializeDatabase(db); server = await listen(db);
});
afterEach(async () => { await close(server); if (db.open) db.close(); vi.restoreAllMocks(); });

function category(name: string): number {
  return (db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }).id;
}
function valid() {
  return { type: 'expense', amountCents: 1234, categoryId: category('Food'), date: '2024-02-29' };
}
function count(): number {
  return (db.prepare('SELECT count(*) AS n FROM transactions').get() as { n: number }).n;
}
function safeError(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toMatch(/application\/json/);
  expect(response.body.error.code).toBe(code);
  expect(response.body.error.message).toEqual(expect.any(String));
  expect(response.text).not.toMatch(/PRIVATE_NOTE|sqlite|SELECT|INSERT|stack|C:\\|\.db|Error:/);
  expect(response.headers['location']).toBeUndefined();
}

describe('GET /api/categories', () => {
  it('returns all 11 seeded categories sorted by type then name', async () => {
    const response = await request(server).get('/api/categories');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(Object.keys(response.body)).toEqual(['data']);
    expect(response.body.data.map((row: { type: string; name: string }) => `${row.type}:${row.name}`)).toEqual([
      'expense:Entertainment', 'expense:Food', 'expense:Health', 'expense:Housing', 'expense:Other Expense',
      'expense:Shopping', 'expense:Transport', 'expense:Utilities', 'income:Freelance', 'income:Other Income', 'income:Salary',
    ]);
    for (const row of response.body.data) expect(Object.keys(row).sort()).toEqual(['id', 'name', 'type']);
  });
  it.each([['income', 3], ['expense', 8]] as const)('filters %s categories', async (type, total) => {
    const response = await request(server).get('/api/categories').query({ type });
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(total);
    expect(response.body.data.every((row: { type: string }) => row.type === type)).toBe(true);
  });
  it.each(['?type=transfer', '?type=', '?type=Income', '?type=%20income', '?type=income&type=expense',
    '?type[]=income', '?extra=income', '?type=income%27%20OR%201=1--'])(
    'rejects invalid category query %s', async (query) => {
      safeError(await request(server).get(`/api/categories${query}`), 400, 'VALIDATION_ERROR');
    },
  );
});

describe('POST /api/transactions and GET /api/transactions/:id', () => {
  it.each([['income', 'Salary'], ['expense', 'Food']] as const)('creates and reads a valid %s transaction', async (type, name) => {
    const input = { ...valid(), type, categoryId: category(name), note: '  Exact cents  ' };
    const response = await request(server).post('/api/transactions').send(input);
    expect(response.status).toBe(201);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    const data = response.body.data;
    expect(Object.keys(response.body)).toEqual(['data']);
    expect(Object.keys(data).sort()).toEqual(['id','type','amountCents','categoryId','categoryName','date','note','createdAt','updatedAt'].sort());
    expect(data).toMatchObject({ ...input, note: 'Exact cents', categoryName: name, id: 1 });
    expect(Number.isSafeInteger(data.amountCents)).toBe(true);
    expect(data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(data.updatedAt).toBe(data.createdAt);
    expect(response.headers['location']).toBe(`/api/transactions/${data.id}`);
    const detail = await request(server).get(response.headers['location'] as string);
    expect(detail.status).toBe(200);
    expect(detail.body).toEqual(response.body);
    expect(count()).toBe(1);
  });
  it.each([1, 29, 100_000_000])('preserves exact amount %i cents', async (amountCents) => {
    const response = await request(server).post('/api/transactions').send({ ...valid(), amountCents });
    expect(response.status).toBe(201);
    expect(response.body.data.amountCents).toBe(amountCents);
    expect(db.prepare('SELECT amount_cents FROM transactions').get()).toEqual({ amount_cents: amountCents });
  });
  it('normalizes omitted/blank notes and accepts maximum note length and future date', async () => {
    for (const note of [undefined, '  ', 'x'.repeat(500)]) {
      const response = await request(server).post('/api/transactions').send({ ...valid(), date: '9999-12-31', ...(note === undefined ? {} : { note }) });
      expect(response.status).toBe(201);
      expect(response.body.data.note).toBe(note?.trim() ?? '');
      expect(response.body.data.date).toBe('9999-12-31');
    }
  });
  it.each([
    { amountCents: 0 }, { amountCents: -1 }, { amountCents: 1.5 }, { amountCents: 100_000_001 },
    { amountCents: '1234' }, { amountCents: null }, { amountCents: Number.MAX_SAFE_INTEGER + 1 },
    { categoryId: '1' }, { categoryId: 0 }, { categoryId: [] }, { categoryId: Number.MAX_SAFE_INTEGER + 1 },
    { type: 'transfer' }, { type: null }, { date: '1900-02-29' }, { date: '2026-04-31' },
    { date: '2026-01-01\n' }, { note: null }, { note: [] }, { note: 'x'.repeat(501) }, { extra: 'PRIVATE_NOTE' },
  ])('rejects invalid request override %j without mutation', async (override) => {
    safeError(await request(server).post('/api/transactions').send({ ...valid(), ...override }), 400, 'VALIDATION_ERROR');
    expect(count()).toBe(0);
  });
  it.each(['type', 'amountCents', 'categoryId', 'date'])('requires %s', async (key) => {
    const input: Record<string, unknown> = { ...valid() }; delete input[key];
    safeError(await request(server).post('/api/transactions').send(input), 400, 'VALIDATION_ERROR');
    expect(count()).toBe(0);
  });
  it.each(['\0PRIVATE_NOTE', 'PRIVATE\0_NOTE', 'PRIVATE_NOTE\0'])(
    'rejects NUL note %j before storage', async (note) => {
      safeError(await request(server).post('/api/transactions').send({ ...valid(), note }), 400, 'VALIDATION_ERROR');
      expect(count()).toBe(0);
    },
  );
  it.each(['{}', '[]', 'null', '{"note":"PRIVATE_NOTE",', '"PRIVATE_NOTE"'])(
    'rejects malformed/incomplete body %s', async (body) => {
      const response = await request(server).post('/api/transactions').type('json').send(body);
      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.text).not.toContain('PRIVATE_NOTE');
      expect(count()).toBe(0);
    },
  );
  it('rejects a missing body and unknown POST query', async () => {
    safeError(await request(server).post('/api/transactions'), 400, 'VALIDATION_ERROR');
    safeError(await request(server).post('/api/transactions?extra=1').send(valid()), 400, 'VALIDATION_ERROR');
    expect(count()).toBe(0);
  });
  it.each([['unknown', 999999], ['mismatched', 'Salary']] as const)('rejects %s category', async (_kind, selected) => {
    const categoryId = typeof selected === 'number' ? selected : category(selected);
    const response = await request(server).post('/api/transactions').send({ ...valid(), categoryId });
    safeError(response, 400, 'VALIDATION_ERROR');
    expect(response.body.error.fields).toHaveProperty('categoryId');
    expect(count()).toBe(0);
  });
  it('rejects an income transaction referencing an expense category', async () => {
    safeError(await request(server).post('/api/transactions').send({ ...valid(), type: 'income' }), 400, 'VALIDATION_ERROR');
    expect(count()).toBe(0);
  });
  it('returns 404 for a valid missing ID', async () => {
    safeError(await request(server).get('/api/transactions/999999'), 404, 'NOT_FOUND');
  });
  it.each(['0', '01', '-1', '+1', '1.5', '1e2', 'abc', '9007199254740992', '1%20', '1%27OR%201=1', '%ZZ', '%E0%A4', '%'])(
    'rejects malformed ID %s', async (id) => {
      safeError(await request(server).get(`/api/transactions/${id}`), 400, 'VALIDATION_ERROR');
    },
  );
  it('rejects unknown detail query parameters', async () => {
    safeError(await request(server).get('/api/transactions/1?extra=1'), 400, 'VALIDATION_ERROR');
  });
  it('uses parameter binding for note text', async () => {
    const note = "'); DROP TABLE transactions; --";
    const response = await request(server).post('/api/transactions').send({ ...valid(), note });
    expect(response.status).toBe(201);
    expect(response.body.data.note).toBe(note);
    expect(count()).toBe(1);
  });
});

describe('atomic aggregate safety and database failures', () => {
  function nearLimit(type: 'income' | 'expense') {
    // Controlled isolated fixture: production cannot insert this over-limit row.
    // Avoid creating 90+ million rows merely to reach the aggregate safety boundary.
    db.pragma('ignore_check_constraints = ON');
    try {
      db.prepare('INSERT INTO transactions(type,amount_cents,category_id,transaction_date) VALUES (?,?,?,?)')
        .run(type, BigInt(Number.MAX_SAFE_INTEGER) - 1n, category(type === 'income' ? 'Salary' : 'Food'), '2026-01-01');
    } finally { db.pragma('ignore_check_constraints = OFF'); }
  }
  it.each(['income', 'expense'] as const)('rolls back unsafe %s totals and allows the exact safe boundary', async (type) => {
    nearLimit(type);
    const original = db.prepare('SELECT * FROM transactions').all();
    const input = { ...valid(), type, categoryId: category(type === 'income' ? 'Salary' : 'Food'), date: '2027-12-31', amountCents: 2 };
    safeError(await request(server).post('/api/transactions').send(input), 400, 'VALIDATION_ERROR');
    expect(db.prepare('SELECT * FROM transactions').all()).toEqual(original);
    const success = await request(server).post('/api/transactions').send({ ...input, amountCents: 1 });
    expect(success.status).toBe(201);
    expect(success.body.data.amountCents).toBe(1);
    expect(db.prepare('SELECT sum(amount_cents) AS total FROM transactions').safeIntegers(true).get())
      .toEqual({ total: BigInt(Number.MAX_SAFE_INTEGER) });
  });
  it('bounds income and expense independently rather than rejecting a safe balance', async () => {
    nearLimit('income'); nearLimit('expense');
    expect((await request(server).post('/api/transactions').send({ ...valid(), amountCents: 1 })).status).toBe(201);
  });
  it('rolls back database-trigger failures and hides SQL/path/note details', async () => {
    db.exec(`CREATE TRIGGER fail_write AFTER INSERT ON transactions BEGIN
      SELECT RAISE(ABORT, 'PRIVATE_NOTE SELECT C:\\private\\database.sqlite'); END;`);
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    safeError(await request(server).post('/api/transactions').send({ ...valid(), note: 'PRIVATE_NOTE' }), 500, 'INTERNAL_ERROR');
    expect(count()).toBe(0);
    expect(logger.mock.calls).toEqual([['HTTP request failed', { code: 'INTERNAL_ERROR' }]]);
  });
  it('rolls back an insert if response readback fails', async () => {
    // Test-only trigger removes the just-inserted row, forcing readback failure.
    // Its audit side effect must also be rolled back by the enclosing transaction.
    db.exec(`CREATE TABLE readback_audit(id INTEGER);
      CREATE TRIGGER lose_row AFTER INSERT ON transactions BEGIN
        INSERT INTO readback_audit VALUES (NEW.id); DELETE FROM transactions WHERE id = NEW.id; END;`);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    safeError(await request(server).post('/api/transactions').send(valid()), 500, 'INTERNAL_ERROR');
    expect(count()).toBe(0);
    expect(db.prepare('SELECT * FROM readback_audit').all()).toEqual([]);
  });
  it('returns safe errors when the database connection is unavailable', async () => {
    const input = valid(); db.close();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    safeError(await request(server).get('/api/categories'), 500, 'INTERNAL_ERROR');
    safeError(await request(server).get('/api/transactions/1'), 500, 'INTERNAL_ERROR');
    safeError(await request(server).post('/api/transactions').send(input), 500, 'INTERNAL_ERROR');
  });
});

describe('HTTP persistence across database reopen', () => {
  it('reads the exact created transaction after closing and reopening a private test file', async () => {
    const file = createTestDatabaseFile();
    let connection = openDatabase({ mode: 'test', filename: file.filename });
    let listener: Server | undefined;
    try {
      initializeDatabase(connection); listener = await listen(connection);
      const id = (connection.prepare("SELECT id FROM categories WHERE name = 'Food'").get() as { id: number }).id;
      const created = await request(listener).post('/api/transactions').send({ ...valid(), categoryId: id, note: 'Persist exactly' });
      expect(created.status).toBe(201);
      await close(listener); listener = undefined; connection.close();
      connection = openDatabase({ mode: 'test', filename: file.filename });
      initializeDatabase(connection); listener = await listen(connection);
      const detail = await request(listener).get(created.headers['location'] as string);
      expect(detail.status).toBe(200);
      expect(detail.body).toEqual(created.body);
    } finally {
      if (listener) await close(listener);
      if (connection.open) connection.close();
      file.dispose();
    }
  });
});
