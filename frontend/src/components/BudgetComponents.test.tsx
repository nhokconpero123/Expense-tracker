import { createRef } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BudgetCard } from './BudgetCard';
import { BudgetDialog } from './BudgetDialog';
import { Navbar } from './Navbar';
import { MonthProvider } from '../context/MonthContext';
import { Budgets } from '../pages/Budgets';
import { BudgetStore } from '../lib/budgetStore';
import type { BudgetItem } from '../lib/budgetApi';

const base: BudgetItem = { categoryId: 4, categoryName: 'Food', month: '2026-11', amountCents: 10000,
  spentCents: 7500, remainingCents: 2500, utilizationPercent: 75, status: 'under' };
describe('budget presentation', () => {
  it.each([
    [{ ...base, amountCents: null, remainingCents: null, utilizationPercent: null, status: 'no_budget' }, 'No budget', 'Set budget'],
    [base, 'Under budget', '75% used'],
    [{ ...base, spentCents: 10000, remainingCents: 0, utilizationPercent: 100, status: 'at_limit' }, 'At limit', '100% used'],
    [{ ...base, spentCents: 12500, remainingCents: -2500, utilizationPercent: 125, status: 'over' }, 'Over budget', '125% used'],
  ] as const)('renders %s status without relying on color', (item, status, text) => {
    const html = renderToString(<BudgetCard item={item} onEdit={() => {}} onRemove={() => {}} />);
    expect(html).toContain(status); expect(html).toContain(text); expect(html).toContain('Spent');
    if (item.status === 'over') { expect(html).toContain('-$25.00'); expect(html).toContain('width:100%'); expect(html).toContain('aria-valuenow="100"'); }
    if (item.status === 'no_budget') { expect(html).not.toContain('role="progressbar"'); expect(html).not.toContain('Remove'); expect(html).toContain('$75.00'); }
  });
  it('renders zero utilization and exact cents', () => {
    const html = renderToString(<BudgetCard item={{ ...base, amountCents: 1234, spentCents: 0, remainingCents: 1234, utilizationPercent: 0 }} onEdit={() => {}} onRemove={() => {}} />);
    expect(html).toContain('$12.34'); expect(html).toContain('0% used'); expect(html).toContain('aria-label="Edit budget for Food"');
  });
  it('renders a semantic labeled budget editor with associated error and preserved value', () => {
    const html = renderToString(<BudgetDialog editor={{ item: base, mode: 'save', amount: '12.345', error: null, amountError: 'Too many decimal places.' }} pending={false} store={new BudgetStore()} fallbackFocus={createRef()} />);
    expect(html).toContain('<dialog'); expect(html).toContain('aria-modal="true"'); expect(html).toContain('value="12.345"');
    expect(html).toContain('aria-invalid="true"'); expect(html).toContain('budget-amount-error'); expect(html).toContain('inputMode="decimal"');
  });
  it('identifies removed category/month and preservation of transactions, disables pending actions', () => {
    const html = renderToString(<BudgetDialog editor={{ item: base, mode: 'remove', amount: '', error: null, amountError: null }} pending store={new BudgetStore()} fallbackFocus={createRef()} />);
    expect(html).toContain('Food'); expect(html).toContain('November 2026'); expect(html).toContain('All transactions and spending will be preserved.');
    expect(html).toContain('Removing...'); expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
  it('renders loading without exposing old amounts', () => {
    const html = renderToString(<MonthProvider initialMonth="2026-11"><Budgets /></MonthProvider>);
    expect(html).toContain('Loading budgets...'); expect(html).toContain('aria-busy="true"'); expect(html).not.toContain('$0.00');
  });
  it('activates Budgets navigation with Analytics available', () => {
    const html = renderToString(<Navbar activePage="budgets" onNavigate={() => {}} />);
    expect(html).toMatch(/aria-current="page"[^>]*><span>Budgets/);
    expect(html).not.toContain('T12'); expect(html).not.toContain('T13');
  });
});
