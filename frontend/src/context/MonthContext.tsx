import { isPublicDemo } from '../lib/deployment';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEMO_EVENT } from '../lib/demoRepository';
import { getCurrentLocalMonth, isValidMonth, shiftMonth } from '../lib/date';

export interface MonthContextValue {
  month: string;
  setMonth: (month: string) => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  goToCurrentMonth: () => void;
  summaryRevision: number;
  notifyTransactionCreated: () => void;
}

export const MonthContext = createContext<MonthContextValue | null>(null);

export interface MonthProviderProps {
  children: ReactNode;
  initialMonth?: string;
}

export function MonthProvider({ children, initialMonth }: MonthProviderProps) {
  const [month, setMonthState] = useState<string>(() => {
    if (initialMonth && isValidMonth(initialMonth)) {
      return initialMonth;
    }
    return isPublicDemo ? '2026-11' : getCurrentLocalMonth();
  });
  const [summaryRevision, setSummaryRevision] = useState<number>(0);
  useEffect(() => {
    if (!isPublicDemo) return;
    const reset = () => { setMonthState('2026-11'); setSummaryRevision(value => value + 1); };
    window.addEventListener(DEMO_EVENT, reset);
    return () => window.removeEventListener(DEMO_EVENT, reset);
  }, []);

  const setMonth = (newMonth: string) => {
    if (isValidMonth(newMonth)) {
      setMonthState(newMonth);
    }
  };

  const goToPreviousMonth = () => {
    setMonthState((current) => current === '1900-01' ? current : shiftMonth(current, -1));
  };

  const goToNextMonth = () => {
    setMonthState((current) => current === '9999-12' ? current : shiftMonth(current, 1));
  };

  const goToCurrentMonth = () => {
    setMonthState(getCurrentLocalMonth());
  };

  const notifyTransactionCreated = () => {
    setSummaryRevision((prev) => prev + 1);
  };

  const value = useMemo(
    () => ({
      month,
      setMonth,
      goToPreviousMonth,
      goToNextMonth,
      goToCurrentMonth,
      summaryRevision,
      notifyTransactionCreated,
    }),
    [month, summaryRevision],
  );

  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
}

export function useMonth(): MonthContextValue {
  const context = useContext(MonthContext);
  if (!context) {
    throw new Error('useMonth must be used within a MonthProvider');
  }
  return context;
}
