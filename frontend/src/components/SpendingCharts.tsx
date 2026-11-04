import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DailyExpense, ExpenseByCategory } from '../lib/api';
import { categoryColor, dailyAmountTicks, formatAxisCents, formatDayTick, selectDailyTicks } from '../lib/analytics';
import { formatDateDisplay, isValidDate } from '../lib/date';
import { formatCentsToUsd } from '../lib/money';

interface SpendingTooltipProps {
  kind: 'daily' | 'category';
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}

export function SpendingTooltip({ kind, active, payload }: SpendingTooltipProps) {
  const value = payload?.[0]?.payload;
  if (!active || !value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.amountCents !== 'number' || !Number.isSafeInteger(row.amountCents) || row.amountCents < 0) return null;
  const label = kind === 'daily' ? (typeof row.date === 'string' && row.date.length === 10 && isValidDate(row.date) ? formatDateDisplay(row.date) : null) :
    (typeof row.categoryName === 'string' ? row.categoryName : null);
  if (!label) return null;
  return <div role="tooltip" className="max-w-56 break-words rounded-lg border border-slate-500 bg-slate-950 p-3 text-sm text-slate-100 shadow-xl">
    <p className="font-medium">{label}</p>
    <p className="mt-1 break-all font-mono tabular-nums">{formatCentsToUsd(row.amountCents)}</p>
  </div>;
}

export function DailySpendingChart({ dailyExpenses }: { dailyExpenses: DailyExpense[] }) {
  const ticks = dailyAmountTicks(dailyExpenses);
  return <div role="group" className="h-72 w-full min-w-0" aria-label="Daily expense bar chart">
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={dailyExpenses} margin={{ top: 16, right: 12, bottom: 8, left: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="#334155" />
        <XAxis dataKey="date" ticks={selectDailyTicks(dailyExpenses)} tickFormatter={formatDayTick} interval={0}
          tick={{ fill: '#cbd5e1', fontSize: 12 }} tickMargin={8} height={32} padding={{ left: 12, right: 12 }} />
        <YAxis domain={[0, ticks.at(-1)!]} ticks={ticks} allowDecimals={false} width={80}
          tickFormatter={formatAxisCents} tick={{ fill: '#cbd5e1', fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip content={<SpendingTooltip kind="daily" />} isAnimationActive={false}
          allowEscapeViewBox={{ x: false, y: false }} wrapperStyle={{ zIndex: 10 }} cursor={{ fill: '#334155', fillOpacity: 0.4 }} />
        <Bar dataKey="amountCents" name="Daily spending" fill="#34d399" radius={[3, 3, 0, 0]}
          isAnimationActive={false} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

export function CategorySpendingChart({ categories, selectedCategoryId, onSelect }: {
  categories: ExpenseByCategory[]; selectedCategoryId: number | null; onSelect: (categoryId: number) => void;
}) {
  return <div role="group" className="h-72 w-full min-w-0" aria-label="Expense distribution donut chart">
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <PieChart margin={{ top: 16, right: 16, bottom: 16, left: 16 }} accessibilityLayer>
        <Pie data={categories} dataKey="amountCents" nameKey="categoryName" innerRadius="50%" outerRadius="80%"
          isAnimationActive={false} paddingAngle={categories.length > 1 ? 2 : 0}
          onClick={(_sector, index) => { const category = categories[index]; if (category) onSelect(category.categoryId); }}>
          {categories.map(category => <Cell key={category.categoryId} fill={categoryColor(category.categoryId)}
            stroke={selectedCategoryId === category.categoryId ? '#f8fafc' : '#0f172a'}
            strokeWidth={selectedCategoryId === category.categoryId ? 4 : 1}
            opacity={selectedCategoryId === null || selectedCategoryId === category.categoryId ? 1 : 0.4} />)}
        </Pie>
        <Tooltip content={<SpendingTooltip kind="category" />} isAnimationActive={false}
          allowEscapeViewBox={{ x: false, y: false }} wrapperStyle={{ zIndex: 10 }} />
      </PieChart>
    </ResponsiveContainer>
  </div>;
}
