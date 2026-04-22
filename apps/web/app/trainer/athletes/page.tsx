'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ShoppingBag, Users as UsersIcon, Mail } from 'lucide-react';
import { trainerApi } from '@/lib/trainer-api';

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

function Initials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
      {initials || '?'}
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const base =
    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider';
  if (source === 'product')
    return (
      <span className={`${base} bg-blue-100 text-blue-700`}>
        <ShoppingBag className="h-3 w-3" /> Producto
      </span>
    );
  if (source === 'class')
    return (
      <span className={`${base} bg-sky-100 text-sky-700`}>
        <UsersIcon className="h-3 w-3" /> Clase
      </span>
    );
  if (source === 'both')
    return (
      <span className={`${base} bg-emerald-100 text-emerald-700`}>
        Producto + Clase
      </span>
    );
  return null;
}

export default function TrainerAthletesPage() {
  const [q, setQ] = React.useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['trainer', 'athletes'],
    queryFn: trainerApi.athletes,
  });

  const items = React.useMemo(() => {
    const all = data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((a) =>
      [a.name, a.full_name, a.email, a.phone]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(needle)),
    );
  }, [data, q]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Mis atletas</h1>
        <p className="text-sm text-slate-600">
          Atletas que compraron tus rutinas o asisten a tus clases.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, correo o teléfono…"
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
        />
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-500">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          {q ? 'Sin resultados para tu búsqueda.' : 'Aún no tienes atletas vinculados.'}
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-3 p-4 hover:bg-slate-50"
            >
              <Initials name={a.full_name || a.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {a.full_name || a.name}
                  </div>
                  <SourceBadge source={a.source} />
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {a.email}
                  </span>
                  {a.phone && <span>· {a.phone}</span>}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    Pagado
                  </div>
                  <div className="text-sm font-semibold text-blue-600">
                    {MXN.format(a.total_spent_mxn || 0)}
                  </div>
                </div>
                {/* Trainers don't have admin membership edit access — we surface
                    a plain mailto so they can reach out. Dedicated read-only
                    athlete view is a follow-up. */}
                <a
                  href={`mailto:${a.email}`}
                  className="text-[11px] font-semibold text-blue-600 hover:underline"
                >
                  Contactar
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
