import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { getCurrentLocalMonth, isValidMonth, shiftMonth } from '../lib/date';

export interface MonthContextValue {
  month: string;
  setMonth: (month: string) => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  goToCurrentMonth: () => void;
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
    return getCurrentLocalMonth();
  });

  const setMonth = (newMonth: string) => {
    if (isValidMonth(newMonth)) {
      setMonthState(newMonth);
    }
  };

  const goToPreviousMonth = () => {
    setMonthState((current) => shiftMonth(current, -1));
  };

  const goToNextMonth = () => {
    setMonthState((current) => shiftMonth(current, 1));
  };

  const goToCurrentMonth = () => {
    setMonthState(getCurrentLocalMonth());
  };

  const value = useMemo(
    () => ({
      month,
      setMonth,
      goToPreviousMonth,
      goToNextMonth,
      goToCurrentMonth,
    }),
    [month],
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

