'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Editor of weekly schedule rows. Each row = day-of-week + time + duration.
 * Returns an array the caller can ship as-is to the course/class backend.
 *
 *   [{day: 1, hour: "18:00", duration_min: 60}, ...]
 *
 * day: 0 = Monday ... 6 = Sunday (matches our frontend convention).
 */

export interface ScheduleRow {
  day: number;
  hour: string;
  duration_min: number;
}

const DAYS = [
  { value: 0, label: 'Lun' },
  { value: 1, label: 'Mar' },
  { value: 2, label: 'Mié' },
  { value: 3, label: 'Jue' },
  { value: 4, label: 'Vie' },
  { value: 5, label: 'Sáb' },
  { value: 6, label: 'Dom' },
];

interface Props {
  value: ScheduleRow[];
  onChange: (rows: ScheduleRow[]) => void;
  className?: string;
  disabled?: boolean;
}

const fieldClass =
  'flex h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60';

const labelClass =
  'mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500';

export function DayHourPicker({
  value,
  onChange,
  className,
  disabled,
}: Props) {
  const add = () => {
    onChange([
      ...value,
      { day: 0, hour: '18:00', duration_min: 60 },
    ]);
  };
  const update = (i: number, patch: Partial<ScheduleRow>) => {
    const next = value.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  };
  const remove = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  return (
    <div className={cn('space-y-2', className)}>
      {value.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
          Sin horarios. Añade al menos uno.
        </div>
      )}
      {value.map((row, i) => (
        <div
          key={i}
          className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3"
        >
          <div className="min-w-[110px] flex-1">
            <label className={labelClass}>Día</label>
            <select
              value={String(row.day)}
              onChange={(e) => update(i, { day: Number(e.target.value) })}
              disabled={disabled}
              className={fieldClass}
            >
              {DAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[110px] flex-1">
            <label className={labelClass}>Hora</label>
            <input
              type="time"
              value={row.hour}
              onChange={(e) => update(i, { hour: e.target.value })}
              disabled={disabled}
              className={fieldClass}
            />
          </div>
          <div className="min-w-[110px] flex-1">
            <label className={labelClass}>Duración (min)</label>
            <input
              type="number"
              min={10}
              max={300}
              value={row.duration_min}
              onChange={(e) =>
                update(i, { duration_min: Number(e.target.value) || 0 })
              }
              disabled={disabled}
              className={fieldClass}
            />
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            disabled={disabled}
            aria-label="Eliminar fila"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-rose-600 transition hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="h-3.5 w-3.5" />
        Añadir horario
      </button>
    </div>
  );
}
