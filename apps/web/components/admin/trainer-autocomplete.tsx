'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Trainer / staff autocomplete. Hits `/admin/staff`, filters client
 * side by name/email and the requested set of roles. Debounces input
 * so we don't thrash the network while the admin types.
 *
 * Usage:
 *   <TrainerAutocomplete
 *     value={form.trainer_id}
 *     valueLabel={form.trainer_name}
 *     onSelect={(u) => setForm({...form, trainer_id: u.id, trainer_name: u.name})}
 *   />
 */

type StaffRole =
  | 'RECEPTIONIST'
  | 'TRAINER'
  | 'ADMIN'
  | 'SUPERADMIN';

export interface TrainerOption {
  id: string;
  name: string;
  email?: string;
  role: StaffRole;
}

interface Props {
  value?: string | null;
  valueLabel?: string | null;
  placeholder?: string;
  roles?: StaffRole[];
  onSelect: (u: TrainerOption | null) => void;
  className?: string;
  disabled?: boolean;
}

export function TrainerAutocomplete({
  value,
  valueLabel,
  placeholder = 'Buscar trainer…',
  roles = ['TRAINER', 'ADMIN', 'SUPERADMIN'],
  onSelect,
  className,
  disabled,
}: Props) {
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(false);

  const { data, isFetching } = useQuery({
    queryKey: ['admin', 'staff-autocomplete'],
    queryFn: async () => {
      const r = await api.get<{ items: TrainerOption[] }>('/admin/staff');
      return r.data?.items ?? [];
    },
    staleTime: 60_000,
  });

  const filtered = React.useMemo(() => {
    const pool = (data ?? []).filter((u) => roles.includes(u.role));
    const needle = q.trim().toLowerCase();
    if (!needle) return pool.slice(0, 10);
    return pool
      .filter(
        (u) =>
          u.name?.toLowerCase().includes(needle) ||
          u.email?.toLowerCase().includes(needle),
      )
      .slice(0, 10);
  }, [data, q, roles]);

  // When a value is pre-selected we show a compact chip; clicking it
  // clears the selection and focuses the input.
  if (value && valueLabel && !focused && !open) {
    return (
      <div
        className={cn(
          'flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm',
          disabled && 'opacity-50',
          className,
        )}
      >
        <div className="truncate text-white">{valueLabel}</div>
        {!disabled && (
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setOpen(true);
            }}
            className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
            aria-label="Cambiar trainer"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setFocused(true);
            setOpen(true);
          }}
          onBlur={() => {
            // Defer so click on item can land.
            setTimeout(() => {
              setOpen(false);
              setFocused(false);
            }, 150);
          }}
          placeholder={placeholder}
          className="pl-9"
          disabled={disabled}
        />
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-auto rounded-lg border border-white/10 bg-neutral-950 shadow-xl">
          {isFetching && filtered.length === 0 && (
            <div className="p-3 text-xs text-white/50">Cargando…</div>
          )}
          {!isFetching && filtered.length === 0 && (
            <div className="p-3 text-xs text-white/50">Sin resultados</div>
          )}
          {filtered.map((u) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(u);
                setQ('');
                setOpen(false);
                setFocused(false);
              }}
              className="flex w-full items-center justify-between border-b border-white/5 px-3 py-2 text-left text-sm last:border-0 hover:bg-white/5"
            >
              <div className="min-w-0">
                <div className="truncate font-semibold text-white">{u.name}</div>
                {u.email && (
                  <div className="truncate text-[11px] text-white/50">
                    {u.email}
                  </div>
                )}
              </div>
              <span className="ml-2 shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/50">
                {u.role}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
