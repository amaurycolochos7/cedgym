'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ShoppingBag, Users as UsersIcon, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-orange/20 text-xs font-bold text-brand-orange">
      {initials || '?'}
    </div>
  );
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
        <h1 className="text-2xl font-bold uppercase tracking-widest text-white">
          Mis atletas
        </h1>
        <p className="text-sm text-white/50">
          Atletas que compraron tus rutinas o asisten a tus clases.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, correo o teléfono…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="text-sm text-white/50">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-white/40">
          {q ? 'Sin resultados para tu búsqueda.' : 'Aún no tienes atletas vinculados.'}
        </div>
      ) : (
        <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02]">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-3 p-4 hover:bg-white/[0.02]"
            >
              <Initials name={a.full_name || a.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm font-semibold text-white">
                    {a.full_name || a.name}
                  </div>
                  {a.source === 'product' && (
                    <Badge variant="brand">
                      <ShoppingBag className="h-3 w-3" /> Producto
                    </Badge>
                  )}
                  {a.source === 'class' && (
                    <Badge variant="info">
                      <UsersIcon className="h-3 w-3" /> Clase
                    </Badge>
                  )}
                  {a.source === 'both' && (
                    <Badge variant="success">Producto + Clase</Badge>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[11px] text-white/50">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {a.email}
                  </span>
                  {a.phone && <span>· {a.phone}</span>}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">
                    Pagado
                  </div>
                  <div className="text-sm font-semibold text-brand-orange">
                    {MXN.format(a.total_spent_mxn || 0)}
                  </div>
                </div>
                {/* Trainers don't have admin membership edit access — we surface
                    a plain mailto so they can reach out. Dedicated read-only
                    athlete view is a follow-up. */}
                <a
                  href={`mailto:${a.email}`}
                  className="text-[11px] font-semibold text-brand-orange hover:underline"
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
