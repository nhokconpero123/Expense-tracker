import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { createTestDatabaseFile, openDatabase } from '../db/connection.js';
import { initializeDatabase } from '../db/initialize.js';
import type { TransactionRequest } from '../validation/transactions.js';

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
function add(overrides: Partial<TransactionRequest> = {}): number {
  const row = { type: 'expense', amountCents: 1, categoryId: category('Food'), date: '2026-01-01', note: 'Lunch', ...overrides };
  return Number(db.prepare(`INSERT INTO transactions(type,amount_cents,category_id,transaction_date,note)
    VALUES (@type,@amountCents,@categoryId,@date,@note)`).run(row).lastInsertRowid);
}
async function list(query: Record<string, string | number> = {}) {
  const response = await request(server).get('/api/transactions').query(query);
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/application\/json/);
  expect(Object.keys(response.body).sort()).toEqual(['data', 'meta']);
  return response.body as { data: ({ id: number } & TransactionRequest)[];
    meta: { page: number; pageSize: number; total: number; totalPages: number } };
}

describe('transaction list pagination and ordering', () => {
  it('returns zero pages for empty results', async () => {
    expect(await list()).toEqual({ data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  });
  it('defaults to page 1 size 20 and accurate metadata', async () => {
    db.transaction(() => { for (let i = 0; i < 25; i++) add(); })();
    const result = await list();
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 25, totalPages: 2 });
    expect(result.data.map((row) => row.id)).toEqual(Array.from({ length: 20 }, (_, i) => 25 - i));
    const detail = await request(server).get('/api/transactions/25');
    expect(result.data[0]).toEqual(detail.body.data);
  });
  it('handles first, full, partial and beyond-last pages without duplicates', async () => {
    db.transaction(() => { for (let i = 0; i < 25; i++) add(); })();
    const ids: number[] = [];
    for (let page = 1; page <= 4; page++) {
      const result = await list({ page, pageSize: 10 });
      expect(result.meta).toEqual({ page, pageSize: 10, total: 25, totalPages: 3 });
      expect(result.data).toHaveLength([10, 10, 5, 0][page - 1]!);
      ids.push(...result.data.map((row) => row.id));
    }
    expect(ids).toEqual(Array.from({ length: 25 }, (_, i) => 25 - i));
  });
  it('sorts by date descending then ID descending across month/year boundaries', async () => {
    const old = add({ date: '1900-01-01' });
    const december = add({ date: '2026-12-31' });
    const january = add({ date: '2027-01-01' });
    const januaryTie = add({ date: '2027-01-01' });
    const final = add({ date: '9999-12-31' });
    expect((await list()).data.map((row) => row.id)).toEqual([final, januaryTie, january, december, old]);
  });
  it('returns an empty page for the largest valid page without offset precision loss', async () => {
    add();
    expect(await list({ page: String(Number.MAX_SAFE_INTEGER), pageSize: 100 }))
      .toEqual({ data: [], meta: { page: Number.MAX_SAFE_INTEGER, pageSize: 100, total: 1, totalPages: 1 } });
  });
  it('paginates 10000 rows with an accurate filtered COUNT and final page', async () => {
    const food = category('Food'); const salary = category('Salary');
    const insert = db.prepare(`INSERT INTO transactions(type,amount_cents,category_id,transaction_date,note) VALUES (?,?,?,?,?)`);
    db.transaction(() => {
      for (let i = 1; i <= 10_000; i++) {
        const expense = i % 2 === 0;
        insert.run(expense ? 'expense' : 'income', i, expense ? food : salary, '2026-01-01', expense ? 'Batch expense' : 'Batch income');
      }
    })();
    const first = await list({ pageSize: 100 });
    expect(first.meta).toEqual({ page: 1, pageSize: 100, total: 10_000, totalPages: 100 });
    expect(first.data[0]?.id).toBe(10_000);
    const last = await list({ type: 'expense', q: 'BATCH', pageSize: 100, page: 50 });
    expect(last.meta).toEqual({ page: 50, pageSize: 100, total: 5000, totalPages: 50 });
    expect(last.data.map((row) => row.id)).toEqual(Array.from({ length: 100 }, (_, i) => 200 - i * 2));
    expect((await list({ type: 'expense', pageSize: 100, page: 51 })).data).toEqual([]);
  });
});

describe('AND filters and inclusive dates', () => {
  it('retains only rows matching every supplied filter', async () => {
    const food = category('Food'); const housing = category('Housing');
    const matched = add({ date: '2024-02-29', note: 'Special Lunch' });
    add({ date: '2024-02-29', note: 'Special Dinner' });
    add({ date: '2024-02-29', note: 'Special Lunch', categoryId: housing });
    add({ date: '2024-03-01', note: 'Special Lunch' });
    add({ date: '2024-02-28', note: 'Special Lunch' });
    add({ type: 'income', categoryId: category('Salary'), date: '2024-02-29', note: 'Special Lunch' });
    const result = await list({ type: 'expense', categoryId: food, startDate: '2024-02-29', endDate: '2024-02-29', q: ' lunch ', pageSize: 1 });
    expect(result.data.map((row) => row.id)).toEqual([matched]);
    expect(result.meta).toEqual({ page: 1, pageSize: 1, total: 1, totalPages: 1 });
  });
  it('supports standalone type and category filters', async () => {
    const food = add(); const housing = add({ categoryId: category('Housing') });
    const income = add({ type: 'income', categoryId: category('Salary') });
    expect((await list({ type: 'income' })).data.map((row) => row.id)).toEqual([income]);
    expect((await list({ type: 'expense' })).data.map((row) => row.id)).toEqual([housing, food]);
    expect((await list({ categoryId: category('Housing') })).data.map((row) => row.id)).toEqual([housing]);
  });
  it('includes both date endpoints and supports one-sided and final-year boundaries', async () => {
    const before = add({ date: '2026-12-30' });
    const first = add({ date: '2026-12-31' }); const last = add({ date: '2027-01-01' });
    const after = add({ date: '2027-01-02' }); const final = add({ date: '9999-12-31' });
    expect((await list({ startDate: '2026-12-31', endDate: '2027-01-01' })).data.map((row) => row.id)).toEqual([last, first]);
    expect((await list({ endDate: '2026-12-31' })).data.map((row) => row.id)).toEqual([first, before]);
    expect((await list({ startDate: '2027-01-02' })).data.map((row) => row.id)).toEqual([final, after]);
    expect((await list({ startDate: '9999-12-31', endDate: '9999-12-31' })).data.map((row) => row.id)).toEqual([final]);
  });
  it('returns no matches for existing type-incompatible category filters', async () => {
    add(); add({ type: 'income', categoryId: category('Salary') });
    for (const [type, name] of [['income', 'Food'], ['expense', 'Salary']]) {
      const result = await list({ type: type!, categoryId: category(name!) });
      expect(result.data).toEqual([]); expect(result.meta.totalPages).toBe(0);
    }
  });
  it('returns zero matching metadata independently of the requested page', async () => {
    add();
    expect(await list({ q: 'absent', page: 20 })).toEqual({ data: [], meta: { page: 20, pageSize: 20, total: 0, totalPages: 0 } });
  });
});

describe('ASCII case-insensitive and literal Unicode note search', () => {
  it.each([
    ['LuNcH', 'lunch', true], ['Lunch', 'LUNCH', true],
    ['Café', 'CAFé', true], ['Café', 'CAFÉ', false], ['CAFÉ', 'café', false],
    ['東京 Lunch', '東京 lunch', true], ['Straße', 'STRASSE', false],
    ['İstanbul', 'istanbul', false], ['café', 'cafe\u0301', false],
    ['Lunch', '\0', false],
  ] as const)('matches note %j against %j only as scoped', async (note, q, matches) => {
    const id = add({ note });
    expect((await list({ q })).data.map((row) => row.id)).toEqual(matches ? [id] : []);
  });
  it.each(['%', '_', '\\', '\\%_', '50%_\\done', '[abc]'])(
    'treats SQL pattern characters %j literally', async (q) => {
      const id = add({ note: `prefix ${q} suffix` });
      add({ note: 'ordinary note 50percent-anything-done abc' });
      expect((await list({ q })).data.map((row) => row.id)).toEqual([id]);
    },
  );
  it('trims search text and treats blank search as absent', async () => {
    add({ note: 'Lunch' }); add({ note: 'Dinner' });
    expect((await list({ q: ' LUNCH ' })).meta.total).toBe(1);
    expect((await list({ q: ' \t\n ' })).meta.total).toBe(2);
  });
  it('accepts the 100-character search boundary', async () => {
    add({ note: 'x'.repeat(100) });
    expect((await list({ q: 'x'.repeat(100) })).meta.total).toBe(1);
  });
  it('uses literal parameter binding for SQL injection text', async () => {
    const q = "%' OR 1=1; DROP TABLE transactions; --";
    const id = add({ note: q }); add({ note: 'Other' });
    expect((await list({ q })).data.map((row) => row.id)).toEqual([id]);
    expect((db.prepare('SELECT count(*) AS n FROM transactions').get() as { n: number }).n).toBe(2);
  });
});

describe('invalid list queries', () => {
  it.each(['page', 'pageSize', 'categoryId'])('rejects malformed numeric %s values', async (key) => {
    for (const value of ['0','-1','+1','01','1.0','1.5','1e2',' 1','1 ','1\n','9007199254740992',"1' OR 1=1",'']) {
      expect((await request(server).get('/api/transactions').query({ [key]: value })).status).toBe(400);
    }
  });
  it.each(['?extra=1', '?pageSize=101', '?type=transfer', '?type=Expense', '?startDate=1900-02-29',
    '?endDate=10000-01-01', '?startDate=2026-02-01&endDate=2026-01-31', '?categoryId=999999',
    '?type=income&type=expense', '?page=1&page=2', '?q=one&q=two', '?categoryId[]=1', '?q[]=note'])(
    'returns safe validation errors for %s', async (query) => {
      const response = await request(server).get(`/api/transactions${query}`);
      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    },
  );
  it('rejects a search above 100 trimmed characters', async () => {
    expect((await request(server).get('/api/transactions').query({ q: 'x'.repeat(101) })).status).toBe(400);
  });
});

describe('read-only snapshot consistency', () => {
  it('does not mutate rows, schema metadata or total_changes, even with query_only enabled', async () => {
    add();
    const tables = ['categories','transactions','budgets','schema_migrations'];
    const before = tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const changes = db.prepare('SELECT total_changes() AS n').get();
    db.pragma('query_only = ON');
    try {
      await list(); await list({ q: 'lunch', categoryId: category('Food'), pageSize: 1 });
      expect(tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).toEqual(before);
      expect(db.prepare('SELECT total_changes() AS n').get()).toEqual(changes);
    } finally { db.pragma('query_only = OFF'); }
  });
  it('keeps COUNT and page in one snapshot while another connection commits a row', async () => {
    const file = createTestDatabaseFile();
    const reader = openDatabase({ mode: 'test', filename: file.filename });
    let writer: Database.Database | undefined; let listener: Server | undefined;
    try {
      reader.pragma('journal_mode = WAL'); initializeDatabase(reader);
      writer = openDatabase({ mode: 'test', filename: file.filename });
      const food = (reader.prepare("SELECT id FROM categories WHERE name='Food'").get() as { id: number }).id;
      const insert = writer.prepare("INSERT INTO transactions(type,amount_cents,category_id,transaction_date,note) VALUES ('expense',1,?,'2026-01-01','match')");
      insert.run(food);
      let committed = false;
      // Test-only hook causes a second connection to write during COUNT evaluation.
      reader.function('lower', (value: string) => {
        if (!committed) { committed = true; insert.run(food); }
        return value.toLowerCase();
      });
      listener = await listen(reader);
      const first = await request(listener).get('/api/transactions').query({ q: 'match' });
      expect(first.status).toBe(200); expect(committed).toBe(true);
      expect(first.body.meta.total).toBe(1); expect(first.body.data).toHaveLength(1);
      expect(writer.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({ n: 2 });
      const second = await request(listener).get('/api/transactions').query({ q: 'match' });
      expect(second.body.meta.total).toBe(2); expect(second.body.data).toHaveLength(2);
    } finally {
      if (listener) await close(listener);
      if (writer?.open) writer.close(); reader.close(); file.dispose();
    }
  });
  it('returns safe internal errors for an unavailable connection', async () => {
    db.close(); vi.spyOn(console,'error').mockImplementation(() => {});
    const response = await request(server).get('/api/transactions');
    expect(response.status).toBe(500); expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.text).not.toMatch(/sqlite|SELECT|stack|\.db/);
  });
});
