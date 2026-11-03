import { useEffect, useState } from 'react';

export type AppPage = 'dashboard' | 'transactions';

export interface NavbarProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
}

interface NavItem {
  id: AppPage | 'budgets' | 'analytics';
  label: string;
  href: string;
  badge?: string;
  isAvailable: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '#dashboard', isAvailable: true },
  { id: 'transactions', label: 'Transactions', href: '#transactions', isAvailable: true },
  { id: 'budgets', label: 'Budgets', href: '#budgets', badge: 'T12', isAvailable: false },
  { id: 'analytics', label: 'Analytics', href: '#analytics', badge: 'T13', isAvailable: false },
];

export function Navbar({ activePage, onNavigate }: NavbarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
              aria-hidden="true"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-semibold tracking-tight text-slate-100 sm:text-lg">
                Expense Tracker
              </span>
              <span className="hidden rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 text-[11px] font-medium text-emerald-300 sm:inline-block">
                Personal
              </span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main Navigation">
            {NAV_ITEMS.map((item) => {
              if (item.isAvailable) {
                const isActive = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id as AppPage)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                      isActive
                        ? 'border border-slate-700/80 bg-slate-800 text-slate-100 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                );
              }
              return (
                <span
                  key={item.id}
                  className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:text-slate-300"
                  title={`${item.label} will be available in task ${item.badge}`}
                >
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 border border-slate-700/50">
                      {item.badge}
                    </span>
                  )}
                </span>
              );
            })}
          </nav>

          {/* Mobile Menu Button */}
          <div className="flex items-center md:hidden">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMobileMenuOpen ? (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div
          id="mobile-menu"
          className="border-b border-slate-800 bg-slate-900 px-4 pt-2 pb-4 md:hidden"
        >
          <nav className="flex flex-col gap-1" aria-label="Mobile Navigation">
            {NAV_ITEMS.map((item) => {
              if (item.isAvailable) {
                const isActive = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigate(item.id as AppPage);
                      setIsMobileMenuOpen(false);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex min-h-[44px] items-center justify-between rounded-lg px-4 py-2.5 text-base font-medium text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                      isActive
                        ? 'border border-slate-700 bg-slate-800 text-slate-100'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <span>{item.label}</span>
                    {isActive && (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400 font-normal">
                        Active
                      </span>
                    )}
                  </button>
                );
              }
              return (
                <div
                  key={item.id}
                  className="flex min-h-[44px] items-center justify-between rounded-lg px-4 py-2.5 text-base font-medium text-slate-400"
                >
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="rounded bg-slate-800/80 px-2 py-0.5 text-xs text-slate-400 border border-slate-700/50">
                      Coming in {item.badge}
                    </span>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
