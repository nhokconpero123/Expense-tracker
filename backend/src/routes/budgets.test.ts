import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { createTestDatabaseFile, openDatabase } from '../db/connection.js';
import { initializeDatabase } from '../db/initialize.js';
import type { BudgetItem } from '../services/budgets.js';

let db: Database.Database;
let server: Server;
async function listen(database: Database.Database): Promise<Server> {
  const listener=createServer(createApp(database));
  await new Promise<void>((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
  return listener;
}
async function close(listener: Server) {
  await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
}
beforeEach(async()=>{db=openDatabase({mode:'test'});initializeDatabase(db);server=await listen(db);});
afterEach(async()=>{await close(server);if(db.open)db.close();vi.restoreAllMocks();});
function category(name='Food'): number {
  return (db.prepare('SELECT id FROM categories WHERE name=?').get(name) as {id:number}).id;
}
function path(name='Food',month='2026-01') {return `/api/budgets/${category(name)}/${month}`;}
function spend(amount=29,date='2026-01-01',name='Food') {
  return db.prepare("INSERT INTO transactions(type,amount_cents,category_id,transaction_date) VALUES ('expense',?,?,?)")
    .run(amount,category(name),date);
}
async function items(month='2026-01'): Promise<BudgetItem[]> {
  const response=await request(server).get('/api/budgets').query({month});
  expect(response.status).toBe(200);expect(response.headers['content-type']).toMatch(/application\/json/);
  expect(Object.keys(response.body)).toEqual(['data']);expect(response.body.data.month).toBe(month);
  return response.body.data.items as BudgetItem[];
}
async function food(month='2026-01') {return (await items(month)).find(row=>row.categoryId===category())!;}
function state() {return {budgets:db.prepare('SELECT * FROM budgets ORDER BY id').all(),
  transactions:db.prepare('SELECT * FROM transactions ORDER BY id').all()};}

describe('monthly budget HTTP contract',()=>{
  it('lists all eight seeded expense categories with null absent limits and zero spending',async()=>{
    const rows=await items();
    expect(rows.map(row=>row.categoryName)).toEqual(['Entertainment','Food','Health','Housing','Other Expense','Shopping','Transport','Utilities']);
    for(const row of rows) expect(row).toEqual({categoryId:category(row.categoryName),categoryName:row.categoryName,
      month:'2026-01',amountCents:null,spentCents:0,remainingCents:null,utilizationPercent:null,status:'no_budget'});
  });
  it('returns 200 for initial and repeated upserts and preserves uniqueness and identity',async()=>{
    for(const amountCents of [1,29,100000000,29]) {
      const response=await request(server).put(path()).send({amountCents});
      expect(response.status).toBe(200);expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toEqual({data:{categoryId:category(),categoryName:'Food',month:'2026-01',amountCents,
        spentCents:0,remainingCents:amountCents,utilizationPercent:0,status:'under'}});
      expect(db.prepare('SELECT count(*) AS n FROM budgets').get()).toEqual({n:1});
    }
    const before=db.prepare('SELECT id,created_at FROM budgets').get();
    await request(server).put(path()).send({amountCents:50});
    expect(db.prepare('SELECT id,created_at FROM budgets').get()).toEqual(before);
  });
  it.each([[0,0,10000,'under'],[7500,75,2500,'under'],[10000,100,0,'at_limit'],[12500,125,-2500,'over']] as const)(
    'reports spending %i with exact status and uncapped utilization',async(amount,percent,remaining,status)=>{
      if(amount)spend(amount);
      const response=await request(server).put(path()).send({amountCents:10000});
      expect(response.status).toBe(200);expect(response.body.data).toMatchObject({spentCents:amount,
        utilizationPercent:percent,remainingCents:remaining,status});
      expect(await food()).toEqual(response.body.data);
    });
  it('reports spending without a budget and isolates category, type and month',async()=>{
    spend(29);spend(50,'2026-01-31');spend(100,'2025-12-31');spend(200,'2026-02-01');spend(3,'2026-01-02','Housing');
    db.prepare("INSERT INTO transactions(type,amount_cents,category_id,transaction_date) VALUES ('income',999,?,'2026-01-01')").run(category('Salary'));
    await request(server).put(path('Food','2026-02')).send({amountCents:10});
    expect(await food()).toMatchObject({amountCents:null,spentCents:79,remainingCents:null,status:'no_budget'});
    expect(await food('2026-02')).toMatchObject({amountCents:10,spentCents:200,remainingCents:-190,status:'over'});
    expect((await items()).find(row=>row.categoryName==='Housing')?.spentCents).toBe(3);
  });
  it.each(['1900-01','2000-02','2024-02','2100-02','9999-12'])(
    'supports calendar boundary month %s',async(month)=>{
      const day=month==='9999-12'?'31':month==='2000-02'||month==='2024-02'?'29':month==='2100-02'?'28':'01';
      spend(1,`${month}-${day}`);
      expect((await request(server).put(path('Food',month)).send({amountCents:3})).body.data.utilizationPercent).toBe(33.3);
      expect(await food(month)).toMatchObject({spentCents:1,amountCents:3,remainingCents:2});
    });
  it('allows transaction spending above the budget and refreshes after mutations',async()=>{
    await request(server).put(path()).send({amountCents:1});
    const input={type:'expense',categoryId:category(),date:'2026-01-01',amountCents:29};
    const created=await request(server).post('/api/transactions').send(input);expect(created.status).toBe(201);
    const location=created.headers['location'] as string;
    expect(await food()).toMatchObject({spentCents:29,remainingCents:-28,status:'over'});
    expect((await request(server).put(location).send({...input,amountCents:50,categoryId:category('Housing')})).status).toBe(200);
    expect((await items()).find(row=>row.categoryName==='Housing')?.spentCents).toBe(50);
    expect((await food()).spentCents).toBe(0);
    expect((await request(server).put(location).send({...input,date:'2026-02-01'})).status).toBe(200);
    expect((await food('2026-02')).spentCents).toBe(29);
    expect((await request(server).put(location).send({...input,type:'income',categoryId:category('Salary')})).status).toBe(200);
    expect((await food('2026-02')).spentCents).toBe(0);
    expect((await request(server).put(location).send(input)).status).toBe(200);
    expect((await food()).spentCents).toBe(29);
    expect((await request(server).delete(location)).status).toBe(204);
    expect((await food()).spentCents).toBe(0);
  });
  it('deletes only the selected budget, returns empty 204, then 404',async()=>{
    spend();await request(server).put(path()).send({amountCents:10});
    await request(server).put(path('Food','2026-02')).send({amountCents:20});
    const before=state().transactions;
    const response=await request(server).delete(path());expect(response.status).toBe(204);expect(response.text).toBe('');
    expect((await request(server).delete(path())).status).toBe(404);
    expect(state().transactions).toEqual(before);expect(state().budgets).toHaveLength(1);
    expect(await food()).toMatchObject({amountCents:null,spentCents:29,status:'no_budget'});
  });
  it('ignores list filters and pagination and performs no writes on GET',async()=>{
    spend();await request(server).put(path()).send({amountCents:100});
    const before=state();const changes=db.prepare('SELECT total_changes() AS n').get();
    db.pragma('query_only=ON');
    try {
      await request(server).get('/api/transactions?type=income&q=absent&page=999&pageSize=1');
      expect(await food()).toMatchObject({spentCents:29});
      expect(state()).toEqual(before);expect(db.prepare('SELECT total_changes() AS n').get()).toEqual(changes);
    }finally{db.pragma('query_only=OFF');}
  });
});

describe('budget validation and atomic failures',()=>{
  it.each(['','?month=','?month=1899-12','?month=10000-01','?month=2026-13','?month=2026-1',
    '?month=%202026-01','?month=2026-01%0A','?month=2026-01&month=2026-02','?month[]=2026-01',
    '?month=2026-01&page=1','?month=2026-01&q=x'])(
    'rejects invalid GET query %s',async(query)=>{
      const response=await request(server).get(`/api/budgets${query}`);
      expect(response.status).toBe(400);expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  it.each([{},null,[],{amountCents:0},{amountCents:-1},{amountCents:1.5},{amountCents:'1'},
    {amountCents:100000001},{amountCents:9007199254740992},{amountCents:null},{amountCents:1,extra:1}])(
    'rejects invalid PUT body %j without changing a budget',async(body)=>{
      await request(server).put(path()).send({amountCents:29});const before=state();
      const response=await request(server).put(path()).set('Content-Type','application/json').send(JSON.stringify(body));
      expect(response.status).toBe(400);expect(state()).toEqual(before);
    });
  it.each(['0','01','-1','+1','1.5','1e2','9007199254740992','1%20','1%27OR%201=1'])(
    'strictly rejects category path %s on both writes',async(id)=>{
      for(const method of ['put','delete'] as const) {
        const response=await request(server)[method](`/api/budgets/${id}/2026-01`).send({amountCents:1});
        expect(response.status).toBe(400);
      }
      expect(state().budgets).toEqual([]);
    });
  it.each(['1899-12','10000-01','2026-00','2026-1','2026-01-01','%202026-01','2026-01%0A'])(
    'rejects invalid route month %s on both writes',async(month)=>{
      for(const method of ['put','delete'] as const) expect((await request(server)[method](path('Food',month)).send({amountCents:1})).status).toBe(400);
    });
  it.each(['Salary','missing'])('rejects %s category for both writes',async(name)=>{
    const url=name==='missing'?'/api/budgets/999999/2026-01':path(name);
    for(const method of ['put','delete'] as const) {
      const response=await request(server)[method](url).send({amountCents:1});
      expect(response.status).toBe(400);expect(response.body.error.fields).toHaveProperty('categoryId');
    }
  });
  it('rejects unknown mutation queries and malformed JSON',async()=>{
    expect((await request(server).put(`${path()}?extra=1`).send({amountCents:1})).status).toBe(400);
    expect((await request(server).delete(`${path()}?extra=1`)).status).toBe(400);
    const response=await request(server).put(path()).set('Content-Type','application/json').send('{');
    expect(response.status).toBe(400);expect(response.body.error.code).toBe('INVALID_JSON');
  });
  it.each(['INSERT','UPDATE','DELETE'] as const)('rolls back failed %s including trigger side effects',async(operation)=>{
    if(operation!=='INSERT')await request(server).put(path()).send({amountCents:10});
    const before=state();db.exec(`CREATE TABLE audit(value INTEGER); CREATE TRIGGER fail_budget BEFORE ${operation} ON budgets
      BEGIN INSERT INTO audit VALUES (1); SELECT RAISE(FAIL,'PRIVATE_SQL_NOTE'); END;`);
    vi.spyOn(console,'error').mockImplementation(()=>{});
    const response=operation==='DELETE'?await request(server).delete(path()):await request(server).put(path()).send({amountCents:20});
    expect(response.status).toBe(500);expect(response.body).toEqual({error:{code:'INTERNAL_ERROR',message:'An unexpected error occurred.'}});
    expect(response.text).not.toMatch(/SQL|NOTE|sqlite|stack/);expect(state()).toEqual(before);
    expect(db.prepare('SELECT * FROM audit').all()).toEqual([]);
  });
  it('rolls back upsert if readback is removed by a trigger',async()=>{
    db.exec('CREATE TRIGGER lose_budget AFTER INSERT ON budgets BEGIN DELETE FROM budgets WHERE id=NEW.id; END;');
    vi.spyOn(console,'error').mockImplementation(()=>{});
    expect((await request(server).put(path()).send({amountCents:1})).status).toBe(500);
    expect(state().budgets).toEqual([]);
  });
  it('rolls back ignored deletion including side effects',async()=>{
    await request(server).put(path()).send({amountCents:10});const before=state();
    db.exec('CREATE TABLE audit(value INTEGER); CREATE TRIGGER ignore_budget BEFORE DELETE ON budgets BEGIN INSERT INTO audit VALUES (1); SELECT RAISE(IGNORE); END;');
    vi.spyOn(console,'error').mockImplementation(()=>{});
    expect((await request(server).delete(path())).status).toBe(500);expect(state()).toEqual(before);
    expect(db.prepare('SELECT * FROM audit').all()).toEqual([]);
  });
  it('keeps composite foreign keys enabled and rejects income or nonexistent direct budget references',()=>{
    expect(db.pragma('foreign_keys',{simple:true})).toBe(1);
    const insert=db.prepare("INSERT INTO budgets(category_id,month,amount_cents) VALUES (?,'2026-01',1)");
    expect(()=>insert.run(category('Salary'))).toThrow();expect(()=>insert.run(999999)).toThrow();
  });
  it('checks safe aggregate boundaries and rolls back a write when spending is unsafe',async()=>{
    db.pragma('ignore_check_constraints=ON');
    try {db.prepare("INSERT INTO transactions(type,amount_cents,category_id,transaction_date) VALUES ('expense',?,?,'2026-01-01')")
      .run(BigInt(Number.MAX_SAFE_INTEGER),category());}finally{db.pragma('ignore_check_constraints=OFF');}
    expect((await request(server).put(path()).send({amountCents:100000000})).status).toBe(200);
    expect((await food()).spentCents).toBe(Number.MAX_SAFE_INTEGER);
    spend(1);const before=state();vi.spyOn(console,'error').mockImplementation(()=>{});
    expect((await request(server).get('/api/budgets?month=2026-01')).status).toBe(500);
    expect((await request(server).put(path()).send({amountCents:1})).status).toBe(500);
    expect(state()).toEqual(before);
  });
  it('returns safe errors for unavailable storage on every endpoint',async()=>{
    const url=path();db.close();vi.spyOn(console,'error').mockImplementation(()=>{});
    const responses=[await request(server).get('/api/budgets?month=2026-01'),
      await request(server).put(url).send({amountCents:1}),await request(server).delete(url)];
    for(const response of responses){expect(response.status).toBe(500);expect(response.text).not.toMatch(/sqlite|stack|\.db|SELECT/);}
  });
  it('safely rejects SQLite SUM overflow without changing budgets',async()=>{
    db.pragma('ignore_check_constraints=ON');
    try {db.prepare("INSERT INTO transactions(type,amount_cents,category_id,transaction_date) VALUES ('expense',?,?,'2026-01-01')")
      .run(9223372036854775807n,category());}finally{db.pragma('ignore_check_constraints=OFF');}
    spend(1);vi.spyOn(console,'error').mockImplementation(()=>{});
    const response=await request(server).get('/api/budgets?month=2026-01');
    expect(response.status).toBe(500);expect(response.text).not.toMatch(/overflow|sqlite|SELECT|stack/);
    expect((await request(server).put(path()).send({amountCents:1})).status).toBe(500);
    expect(state().budgets).toEqual([]);
  });
});

describe('persistent and snapshot budget reads',()=>{
  it('persists replacement and deletion after reopening a private test database',async()=>{
    const file=createTestDatabaseFile();let connection=openDatabase({mode:'test',filename:file.filename});
    let listener: Server|undefined;
    try {
      initializeDatabase(connection);listener=await listen(connection);
      const id=(connection.prepare("SELECT id FROM categories WHERE name='Food'").get() as {id:number}).id;
      const url=`/api/budgets/${id}/2026-01`;
      connection.prepare("INSERT INTO transactions(type,amount_cents,category_id,transaction_date) VALUES ('expense',29,?,'2026-01-01')").run(id);
      expect((await request(listener).put(url).send({amountCents:50})).status).toBe(200);
      expect((await request(listener).put(url).send({amountCents:100})).status).toBe(200);
      await close(listener);listener=undefined;connection.close();connection=openDatabase({mode:'test',filename:file.filename});listener=await listen(connection);
      let response=await request(listener).get('/api/budgets?month=2026-01');
      expect(response.body.data.items.find((row: BudgetItem)=>row.categoryId===id)).toMatchObject({amountCents:100,spentCents:29,remainingCents:71});
      expect((await request(listener).delete(url)).status).toBe(204);
      await close(listener);listener=undefined;connection.close();connection=openDatabase({mode:'test',filename:file.filename});listener=await listen(connection);
      response=await request(listener).get('/api/budgets?month=2026-01');
      expect(response.body.data.items.find((row: BudgetItem)=>row.categoryId===id)).toMatchObject({amountCents:null,spentCents:29});
    }finally{if(listener)await close(listener);if(connection.open)connection.close();file.dispose();}
  });
  it('keeps limits and spending in one snapshot while a second connection commits',async()=>{
    const file=createTestDatabaseFile();const reader=openDatabase({mode:'test',filename:file.filename});
    let writer: Database.Database|undefined;let listener: Server|undefined;
    try {
      reader.pragma('journal_mode=WAL');initializeDatabase(reader);writer=openDatabase({mode:'test',filename:file.filename});
      const id=(reader.prepare("SELECT id FROM categories WHERE name='Food'").get() as {id:number}).id;
      writer.prepare("INSERT INTO budgets(category_id,month,amount_cents) VALUES (?,'2026-01',100)").run(id);
      writer.prepare("INSERT INTO transactions(type,amount_cents,category_id,transaction_date) VALUES ('expense',29,?,'2026-01-01')").run(id);
      let committed=false;const prepare=reader.prepare.bind(reader);
      vi.spyOn(reader,'prepare').mockImplementation(((sql: string)=>{
        const statement=prepare(sql);
        if(sql.startsWith('SELECT c.id AS categoryId')) {
          // Iterator holds the SELECT snapshot open while another real connection commits.
          vi.spyOn(statement,'all').mockImplementation((...args)=>{
            const iterator=statement.iterate(...args);const first=iterator.next();
            if(!committed){committed=true;writer!.transaction(()=>{
              writer!.prepare('UPDATE budgets SET amount_cents=200 WHERE category_id=?').run(id);
              writer!.prepare("INSERT INTO transactions(type,amount_cents,category_id,transaction_date) VALUES ('expense',50,?,'2026-01-02')").run(id);
            }).immediate();}
            return first.done?[]:[first.value,...iterator];
          });
        }
        return statement;
      }) as typeof reader.prepare);
      listener=await listen(reader);
      const first=await request(listener).get('/api/budgets?month=2026-01');expect(first.status).toBe(200);expect(committed).toBe(true);
      expect(first.body.data.items.find((row: BudgetItem)=>row.categoryId===id)).toMatchObject({amountCents:100,spentCents:29,remainingCents:71});
      const second=await request(listener).get('/api/budgets?month=2026-01');expect(second.status).toBe(200);
      expect(second.body.data.items.find((row: BudgetItem)=>row.categoryId===id)).toMatchObject({amountCents:200,spentCents:79,remainingCents:121});
    }finally{if(listener)await close(listener);if(writer?.open)writer.close();reader.close();file.dispose();}
  });
});
