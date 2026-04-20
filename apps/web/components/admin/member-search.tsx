'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
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
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>

      {open && q.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-auto rounded-lg border border-white/10 bg-neutral-950 shadow-xl">
          {loading && (
            <div className="p-3 text-xs text-white/50">Buscando…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="p-3 text-xs text-white/50">Sin resultados</div>
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
                className="flex w-full items-center justify-between border-b border-white/5 px-3 py-2 text-left text-sm hover:bg-white/5"
              >
                <div>
                  <div className="font-semibold text-white">{m.name}</div>
                  <div className="text-[11px] text-white/50">
                    {m.phone}
                    {m.email ? ` · ${m.email}` : ''}
                  </div>
                </div>
                <div className="text-[11px] text-white/50">
                  {m.plan_name ?? '—'}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
