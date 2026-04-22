'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { staffApi } from '@/lib/admin-api';
import type { AdminMember } from '@/lib/admin-api';
import { cn } from '@/lib/utils';

interface MemberSearchProps {
  onSelect: (member: AdminMember) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Autocomplete that hits `/staff/members/search?q=` on each keystroke
 * (debounced). Used both in the admin shell and on the POS screen.
 */
export function MemberSearch({
  onSelect,
  placeholder = 'Buscar socio (nombre, teléfono, email)',
  className,
}: MemberSearchProps) {
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState<AdminMember[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!q || q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setLoading(true);
        const items = await staffApi.search(q);
        setResults(items);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="flex h-10 w-full rounded-xl border border-slate-300 bg-slate-50 pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
        />
      </div>

      {open && q.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {loading && (
            <div className="px-4 py-3 text-xs text-slate-500">Buscando…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-4 py-3 text-xs text-slate-500">Sin resultados</div>
          )}
          {!loading &&
            results.map((m) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(m);
                  setQ('');
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-2.5 text-left text-sm last:border-0 hover:bg-slate-50"
              >
                <div>
                  <div className="font-semibold text-slate-900">{m.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {m.phone}
                    {m.email ? ` · ${m.email}` : ''}
                  </div>
                </div>
                <div className="text-[11px] text-slate-500">
                  {m.plan_name ?? '—'}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
