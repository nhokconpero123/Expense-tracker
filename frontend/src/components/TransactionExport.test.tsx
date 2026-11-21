import { renderToString } from 'react-dom/server';
import { expect, it } from 'vitest';
import { MonthProvider } from '../context/MonthContext';
import { TransactionExport } from './TransactionExport';

it('presents a named native export action, explicit limits and live feedback without changing month', () => {
  const html = renderToString(<MonthProvider initialMonth="2026-11"><TransactionExport filters={{ type: 'all', q: '' }} /></MonthProvider>);
  expect(html).toContain('aria-label="CSV export"'); expect(html).toContain('Export CSV');
  expect(html).toContain('role="status"'); expect(html).toContain('10,000 rows / 16 MiB');
  expect(html).not.toContain('Cancel export');
});
