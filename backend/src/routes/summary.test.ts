import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { createTestDatabaseFile, openDatabase } from '../db/connection.js';
import { initializeDatabase } from '../db/initialize.js';
import type { MonthlySummary } from '../services/summary.js';

let db: Database.Database; let server: Server;
async function listen(database: Database.Database): Promise<Server> {
  const listener = createServer(createApp(database));
  await new Promise<void>((resolve,reject) => { listener.once('error',reject); listener.listen(0,'127.0.0.1',resolve); });
  return listener;
}
async function close(listener: Server) {
  await new Promise<void>((resolve,reject) => listener.close((error) => error ? reject(error) : resolve()));
}
beforeEach(async () => { db=openDatabase({mode:'test'}); initializeDatabase(db); server=await listen(db); });
afterEach(async () => { await close(server); if(db.open) db.close(); vi.restoreAllMocks(); });
function category(name: string): number {
  return (db.prepare('SELECT id FROM categories WHERE name=?').get(name) as {id:number}).id;
}
function add(type: 'income'|'expense', amount: number, date: string, name = type === 'income' ? 'Salary' : 'Food') {
  return db.prepare('INSERT INTO transactions(type,amount_cents,category_id,transaction_date) VALUES (?,?,?,?)')
    .run(type,amount,category(name),date);
}
function assertSums(result: MonthlySummary) {
  expect(result.expensesByCategory.reduce((sum,row)=>sum+BigInt(row.amountCents),0n)).toBe(BigInt(result.expenseCents));
  expect(result.dailyExpenses.reduce((sum,row)=>sum+BigInt(row.amountCents),0n)).toBe(BigInt(result.expenseCents));
  for(const value of [result.incomeCents,result.expenseCents,result.balanceCents,
    ...result.expensesByCategory.map(row=>row.amountCents),...result.dailyExpenses.map(row=>row.amountCents)]) {
    expect(Number.isSafeInteger(value)).toBe(true);
  }
}
async function summary(month: string): Promise<MonthlySummary> {
  const response=await request(server).get('/api/summary').query({month});
  expect(response.status).toBe(200); expect(response.headers['content-type']).toMatch(/application\/json/);
  expect(Object.keys(response.body)).toEqual(['data']);
  expect(Object.keys(response.body.data).sort()).toEqual(['month','incomeCents','expenseCents','balanceCents','expensesByCategory','dailyExpenses'].sort());
  assertSums(response.body.data); return response.body.data as MonthlySummary;
}

describe('monthly summary HTTP calculations', () => {
  it.each([['1900-02',28],['2000-02',29],['2024-02',29],['2100-02',28],['2400-02',29],
    ['2026-04',30],['2026-12',31],['1900-01',31],['9999-12',31]] as const)(
    'returns full zero-filled data for empty month %s', async(month,days)=>{
      const result=await summary(month);
      expect(result).toMatchObject({month,incomeCents:0,expenseCents:0,balanceCents:0,expensesByCategory:[]});
      expect(result.dailyExpenses).toEqual(Array.from({length:days},(_,i)=>({date:`${month}-${String(i+1).padStart(2,'0')}`,amountCents:0})));
    },
  );
  it('calculates mixed cash flow and category ranking with deterministic ID ties', async()=>{
    add('income',1000,'2024-02-01'); add('expense',25,'2024-02-01'); add('expense',25,'2024-02-29');
    add('expense',50,'2024-02-02','Housing'); add('expense',100,'2024-02-02','Transport');
    const result=await summary('2024-02');
    expect(result).toMatchObject({incomeCents:1000,expenseCents:200,balanceCents:800});
    expect(result.expensesByCategory).toEqual([
      {categoryId:category('Transport'),categoryName:'Transport',amountCents:100},
      {categoryId:category('Food'),categoryName:'Food',amountCents:50},
      {categoryId:category('Housing'),categoryName:'Housing',amountCents:50},
    ]);
    expect(result.dailyExpenses[0]).toEqual({date:'2024-02-01',amountCents:25});
    expect(result.dailyExpenses[1]).toEqual({date:'2024-02-02',amountCents:150});
    expect(result.dailyExpenses[2]).toEqual({date:'2024-02-03',amountCents:0});
    expect(result.dailyExpenses.at(-1)).toEqual({date:'2024-02-29',amountCents:25});
  });
  it('supports negative balances and exact cents', async()=>{
    add('income',1,'2026-01-01'); add('expense',29,'2026-01-02');
    expect(await summary('2026-01')).toMatchObject({incomeCents:1,expenseCents:29,balanceCents:-28});
  });
  it('excludes income and unspent categories from expense distribution', async()=>{
    add('income',100,'2026-01-01');
    expect((await summary('2026-01')).expensesByCategory).toEqual([]);
    add('expense',1,'2026-01-02','Housing');
    expect((await summary('2026-01')).expensesByCategory).toEqual([{categoryId:category('Housing'),categoryName:'Housing',amountCents:1}]);
  });
  it('uses inclusive date boundaries independently of metadata timestamps and adjacent months', async()=>{
    add('expense',99,'2023-12-31'); add('expense',1,'2024-01-01'); add('expense',2,'2024-01-31'); add('expense',88,'2024-02-01');
    db.exec("UPDATE transactions SET created_at='2099-12-31T23:59:59.999Z', updated_at='1900-01-01T00:00:00.000Z'");
    expect(await summary('2024-01')).toMatchObject({expenseCents:3,balanceCents:-3});
    expect((await summary('2023-12')).expenseCents).toBe(99); expect((await summary('2024-02')).expenseCents).toBe(88);
  });
  it('includes the final date of December 9999 without a year-10000 boundary', async()=>{
    add('expense',3,'9999-11-30'); add('income',29,'9999-12-01'); add('expense',7,'9999-12-31');
    const result=await summary('9999-12'); expect(result).toMatchObject({incomeCents:29,expenseCents:7,balanceCents:22});
    expect(result.dailyExpenses.at(-1)).toEqual({date:'9999-12-31',amountCents:7});
  });
  it('is independent of prior transaction list filters and pagination', async()=>{
    add('income',100,'2026-01-01'); add('expense',20,'2026-01-02'); add('expense',30,'2026-01-03');
    const before=await summary('2026-01');
    expect((await request(server).get('/api/transactions').query({type:'income',q:'absent',page:999,pageSize:1})).body.data).toEqual([]);
    expect(await summary('2026-01')).toEqual(before);
  });
  it('reflects creation, category/amount changes, type/month moves and deletion', async()=>{
    const expense={type:'expense',amountCents:75,categoryId:category('Food'),date:'2026-01-01'};
    const income={type:'income',amountCents:200,categoryId:category('Salary'),date:'2026-01-02'};
    const first=await request(server).post('/api/transactions').send(expense);
    const second=await request(server).post('/api/transactions').send(income);
    expect(first.status).toBe(201); expect(second.status).toBe(201);
    expect(await summary('2026-01')).toMatchObject({incomeCents:200,expenseCents:75,balanceCents:125});
    expect((await request(server).put(first.headers['location'] as string).send({...expense,categoryId:category('Housing'),amountCents:100})).status).toBe(200);
    expect((await summary('2026-01')).expensesByCategory).toEqual([{categoryId:category('Housing'),categoryName:'Housing',amountCents:100}]);
    expect((await request(server).put(first.headers['location'] as string).send({...income,amountCents:50,date:'2026-02-01'})).status).toBe(200);
    expect(await summary('2026-01')).toMatchObject({incomeCents:200,expenseCents:0,balanceCents:200});
    expect(await summary('2026-02')).toMatchObject({incomeCents:50,expenseCents:0,balanceCents:50});
    expect((await request(server).put(second.headers['location'] as string).send({...expense,amountCents:29,date:'2026-02-28'})).status).toBe(200);
    expect(await summary('2026-01')).toMatchObject({incomeCents:0,expenseCents:0,balanceCents:0});
    expect(await summary('2026-02')).toMatchObject({incomeCents:50,expenseCents:29,balanceCents:21});
    expect((await request(server).delete(first.headers['location'] as string)).status).toBe(204);
    expect(await summary('2026-02')).toMatchObject({incomeCents:0,expenseCents:29,balanceCents:-29});
    expect((await request(server).delete(second.headers['location'] as string)).status).toBe(204);
    expect(await summary('2026-02')).toMatchObject({incomeCents:0,expenseCents:0,balanceCents:0,expensesByCategory:[]});
  });
});

describe('summary validation and safe failures',()=>{
  it.each(['','?month=','?month=1899-12','?month=10000-01','?month=2026-00','?month=2026-13','?month=2026-1',
    '?month=2026-01-01','?month=%202026-01','?month=2026-01%0A','?month=2026-01&month=2026-02',
    '?month[]=2026-01','?month=2026-01&q=note','?month=2026-01&page=1','?month=2026-01&type=income',
    '?month=2026-01%27%20OR%201=1--'])(
    'rejects invalid month/query %s',async(query)=>{
      const response=await request(server).get(`/api/summary${query}`);
      expect(response.status).toBe(400); expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.text).not.toMatch(/SELECT|stack|sqlite|OR 1/);
    },
  );
  it.each(['income','expense'] as const)('safely handles the maximum safe %s total and rejects overflow',async(type)=>{
    db.pragma('ignore_check_constraints = ON');
    try { db.prepare('INSERT INTO transactions(type,amount_cents,category_id,transaction_date) VALUES (?,?,?,?)')
      .run(type,BigInt(Number.MAX_SAFE_INTEGER),category(type==='income'?'Salary':'Food'),'2026-01-01'); }
    finally { db.pragma('ignore_check_constraints = OFF'); }
    const valid=await summary('2026-01'); expect(type==='income'?valid.incomeCents:valid.expenseCents).toBe(Number.MAX_SAFE_INTEGER);
    add(type,1,'2026-01-02');
    const before=db.prepare('SELECT * FROM transactions').all(); vi.spyOn(console,'error').mockImplementation(()=>{});
    const response=await request(server).get('/api/summary?month=2026-01');
    expect(response.status).toBe(500); expect(response.body).toEqual({error:{code:'INTERNAL_ERROR',message:'An unexpected error occurred.'}});
    expect(db.prepare('SELECT * FROM transactions').all()).toEqual(before);
    expect((await summary('2026-02')).incomeCents).toBe(0);
  });
  it('rejects SQLite integer SUM overflow with the safe error envelope',async()=>{
    db.pragma('ignore_check_constraints = ON');
    try { db.prepare("INSERT INTO transactions(type,amount_cents,category_id,transaction_date) VALUES ('expense',?,?,'2026-01-01')")
      .run(9223372036854775807n,category('Food')); }
    finally { db.pragma('ignore_check_constraints = OFF'); }
    add('expense',1,'2026-01-02'); vi.spyOn(console,'error').mockImplementation(()=>{});
    const response=await request(server).get('/api/summary?month=2026-01');
    expect(response.status).toBe(500); expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.text).not.toMatch(/overflow|sqlite|SELECT|stack/);
  });
  it('returns safe internal errors for unavailable database connections',async()=>{
    db.close(); vi.spyOn(console,'error').mockImplementation(()=>{});
    const response=await request(server).get('/api/summary?month=2026-01');
    expect(response.status).toBe(500); expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.text).not.toMatch(/sqlite|SELECT|stack|\.db/);
  });
  it('does not store derived totals or mutate data during summary reads',async()=>{
    add('expense',29,'2026-01-01');
    const tables=['categories','transactions','budgets','schema_migrations'];
    const before=tables.map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const schema=db.prepare('SELECT * FROM sqlite_master ORDER BY name').all();
    const changes=db.prepare('SELECT total_changes() AS n').get(); db.pragma('query_only=ON');
    try {
      await summary('2026-01');
      expect(tables.map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).toEqual(before);
      expect(db.prepare('SELECT * FROM sqlite_master ORDER BY name').all()).toEqual(schema);
      expect(db.prepare('SELECT total_changes() AS n').get()).toEqual(changes);
    } finally { db.pragma('query_only=OFF'); }
  });
});

describe('consistent summary snapshot',()=>{
  it('keeps totals, categories and daily series consistent while another connection commits',async()=>{
    const file=createTestDatabaseFile(); const reader=openDatabase({mode:'test',filename:file.filename});
    let writer: Database.Database|undefined; let listener: Server|undefined;
    try {
      reader.pragma('journal_mode=WAL'); initializeDatabase(reader);
      writer=openDatabase({mode:'test',filename:file.filename});
      const food=(reader.prepare("SELECT id FROM categories WHERE name='Food'").get() as {id:number}).id;
      const housing=(reader.prepare("SELECT id FROM categories WHERE name='Housing'").get() as {id:number}).id;
      const insert=writer.prepare("INSERT INTO transactions(type,amount_cents,category_id,transaction_date) VALUES ('expense',?,?,?)");
      insert.run(100,food,'2024-02-01');
      let committed=false; const prepare=reader.prepare.bind(reader);
      vi.spyOn(reader,'prepare').mockImplementation(((sql: string)=>{
        const statement=prepare(sql);
        if(sql.startsWith('SELECT type, SUM(amount_cents) AS total')) {
          const all=statement.all.bind(statement);
          vi.spyOn(statement,'all').mockImplementation((...args)=>{
            const result=all(...args);
            if(!committed) { committed=true; insert.run(50,housing,'2024-02-02'); }
            return result;
          });
        }
        return statement;
      }) as typeof reader.prepare);
      listener=await listen(reader);
      const first=await request(listener).get('/api/summary?month=2024-02');
      expect(first.status).toBe(200); expect(committed).toBe(true);
      expect(first.body.data.expenseCents).toBe(100); expect(first.body.data.expensesByCategory).toHaveLength(1);
      expect(first.body.data.dailyExpenses[1].amountCents).toBe(0); assertSums(first.body.data);
      expect(writer.prepare('SELECT sum(amount_cents) AS n FROM transactions').get()).toEqual({n:150});
      const second=await request(listener).get('/api/summary?month=2024-02');
      expect(second.status).toBe(200); expect(second.body.data.expenseCents).toBe(150);
      expect(second.body.data.expensesByCategory).toHaveLength(2); expect(second.body.data.dailyExpenses[1].amountCents).toBe(50);
      assertSums(second.body.data);
    } finally {
      if(listener) await close(listener); if(writer?.open) writer.close(); reader.close(); file.dispose();
    }
  });
});
