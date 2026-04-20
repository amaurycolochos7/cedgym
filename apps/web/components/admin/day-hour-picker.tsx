'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
        <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/40">
          Sin horarios. Añade al menos uno.
        </div>
      )}
      {value.map((row, i) => (
        <div
          key={i}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2"
        >
          <div className="min-w-[110px] flex-1">
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/40">
              Día
            </label>
            <Select
              value={String(row.day)}
              onChange={(e) => update(i, { day: Number(e.target.value) })}
              disabled={disabled}
            >
              {DAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-[110px] flex-1">
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/40">
              Hora
            </label>
            <Input
              type="time"
              value={row.hour}
              onChange={(e) => update(i, { hour: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="min-w-[110px] flex-1">
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/40">
              Duración (min)
            </label>
            <Input
              type="number"
              min={10}
              max={300}
              value={row.duration_min}
              onChange={(e) =>
                update(i, { duration_min: Number(e.target.value) || 0 })
              }
              disabled={disabled}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => remove(i)}
            disabled={disabled}
            aria-label="Eliminar fila"
          >
            <Trash2 className="h-4 w-4 text-red-300" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={add}
        disabled={disabled}
      >
        <Plus className="h-3 w-3" />
        Añadir horario
      </Button>
    </div>
  );
}
