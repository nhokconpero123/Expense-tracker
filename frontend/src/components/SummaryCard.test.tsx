import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SummaryCard } from './SummaryCard';

describe('SummaryCard component', () => {
  it('renders loading skeleton state when isLoading is true', () => {
    const html = renderToString(
      <SummaryCard
        title="Monthly Income"
        amountCents={null}
        type="income"
        isLoading={true}
      />,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Monthly Income loading');
  });

  it('renders positive income formatted in USD', () => {
    const html = renderToString(
      <SummaryCard
        title="Monthly Income"
        amountCents={200000}
        type="income"
        isLoading={false}
      />,
    );
    expect(html).toContain('Monthly Income');
    expect(html).toContain('$2,000.00');
  });

  it('renders expenses formatted in USD', () => {
    const html = renderToString(
      <SummaryCard
        title="Monthly Expenses"
        amountCents={7550}
        type="expense"
        isLoading={false}
      />,
    );
    expect(html).toContain('Monthly Expenses');
    expect(html).toContain('$75.50');
  });

  it('renders surplus balance with positive formatting and Surplus badge', () => {
    const html = renderToString(
      <SummaryCard
        title="Net Balance"
        amountCents={192450}
        type="balance"
        isLoading={false}
      />,
    );
    expect(html).toContain('Net Balance');
    expect(html).toContain('$1,924.50');
    expect(html).toContain('Surplus');
  });

  it('renders negative balance correctly with Deficit badge and negative sign', () => {
    const html = renderToString(
      <SummaryCard
        title="Net Balance"
        amountCents={-5000}
        type="balance"
        isLoading={false}
      />,
    );
    expect(html).toContain('Net Balance');
    expect(html).toContain('-$50.00');
    expect(html).toContain('Deficit');
  });

  it('renders zero balance with Break-even badge', () => {
    const html = renderToString(
      <SummaryCard
        title="Net Balance"
        amountCents={0}
        type="balance"
        isLoading={false}
      />,
    );
    expect(html).toContain('Net Balance');
    expect(html).toContain('$0.00');
    expect(html).toContain('Break-even');
  });
});

