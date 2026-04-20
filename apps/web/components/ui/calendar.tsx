'use client';

import * as React from 'react';
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CalendarProps {
  value?: Date;
  onChange?: (date: Date) => void;
  className?: string;
  /** Day cells to highlight (e.g. has activity). */
  highlighted?: Date[];
}

/**
 * Tiny month-grid calendar. Good enough for "pick a date" and
 * low-density heatmap visualizations.
 */
export function Calendar({
  value,
  onChange,
  className,
  highlighted = [],
}: CalendarProps) {
  const [view, setView] = React.useState<Date>(value ?? new Date());

  const firstOfMonth = startOfMonth(view);
  const gridStart = startOfWeek(firstOfMonth, { weekStartsOn: 1 });

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(addDays(gridStart, i));
  }

  const isHighlighted = (d: Date) =>
    highlighted.some((h) => isSameDay(h, d));

  return (
    <div
      className={cn(
        'rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setView(subMonths(view, 1))}
          className="rounded-md p-1 text-white/60 hover:bg-white/5 hover:text-white"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-xs font-semibold uppercase tracking-wider text-white/80">
          {format(view, 'MMMM yyyy')}
        </div>
        <button
          type="button"
          onClick={() => setView(addMonths(view, 1))}
          className="rounded-md p-1 text-white/60 hover:bg-white/5 hover:text-white"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 text-center text-[10px] uppercase tracking-wider text-white/40">
        {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const inMonth = isSameMonth(d, view);
          const selected = value ? isSameDay(d, value) : false;
          const hl = isHighlighted(d);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onChange?.(d)}
              className={cn(
                'flex h-9 items-center justify-center rounded-md text-xs transition-all',
                inMonth ? 'text-white/80' : 'text-white/20',
                selected && 'bg-brand-orange text-black font-bold',
                !selected && hl && 'ring-1 ring-brand-orange/50',
                !selected && 'hover:bg-white/5',
              )}
            >
              {format(d, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
