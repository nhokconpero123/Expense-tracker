import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { createTestDatabaseFile, openDatabase } from '../db/connection.js';
import { initializeDatabase } from '../db/initialize.js';

let db: Database.Database; let server: Server;
let original: Record<string, unknown>;
async function listen(database: Database.Database): Promise<Server> {
  const listener = createServer(createApp(database));
  await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  return listener;
}
async function close(listener: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}
function category(name: string): number {
  return (db.prepare('SELECT id FROM categories WHERE name=?').get(name) as { id: number }).id;
}
function input() { return { type: 'expense', amountCents: 1, categoryId: category('Food'), date: '2026-01-01' }; }
function rows() { return db.prepare('SELECT * FROM transactions ORDER BY id').all(); }
function safeError(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status); expect(response.body.error.code).toBe(code);
  expect(response.headers['content-type']).toMatch(/application\/json/);
  expect(response.text).not.toMatch(/PRIVATE_NOTE|SELECT|sqlite|stack|C:\\/);
}
beforeEach(async () => {
  db = openDatabase({ mode: 'test' }); initializeDatabase(db); server = await listen(db);
  const created = await request(server).post('/api/transactions').send({ ...input(), note: 'Old note' });
  expect(created.status).toBe(201); original = created.body.data;
});
afterEach(async () => { await close(server); if (db.open) db.close(); vi.restoreAllMocks(); });

describe('complete transaction replacement', () => {
  it('replaces type/category/amount/month while preserving ID and createdAt', async () => {
    const body = { type: 'income', amountCents: 1234, categoryId: category('Salary'), date: '2027-02-28', note: ' New income ' };
    const response = await request(server).put('/api/transactions/1').send(body);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ ...original, ...body, note: 'New income', categoryName: 'Salary', updatedAt: expect.any(String) });
    expect(response.body.data.updatedAt > String(original['updatedAt'])).toBe(true);
    expect(response.body.data.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(response.headers['location']).toBeUndefined();
    expect((await request(server).get('/api/transactions/1')).body).toEqual(response.body);
    expect((await request(server).get('/api/transactions').query({ type: 'expense', startDate: '2026-01-01', endDate: '2026-01-31' })).body.meta.total).toBe(0);
    const matched = await request(server).get('/api/transactions').query({ type: 'income', categoryId: body.categoryId, startDate: '2027-02-01', endDate: '2027-02-28', q: 'NEW INCOME' });
    expect(matched.body.data).toEqual([response.body.data]);
    expect((await request(server).get('/api/transactions').query({ q: 'Old note' })).body.meta.total).toBe(0);
  });
  it('advances updatedAt monotonically even for repeated edits ahead of the current clock', async () => {
    db.exec("UPDATE transactions SET updated_at='2099-12-31T23:59:59.999Z' WHERE id=1");
    const first = await request(server).put('/api/transactions/1').send(input());
    const second = await request(server).put('/api/transactions/1').send(input());
    expect(first.status).toBe(200); expect(second.status).toBe(200);
    expect(first.body.data.updatedAt).toBe('2100-01-01T00:00:00.000Z');
    expect(second.body.data.updatedAt).toBe('2100-01-01T00:00:00.001Z');
    expect(second.body.data.createdAt).toBe(original['createdAt']);
  });
  it.each([1, 29, 100_000_000])('preserves exact replacement cents %i and clears omitted note', async (amountCents) => {
    const response = await request(server).put('/api/transactions/1').send({ ...input(), amountCents });
    expect(response.status).toBe(200); expect(response.body.data.amountCents).toBe(amountCents);
    expect(response.body.data.note).toBe('');
  });
  it('accepts a matching expense category switch, 500-character note and final December 9999', async () => {
    const response = await request(server).put('/api/transactions/1').send({ ...input(), categoryId: category('Housing'), date: '9999-12-31', note: ` ${'x'.repeat(500)} ` });
    expect(response.status).toBe(200); expect(response.body.data.note).toBe('x'.repeat(500));
    expect(response.body.data.categoryName).toBe('Housing'); expect(response.body.data.date).toBe('9999-12-31');
  });
  it.each(['type','amountCents','categoryId','date'])('requires %s rather than partially patching', async (field) => {
    const before = rows(); const body: Record<string, unknown> = { ...input() }; delete body[field];
    safeError(await request(server).put('/api/transactions/1').send(body), 400, 'VALIDATION_ERROR');
    expect(rows()).toEqual(before);
  });
  it.each([{ amountCents: 0 }, { amountCents: 1.5 }, { amountCents: '1' }, { amountCents: 100_000_001 },
    { type: 'transfer' }, { categoryId: 999999 }, { categoryId: '1' }, { date: '1900-02-29' },
    { note: null }, { note: [] }, { note: 'x'.repeat(501) }, { note: '\0PRIVATE_NOTE' },
    { note: 'PRIVATE\0_NOTE' }, { note: 'PRIVATE_NOTE\0' }, { id: 999 }, { createdAt: 'changed' },
    { updatedAt: 'changed' }, { extra: 'PRIVATE_NOTE' }])('rolls back invalid edit %j', async (override) => {
    const before = rows();
    safeError(await request(server).put('/api/transactions/1').send({ ...input(), ...override }), 400, 'VALIDATION_ERROR');
    expect(rows()).toEqual(before);
  });
  it.each([['expense','Salary'],['income','Food']] as const)('rejects mismatched %s/%s category', async (type, name) => {
    const before = rows();
    safeError(await request(server).put('/api/transactions/1').send({ ...input(), type, categoryId: category(name) }), 400, 'VALIDATION_ERROR');
    expect(rows()).toEqual(before);
  });
  it.each(['{}','[]','null','{"note":"PRIVATE_NOTE",'])('rejects malformed/incomplete body %s', async (body) => {
    const before = rows(); const response = await request(server).put('/api/transactions/1').type('json').send(body);
    expect(response.status).toBe(400); expect(response.text).not.toContain('PRIVATE_NOTE'); expect(rows()).toEqual(before);
  });
  it('binds replacement note text as data', async () => {
    const note = "'); DROP TABLE transactions; --";
    const response = await request(server).put('/api/transactions/1').send({ ...input(), note });
    expect(response.status).toBe(200); expect(response.body.data.note).toBe(note); expect(rows()).toHaveLength(1);
  });
});

describe('mutation identifiers and missing records', () => {
  for (const method of ['put','delete'] as const) {
    it.each(['0','01','-1','+1','1.5','1e2','abc','9007199254740992','1%20','%ZZ','%E0%A4'])(
      `rejects malformed ${method} ID %s without mutation`, async (id) => {
        const before = rows();
        safeError(await request(server)[method](`/api/transactions/${id}`).send(input()), 400, 'VALIDATION_ERROR');
        expect(rows()).toEqual(before);
      },
    );
    it(`returns 404 for a missing ${method} record`, async () => {
      const before = rows();
      safeError(await request(server)[method]('/api/transactions/999999').send(input()), 404, 'NOT_FOUND');
      expect(rows()).toEqual(before);
    });
    it(`rejects unknown ${method} query fields`, async () => {
      const before = rows();
      safeError(await request(server)[method]('/api/transactions/1?extra=1').send(input()), 400, 'VALIDATION_ERROR');
      expect(rows()).toEqual(before);
    });
  }
});

describe('atomic mutation safety', () => {
  function largeFixture(type: 'income' | 'expense', date: string, amount: bigint) {
    db.pragma('ignore_check_constraints = ON');
    try {
      db.prepare('INSERT INTO transactions(type,amount_cents,category_id,transaction_date) VALUES (?,?,?,?)')
        .run(type, amount, category(type === 'income' ? 'Salary' : 'Food'), date);
    } finally { db.pragma('ignore_check_constraints = OFF'); }
  }
  it('rolls back unsafe destination-month totals when type/category/month change', async () => {
    largeFixture('income','2027-02-01',BigInt(Number.MAX_SAFE_INTEGER) - 1n);
    const before = rows();
    const body = { ...input(), type: 'income', categoryId: category('Salary'), date: '2027-02-28', amountCents: 2 };
    safeError(await request(server).put('/api/transactions/1').send(body), 400, 'VALIDATION_ERROR');
    expect(rows()).toEqual(before);
    expect((await request(server).put('/api/transactions/1').send({ ...body, amountCents: 1 })).status).toBe(200);
  });
  it('checks the old month as well as the destination month', async () => {
    largeFixture('expense','2026-01-02',BigInt(Number.MAX_SAFE_INTEGER) + 1n);
    const before = rows();
    safeError(await request(server).put('/api/transactions/1').send({ ...input(), date: '2026-02-01' }), 400, 'VALIDATION_ERROR');
    expect(rows()).toEqual(before);
  });
  it('retains all-time protection even when individual months remain safe', async () => {
    largeFixture('expense','2026-02-01',BigInt(Number.MAX_SAFE_INTEGER) - 1n);
    const before = rows();
    safeError(await request(server).put('/api/transactions/1').send({ ...input(), amountCents: 2 }), 400, 'VALIDATION_ERROR');
    expect(rows()).toEqual(before);
  });
  it('moves the original amount without double-counting it in aggregate checks', async () => {
    largeFixture('expense','2026-02-01',BigInt(Number.MAX_SAFE_INTEGER) - 1n);
    const response = await request(server).put('/api/transactions/1').send({ ...input(), date: '2026-02-28' });
    expect(response.status).toBe(200);
    expect(db.prepare("SELECT sum(amount_cents) AS total FROM transactions WHERE transaction_date LIKE '2026-02-%'").safeIntegers(true).get())
      .toEqual({ total: BigInt(Number.MAX_SAFE_INTEGER) });
    expect(db.prepare("SELECT count(*) AS n FROM transactions WHERE transaction_date LIKE '2026-01-%'").get()).toEqual({ n: 0 });
  });
  it.each(['UPDATE','DELETE'] as const)('rolls back unexpected %s failures including side effects', async (operation) => {
    const before = rows();
    db.exec(`CREATE TABLE mutation_audit(id INTEGER);
      CREATE TRIGGER fail_mutation AFTER ${operation} ON transactions BEGIN
      INSERT INTO mutation_audit VALUES(OLD.id); SELECT RAISE(ABORT,'PRIVATE_NOTE SELECT C:\\private\\database.sqlite'); END;`);
    const logger = vi.spyOn(console,'error').mockImplementation(() => {});
    const response = operation === 'UPDATE'
      ? await request(server).put('/api/transactions/1').send(input())
      : await request(server).delete('/api/transactions/1');
    safeError(response, 500, 'INTERNAL_ERROR'); expect(rows()).toEqual(before);
    expect(db.prepare('SELECT * FROM mutation_audit').all()).toEqual([]);
    expect(logger.mock.calls).toEqual([['HTTP request failed', { code: 'INTERNAL_ERROR' }]]);
  });
  it('rolls back replacement and audit data when response readback fails', async () => {
    const before = rows();
    db.exec(`CREATE TABLE mutation_audit(id INTEGER); CREATE TRIGGER lose_update AFTER UPDATE ON transactions BEGIN
      INSERT INTO mutation_audit VALUES(OLD.id); DELETE FROM transactions WHERE id=NEW.id; END;`);
    vi.spyOn(console,'error').mockImplementation(() => {});
    safeError(await request(server).put('/api/transactions/1').send(input()), 500, 'INTERNAL_ERROR');
    expect(rows()).toEqual(before); expect(db.prepare('SELECT * FROM mutation_audit').all()).toEqual([]);
  });
  it('rolls back ignored deletion side effects rather than reporting false success', async () => {
    const before = rows();
    db.exec(`CREATE TABLE mutation_audit(id INTEGER); CREATE TRIGGER ignore_delete BEFORE DELETE ON transactions BEGIN
      INSERT INTO mutation_audit VALUES(OLD.id); SELECT RAISE(IGNORE); END;`);
    vi.spyOn(console,'error').mockImplementation(() => {});
    safeError(await request(server).delete('/api/transactions/1'), 500, 'INTERNAL_ERROR');
    expect(rows()).toEqual(before); expect(db.prepare('SELECT * FROM mutation_audit').all()).toEqual([]);
  });
  it('returns generic errors for an unavailable database on both methods', async () => {
    const body = input(); db.close(); vi.spyOn(console,'error').mockImplementation(() => {});
    safeError(await request(server).put('/api/transactions/1').send(body), 500, 'INTERNAL_ERROR');
    safeError(await request(server).delete('/api/transactions/1'), 500, 'INTERNAL_ERROR');
  });
});

describe('transaction deletion and durable mutations', () => {
  it('returns empty 204, removes detail/list/search matches, and repeated delete returns 404', async () => {
    const response = await request(server).delete('/api/transactions/1');
    expect(response.status).toBe(204); expect(response.text).toBe('');
    expect(response.headers['content-type']).toBeUndefined(); expect(rows()).toEqual([]);
    safeError(await request(server).get('/api/transactions/1'),404,'NOT_FOUND');
    const list = await request(server).get('/api/transactions').query({ q: 'Old note' });
    expect(list.body).toEqual({ data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    safeError(await request(server).delete('/api/transactions/1'),404,'NOT_FOUND');
  });
  it('preserves other transactions and existing budget records on deletion', async () => {
    await request(server).post('/api/transactions').send(input());
    db.prepare("INSERT INTO budgets(category_id,amount_cents,month) VALUES (?,100,'2026-01')").run(category('Food'));
    const budget = db.prepare('SELECT * FROM budgets').all();
    expect((await request(server).delete('/api/transactions/1')).status).toBe(204);
    expect(rows()).toHaveLength(1); expect(db.prepare('SELECT * FROM budgets').all()).toEqual(budget);
  });
  it('persists replacement and deletion across private database close/reopen', async () => {
    const file = createTestDatabaseFile(); let connection = openDatabase({ mode: 'test', filename: file.filename });
    let listener: Server | undefined;
    try {
      initializeDatabase(connection); listener = await listen(connection);
      const id = (connection.prepare("SELECT id FROM categories WHERE name='Food'").get() as { id: number }).id;
      expect((await request(listener).post('/api/transactions').send({ ...input(), categoryId: id })).status).toBe(201);
      const updated = await request(listener).put('/api/transactions/1').send({ ...input(), categoryId: id, amountCents: 29, date: '9999-12-31', note: 'Persist replacement' });
      expect(updated.status).toBe(200);
      await close(listener); listener = undefined; connection.close();
      connection = openDatabase({ mode: 'test', filename: file.filename }); initializeDatabase(connection); listener = await listen(connection);
      expect((await request(listener).get('/api/transactions/1')).body).toEqual(updated.body);
      expect((await request(listener).delete('/api/transactions/1')).status).toBe(204);
      await close(listener); listener = undefined; connection.close();
      connection = openDatabase({ mode: 'test', filename: file.filename }); initializeDatabase(connection); listener = await listen(connection);
      safeError(await request(listener).get('/api/transactions/1'),404,'NOT_FOUND');
      expect((await request(listener).get('/api/transactions')).body.meta.total).toBe(0);
    } finally {
      if (listener) await close(listener); if (connection.open) connection.close(); file.dispose();
    }
  });
});
