import { createRoot } from 'react-dom/client';
import { MonthProvider, useMonth } from '../context/MonthContext';
import { Analytics } from '../pages/Analytics';
import { Navbar } from '../components/Navbar';
import { createAnalyticsFixture } from './analyticsFixtures';
import type { MonthlySummary } from '../lib/api';
import '../styles.css';

// Only this isolated test entry installs fixtures. No request reaches a backend.
let mode: 'success' | 'hold' | 'error' = 'success';
let amount = 7550;
let multi = false;
const pending: (() => void)[] = [];
const requests: string[] = [];
function fixture(month: string): MonthlySummary {
  const data = createAnalyticsFixture(month, amount);
  if (multi && amount > 1) data.expensesByCategory = [
    { categoryId: 4, categoryName: 'Food', amountCents: amount - 1 },
    { categoryId: 5, categoryName: 'Housing', amountCents: 1 },
  ];
  return data;
}
window.fetch = async (input, init) => {
  const url = String(input);
  requests.push(`${init?.method ?? 'GET'} ${url}`);
  if (!url.startsWith('/api/summary?month=') || (init?.method && init.method !== 'GET')) {
    throw new Error('Unexpected request in isolated analytics test');
  }
  const data = fixture(new URL(url, location.origin).searchParams.get('month') ?? '');
  const requestMode = mode;
  if (requestMode === 'hold') await new Promise<void>(resolve => pending.push(resolve));
  return requestMode === 'error'
    ? Response.json({ error: { message: 'Simulated summary failure', code: 'INTERNAL_ERROR' } }, { status: 500 })
    : Response.json({ data });
};

const harness = {
  configure(next: typeof mode, cents = amount, multiple = multi) { mode = next; amount = cents; multi = multiple; },
  release() { pending.splice(0).forEach(resolve => resolve()); },
  requests,
};
declare global { interface Window { analyticsHarness: typeof harness } }
window.analyticsHarness = harness;

function FixtureRevision() {
  const { notifyTransactionCreated } = useMonth();
  return <button onClick={notifyTransactionCreated}>Simulate transaction revision</button>;
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing test root');
createRoot(root).render(<MonthProvider initialMonth="2024-02">
  <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
    <Navbar activePage="analytics" onNavigate={() => {}} />
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"><Analytics /></main>
    <FixtureRevision />
  </div>
</MonthProvider>);
