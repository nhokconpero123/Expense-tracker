import { Navbar } from './components/Navbar';
import { MonthProvider } from './context/MonthContext';
import { Dashboard } from './pages/Dashboard';

export default function App() {
  return (
    <MonthProvider>
      <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 antialiased overflow-x-hidden selection:bg-emerald-500/30 selection:text-emerald-200">
        <Navbar />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Dashboard />
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
