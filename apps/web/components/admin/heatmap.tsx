'use client';

import { cn } from '@/lib/utils';

interface HeatmapProps {
  /** Flat cells: {day: 0-6, hour: 0-23, count: number}. Missing cells = 0. */
  cells: { day: number; hour: number; count: number }[];
  className?: string;
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * 7x24 heatmap. Colors are interpolated between a light slate base and
 * brand blue based on the max value in `cells`.
 */
export function Heatmap({ cells, className }: HeatmapProps) {
  const max = cells.reduce((m, c) => Math.max(m, c.count), 0) || 1;

  const lookup = new Map<string, number>();
  for (const c of cells) lookup.set(`${c.day}:${c.hour}`, c.count);

  return (
    <div className={cn('overflow-x-auto', className)}>
      <div className="min-w-[720px]">
        {/* hour header */}
        <div
          className="ml-10 grid gap-[2px] text-[9px] font-medium text-slate-500"
          style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
        >
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} className="text-center">
              {h % 3 === 0 ? `${h}h` : ''}
            </div>
          ))}
        </div>
        {/* rows */}
        <div className="mt-1 space-y-[2px]">
          {DAY_LABELS.map((label, d) => (
            <div key={d} className="flex items-center gap-2">
              <div className="w-8 text-[10px] font-medium text-slate-600">
                {label}
              </div>
              <div
                className="grid flex-1 gap-[2px]"
                style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
              >
                {Array.from({ length: 24 }).map((_, h) => {
                  const v = lookup.get(`${d}:${h}`) ?? 0;
                  const intensity = v / max;
                  const bg =
                    v === 0
                      ? 'rgb(241, 245, 249)' // slate-100
                      : `rgba(37, 99, 235, ${0.15 + intensity * 0.8})`; // blue-600
                  return (
                    <div
                      key={h}
                      title={`${label} ${h}:00 — ${v}`}
                      className="h-5 rounded-sm transition-colors hover:ring-2 hover:ring-blue-400"
                      style={{ background: bg }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
