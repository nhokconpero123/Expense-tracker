import { openDatabase } from './connection.js';
import { initializeDatabase } from './initialize.js';
import { createTransaction } from '../services/transactions.js';
import { saveBudget } from '../services/budgets.js';
import { validateTransactionRequest } from '../validation/transactions.js';
import { validateBudgetRequest } from '../validation/budgets.js';

/** New in-memory SQLite per startup: never reads DATABASE_PATH or any user file. */
export function createPublicDemoDatabase() {
  const db = openDatabase({ mode: 'test' });
  try {
    initializeDatabase(db);
    const categories = db.prepare('SELECT id, name, type FROM categories').all() as { id: number; name: string; type: string }[];
    const categoryId = (name: string, type: string) => {
      const category = categories.find(c => c.name === name && c.type === type);
      if (!category) throw new Error('Demo category is missing');
      return category.id;
    };
    const records: [string, string, number, string, string][] = [
      ['income', 'Salary', 350000, '01', 'Fictional monthly salary'],
      ['income', 'Freelance', 45000, '12', 'Fictional freelance project'],
      ['expense', 'Housing', 120000, '01', 'Fictional rent'],
      ['expense', 'Food', 9500, '03', 'Fictional groceries'],
      ['expense', 'Food', 8000, '10', 'Fictional groceries'],
      ['expense', 'Food', 7000, '18', 'Fictional groceries'],
      ['expense', 'Transport', 6000, '05', 'Fictional transit'],
      ['expense', 'Transport', 10000, '21', 'Fictional travel'],
      ['expense', 'Utilities', 13000, '08', 'Fictional utilities'],
      ['expense', 'Entertainment', 8500, '14', 'Fictional activities'],
      ['expense', 'Entertainment', 4500, '25', 'Fictional cinema'],
      ['expense', 'Food', 11000, '16', 'Fictional dining'],
      ['expense', 'Shopping', 18000, '22', 'Fictional shopping'],
    ];
    db.transaction(() => {
      for (const [type, name, amountCents, day, note] of records) {
        createTransaction(db, validateTransactionRequest({ type, categoryId: categoryId(name, type), amountCents, date: `2026-11-${day}`, note }));
      }
      const limits: [string, number][] = [['Housing', 120000], ['Food', 30000], ['Transport', 20000],
        ['Utilities', 15000], ['Entertainment', 10000], ['Shopping', 25000]];
      for (const [name, amountCents] of limits) saveBudget(db, validateBudgetRequest({ amountCents }, { categoryId: String(categoryId(name, 'expense')), month: '2026-11' }));
    }).immediate();
    // Defense in depth: even a future accidental write from a read handler fails.
    db.pragma('query_only = ON');
    return db;
  } catch (error) { db.close(); throw error; }
}
