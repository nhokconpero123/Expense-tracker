import { useMonth } from '../context/MonthContext';
import { formatMonthDisplay, getCurrentLocalMonth } from '../lib/date';

export function MonthSelector() {
  const { month, setMonth, goToPreviousMonth, goToNextMonth, goToCurrentMonth } = useMonth();
  const currentLocalMonth = getCurrentLocalMonth();
  const isCurrentMonth = month === currentLocalMonth;

  return (
    <div
      className="inline-flex flex-wrap items-center gap-2 sm:gap-2.5"
      role="region"
      aria-label="Month selection"
    >
      {/* Month step navigation controls */}
      <div className="inline-flex items-center rounded-lg border border-slate-700/80 bg-slate-800/90 p-1 shadow-sm">
        <button
          type="button"
          onClick={goToPreviousMonth}
          className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md text-slate-300 hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          aria-label="Previous month"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="px-2.5 sm:px-3 text-center min-w-[125px] sm:min-w-[145px]">
          <span
            className="text-xs sm:text-sm font-semibold tracking-wide text-slate-100 whitespace-nowrap"
            aria-live="polite"
          >
            {formatMonthDisplay(month)}
          </span>
        </div>

        <button
          type="button"
          onClick={goToNextMonth}
          className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md text-slate-300 hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          aria-label="Next month"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Auxiliary Month Controls Group */}
      <div className="inline-flex items-center gap-2">
        {/* Quick Jump to Current Month */}
        {!isCurrentMonth ? (
          <button
            type="button"
            onClick={goToCurrentMonth}
            className="inline-flex h-9 items-center rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 sm:px-3 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 whitespace-nowrap"
          >
            Current Month
          </button>
        ) : (
          <span className="inline-flex h-9 items-center rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2.5 sm:px-3 text-xs font-medium text-emerald-400 whitespace-nowrap">
            Current Month
          </span>
        )}

        {/* Native Month Picker for Direct Selection */}
        <div className="relative inline-flex items-center">
          <label htmlFor="month-picker" className="sr-only">
            Jump to specific month
          </label>
          <input
            id="month-picker"
            type="month"
            value={month}
            min="1900-01"
            max="9999-12"
            onChange={(event) => {
              if (event.target.value) {
                setMonth(event.target.value);
              }
            }}
            className="h-9 cursor-pointer rounded-lg border border-slate-700 bg-slate-800/80 px-2 sm:px-2.5 text-xs text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            title="Pick calendar month"
          />
        </div>
      </div>
    </div>
  );
}
