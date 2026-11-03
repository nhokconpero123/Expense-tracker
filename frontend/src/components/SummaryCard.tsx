import { formatCentsToUsd } from '../lib/money';

export type SummaryCardType = 'income' | 'expense' | 'balance';

export interface SummaryCardProps {
  title: string;
  amountCents: number | null;
  type: SummaryCardType;
  isLoading?: boolean;
  subtext?: string;
}

export function SummaryCard({
  title,
  amountCents,
  type,
  isLoading = false,
  subtext,
}: SummaryCardProps) {
  if (isLoading || amountCents === null) {
    return (
      <div
        className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 shadow-sm"
        aria-busy="true"
        aria-label={`${title} loading`}
      >
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 rounded bg-slate-800 motion-safe:animate-pulse" />
          <div className="h-8 w-8 rounded-lg bg-slate-800 motion-safe:animate-pulse" />
        </div>
        <div className="mt-4">
          <div className="h-8 w-36 rounded bg-slate-800 motion-safe:animate-pulse" />
          <div className="mt-2 h-3 w-48 rounded bg-slate-800 motion-safe:animate-pulse" />
        </div>
      </div>
    );
  }

  const isBalance = type === 'balance';
  const isNegative = isBalance && amountCents < 0;
  const isZero = amountCents === 0;

  // Visual cues and accessible status text
  let statusBadgeText: string | null = null;
  let statusBadgeClasses = '';
  let amountColorClass = 'text-slate-100';
  let iconBgClass = 'bg-slate-800 text-slate-300';

  if (type === 'income') {
    amountColorClass = isZero ? 'text-slate-300' : 'text-emerald-400';
    iconBgClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  } else if (type === 'expense') {
    amountColorClass = isZero ? 'text-slate-300' : 'text-rose-400';
    iconBgClass = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
  } else {
    // Balance
    if (isNegative) {
      statusBadgeText = 'Deficit';
      statusBadgeClasses = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      amountColorClass = 'text-rose-400';
      iconBgClass = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
    } else if (isZero) {
      statusBadgeText = 'Break-even';
      statusBadgeClasses = 'bg-slate-800 text-slate-400 border border-slate-700';
      amountColorClass = 'text-slate-300';
      iconBgClass = 'bg-slate-800 text-slate-300 border border-slate-700';
    } else {
      statusBadgeText = 'Surplus';
      statusBadgeClasses = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      amountColorClass = 'text-emerald-400';
      iconBgClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    }
  }

  const formattedAmount = formatCentsToUsd(amountCents);

  return (
    <article
      className="relative flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 shadow-sm transition-colors hover:border-slate-700/80"
      aria-labelledby={`card-title-${type}`}
    >
      <div className="flex items-center justify-between gap-2.5 sm:gap-3">
        <span
          id={`card-title-${type}`}
          className="text-xs sm:text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap"
        >
          {title}
        </span>

        <div className="flex items-center gap-2 shrink-0">
          {statusBadgeText && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${statusBadgeClasses}`}
            >
              {statusBadgeText}
            </span>
          )}

          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${iconBgClass}`}
            aria-hidden="true"
          >
            {type === 'income' && (
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 7l10 10" />
                <path d="M17 7v10H7" />
              </svg>
            )}
            {type === 'expense' && (
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17L17 7" />
                <path d="M7 7h10v10" />
              </svg>
            )}
            {type === 'balance' && (
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                <path d="M7 21h10" />
                <path d="M12 3v18" />
                <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
              </svg>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <p
          className={`text-2xl sm:text-3xl font-bold tracking-tight ${amountColorClass}`}
          aria-live="polite"
        >
          {formattedAmount}
        </p>

        {subtext && (
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            {subtext}
          </p>
        )}
      </div>
    </article>
  );
}
