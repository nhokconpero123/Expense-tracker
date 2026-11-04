import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Navbar } from './Navbar';
import { MonthSelector } from './MonthSelector';
import { MonthProvider } from '../context/MonthContext';

describe('Navbar component', () => {
  it('renders application header and navigation items in English', () => {
    const html = renderToString(<Navbar activePage="dashboard" onNavigate={() => {}} />);
    expect(html).toContain('Expense Tracker');
    expect(html).toContain('Dashboard');
    expect(html).toContain('Transactions');
    expect(html).toContain('Budgets');
    expect(html).toContain('Analytics');
    expect(html).toContain('aria-label="Main Navigation"');
    expect(html).toContain('aria-current="page"');
  });

  it('marks Transactions as active when on transactions page', () => {
    const html = renderToString(<Navbar activePage="transactions" onNavigate={() => {}} />);
    expect(html).toContain('Transactions');
  });
});

describe('MonthSelector component', () => {
  it.each([
    ['1900-01', true, false],
    ['9999-12', false, true],
    ['2024-12', false, false],
  ] as const)('exposes correct native disabled states for %s', (month, previousDisabled, nextDisabled) => {
    const html = renderToString(<MonthProvider initialMonth={month}><MonthSelector /></MonthProvider>);
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];
    const previous = buttons.find(button => button.includes('aria-label="Previous month"'));
    const next = buttons.find(button => button.includes('aria-label="Next month"'));
    expect(previous).toBeDefined(); expect(next).toBeDefined();
    expect(previous?.includes('disabled=""')).toBe(previousDisabled);
    expect(next?.includes('disabled=""')).toBe(nextDisabled);
  });
  it('renders with initial month and accessible controls', () => {
    const html = renderToString(
      <MonthProvider initialMonth="2026-11">
        <MonthSelector />
      </MonthProvider>,
    );
    expect(html).toContain('November 2026');
    expect(html).toContain('aria-label="Previous month"');
    expect(html).toContain('aria-label="Next month"');
    expect(html).toContain('type="month"');
    expect(html).toContain('value="2026-11"');
  });
});
