import { isPublicDemo } from './lib/deployment';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Navbar, type AppPage } from './components/Navbar';
import { MonthProvider } from './context/MonthContext';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { Budgets } from './pages/Budgets';
import { DemoNotice } from './components/DemoNotice';
import { DEMO_EVENT, DEMO_STORAGE_KEY } from './lib/demoRepository';

const Analytics = lazy(() => import('./pages/Analytics').then(module => ({ default: module.Analytics })));

export default function App() {
  const [demoRevision, setDemoRevision] = useState(0);
  useEffect(() => {
    if (!isPublicDemo) return;
    const refresh = () => setDemoRevision(value => value + 1);
    const storage = (event: StorageEvent) => {
      if (event.key === DEMO_STORAGE_KEY || event.key === null) refresh();
    };
    window.addEventListener(DEMO_EVENT, refresh);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(DEMO_EVENT, refresh); window.removeEventListener('storage', storage); };
  }, []);
  const [activePage, setActivePage] = useState<AppPage>(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#analytics') {
      return 'analytics';
    }
    if (typeof window !== 'undefined' && window.location.hash === '#budgets') {
      return 'budgets';
    }
    if (typeof window !== 'undefined' && window.location.hash === '#transactions') {
      return 'transactions';
    }
    return 'dashboard';
  });

  // Sync hash changes with state
  useEffect(() => {
    function handleHashChange() {
      if (window.location.hash === '#analytics') {
        setActivePage('analytics');
      } else if (window.location.hash === '#budgets') {
        setActivePage('budgets');
      } else if (window.location.hash === '#transactions') {
        setActivePage('transactions');
      } else if (window.location.hash === '#dashboard' || window.location.hash === '') {
        setActivePage('dashboard');
      }
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const handleNavigate = (page: AppPage) => {
    setActivePage(page);
    if (typeof window !== 'undefined') {
      window.location.hash = `#${page}`;
    }
  };

  return (
    <MonthProvider>
      <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 antialiased overflow-x-hidden selection:bg-emerald-500/30 selection:text-emerald-200">
        <Navbar activePage={activePage} onNavigate={handleNavigate} />
        {isPublicDemo && <DemoNotice />}

        <main key={demoRevision} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Suspense fallback={<p role="status">Loading analytics...</p>}>
            {activePage === 'dashboard' ? <Dashboard /> : activePage === 'budgets' ? <Budgets /> :
              activePage === 'analytics' ? <Analytics /> : <Transactions />}
          </Suspense>
        </main>

        <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-400">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <p>
              Expense Tracker &mdash; Full-Stack Personal Finance Portfolio MVP
            </p>
          </div>
        </footer>
      </div>
    </MonthProvider>
  );
}
