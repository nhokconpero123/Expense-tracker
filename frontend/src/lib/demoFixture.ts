// Generated from backend/src/db/seed.ts and backend/src/db/publicDemo.ts.
// Fixture version 1: financial values change only through an explicit migration.
export const DEMO_MONTH = '2026-11';
export const DEMO_CATEGORIES = [
  ['Salary', 'income'], ['Freelance', 'income'], ['Other Income', 'income'],
  ['Food', 'expense'], ['Housing', 'expense'], ['Transport', 'expense'],
  ['Utilities', 'expense'], ['Entertainment', 'expense'], ['Health', 'expense'],
  ['Shopping', 'expense'], ['Other Expense', 'expense'],
] as const;
export const DEMO_RECORDS = [
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
    ] as const;
export const DEMO_LIMITS = [['Housing', 120000], ['Food', 30000], ['Transport', 20000],
        ['Utilities', 15000], ['Entertainment', 10000], ['Shopping', 25000]] as const;
