import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { TransactionTable } from './TransactionTable';
import { TransactionFiltersBar } from './TransactionFiltersBar';
import { AddTransactionDialog } from './AddTransactionDialog';
import type { Category, Transaction } from '../lib/api';
import { INITIAL_FILTERS } from '../hooks/useTransactions';

const mockCategories: Category[] = [
  { id: 1, name: 'Salary', type: 'income' },
  { id: 2, name: 'Freelance', type: 'income' },
  { id: 4, name: 'Food', type: 'expense' },
  { id: 5, name: 'Housing', type: 'expense' },
];

const mockTransactions: Transaction[] = [
  {
    id: 1,
    type: 'income',
    amountCents: 200000,
    categoryId: 1,
    categoryName: 'Salary',
    date: '2026-11-01',
    note: 'Bi-weekly paycheck',
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  },
  {
    id: 2,
    type: 'expense',
    amountCents: 7550,
    categoryId: 4,
    categoryName: 'Food',
    date: '2026-11-02',
    note: 'Groceries',
    createdAt: '2026-11-02T15:00:00Z',
    updatedAt: '2026-11-02T15:00:00Z',
  },
];

describe('TransactionTable component', () => {
  it('renders transactions with dates, types, categories, amounts, and notes', () => {
    const html = renderToString(
      <TransactionTable
        transactions={mockTransactions}
        meta={{ page: 1, pageSize: 20, total: 2, totalPages: 1 }}
        isLoading={false}
        onPageChange={() => {}}
        isFiltered={false}
        onResetFilters={() => {}}
        onOpenAddModal={() => {}}
      />,
    );

    expect(html).toContain('Salary');
    expect(html).toContain('+$2,000.00');
    expect(html).toContain('Groceries');
    expect(html).toContain('-$75.50');
    expect(html).toContain('Nov 1, 2026');
    expect(html).toContain('Nov 2, 2026');
    expect(html).toContain('Showing');
    expect(html).toContain('Page');
    expect(html).toContain('transactions');
  });

  it('renders loading skeleton when isLoading is true', () => {
    const html = renderToString(
      <TransactionTable
        transactions={[]}
        meta={{ page: 1, pageSize: 20, total: 0, totalPages: 0 }}
        isLoading={true}
        onPageChange={() => {}}
        isFiltered={false}
        onResetFilters={() => {}}
        onOpenAddModal={() => {}}
      />,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('motion-safe:animate-pulse');
  });

  it('renders empty ledger state when no transactions exist and not filtered', () => {
    const html = renderToString(
      <TransactionTable
        transactions={[]}
        meta={{ page: 1, pageSize: 20, total: 0, totalPages: 0 }}
        isLoading={false}
        onPageChange={() => {}}
        isFiltered={false}
        onResetFilters={() => {}}
        onOpenAddModal={() => {}}
      />,
    );

    expect(html).toContain('No transactions recorded yet');
    expect(html).toContain('Add your first transaction');
  });

  it('renders filtered empty state when transactions list is empty due to active filters', () => {
    const html = renderToString(
      <TransactionTable
        transactions={[]}
        meta={{ page: 1, pageSize: 20, total: 0, totalPages: 0 }}
        isLoading={false}
        onPageChange={() => {}}
        isFiltered={true}
        onResetFilters={() => {}}
        onOpenAddModal={() => {}}
      />,
    );

    expect(html).toContain('No transactions match your filters');
    expect(html).toContain('Clear filters');
  });

  it('renders disabled pagination buttons at boundaries', () => {
    const html = renderToString(
      <TransactionTable
        transactions={mockTransactions}
        meta={{ page: 1, pageSize: 20, total: 2, totalPages: 1 }}
        isLoading={false}
        onPageChange={() => {}}
        isFiltered={false}
        onResetFilters={() => {}}
        onOpenAddModal={() => {}}
      />,
    );

    // Page 1 of 1: both Previous and Next should be disabled
    expect(html).toContain('aria-label="Previous page"');
    expect(html).toContain('aria-label="Next page"');
    expect(html).toContain('disabled=""');
  });
});

describe('TransactionFiltersBar component', () => {
  it('renders all filter controls and ASCII search notice', () => {
    const html = renderToString(
      <TransactionFiltersBar
        filters={INITIAL_FILTERS}
        categories={mockCategories}
        onFilterChange={() => {}}
        onReset={() => {}}
        isFiltered={false}
      />,
    );

    expect(html).toContain('All Types');
    expect(html).toContain('All Categories');
    expect(html).toContain('Start Date');
    expect(html).toContain('End Date');
    expect(html).toContain('Search Notes');
    expect(html).toContain('ASCII case-insensitive matching');
  });

  it('renders Reset filters button when isFiltered is true', () => {
    const html = renderToString(
      <TransactionFiltersBar
        filters={{ ...INITIAL_FILTERS, type: 'expense' }}
        categories={mockCategories}
        onFilterChange={() => {}}
        onReset={() => {}}
        isFiltered={true}
      />,
    );

    expect(html).toContain('Reset filters');
  });
});

describe('AddTransactionDialog component', () => {
  it('renders accessible dialog with type, amount, category, date, and note controls', () => {
    const html = renderToString(
      <AddTransactionDialog
        isOpen={true}
        onClose={() => {}}
        categories={mockCategories}
        onSubmit={async () => ({ success: true })}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('Record Transaction');
    expect(html).toContain('Expense');
    expect(html).toContain('Income');
    expect(html).toContain('Amount (USD)');
    expect(html).toContain('Category');
    expect(html).toContain('Transaction Date');
    expect(html).toContain('Note (Optional)');
    expect(html).toContain('Save Transaction');
  });

  it('does not render when isOpen is false', () => {
    const html = renderToString(
      <AddTransactionDialog
        isOpen={false}
        onClose={() => {}}
        categories={mockCategories}
        onSubmit={async () => ({ success: true })}
      />,
    );

    expect(html).toBe('');
  });
});
