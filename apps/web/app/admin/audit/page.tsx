'use client';

// Audit log — solo SUPERADMIN. Útil para ver quién eliminó qué membresía
// y con qué justificación.

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { adminApi, type AuditEntry } from '@/lib/admin-api';
import { useAuth } from '@/lib/auth';

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function ActionBadge({ action }: { action: string }) {
  const danger = /deleted|denied|failed|canceled|revoked/i.test(action);
  const warn = /suspend|freeze|reject|unfreeze/i.test(action);
  const color = danger
    ? 'bg-red-500/10 text-red-300 ring-red-500/30'
    : warn
    ? 'bg-amber-500/10 text-amber-300 ring-amber-500/30'
    : 'bg-white/5 text-white/70 ring-white/10';
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${color}`}
    >
      {action}
    </span>
  );
}

export default function AuditPage() {
  const { user } = useAuth();
  const [filters, setFilters] = React.useState({
    action: '',
    actor: '',
    target: '',
  });

  const query = useQuery({
    queryKey: ['admin', 'audit', filters],
    queryFn: () =>
      adminApi.listAuditLog({
        limit: 200,
        action: filters.action || undefined,
        actor: filters.actor || undefined,
        target: filters.target || undefined,
      }),
    enabled: user?.role === 'SUPERADMIN',
  });

  if (user && user.role !== 'SUPERADMIN') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/70">
        <ShieldAlert className="h-5 w-5 text-red-400" />
        Solo disponible para SUPERADMIN.
      </div>
    );
  }

  const items: AuditEntry[] = query.data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-bold uppercase tracking-wider text-white">
          Auditoría
        </h1>
        <p className="text-xs text-white/50">
          Últimas 200 acciones sensibles del workspace. Útil para rastrear
          bajas de membresías, cambios de rol y envíos masivos.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block text-[11px] uppercase tracking-wider text-white/50">
          Acción
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/40" />
            <Input
              value={filters.action}
              onChange={(e) =>
                setFilters({ ...filters, action: e.target.value })
              }
              placeholder="membership.deleted"
              className="h-9 pl-7"
            />
          </div>
        </label>
        <label className="block text-[11px] uppercase tracking-wider text-white/50">
          Actor (user id)
          <Input
            value={filters.actor}
            onChange={(e) =>
              setFilters({ ...filters, actor: e.target.value })
            }
            placeholder="ckx..."
            className="mt-1 h-9"
          />
        </label>
        <label className="block text-[11px] uppercase tracking-wider text-white/50">
          Target (id)
          <Input
            value={filters.target}
            onChange={(e) =>
              setFilters({ ...filters, target: e.target.value })
            }
            placeholder="id de membresía, usuario, etc."
            className="mt-1 h-9"
          />
        </label>
      </section>

      <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-white/40">
            <tr>
              <th className="p-3">Fecha</th>
              <th className="p-3">Actor</th>
              <th className="p-3">Acción</th>
              <th className="p-3">Target</th>
              <th className="p-3">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-white/40">
                  Cargando…
                </td>
              </tr>
            )}
            {!query.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-white/40">
                  Sin eventos.
                </td>
              </tr>
            )}
            {items.map((e) => {
              const meta = e.metadata as Record<string, any> | null;
              const reason = meta?.reason as string | undefined;
              const userName = meta?.user_name as string | undefined;
              const plan = meta?.plan as string | undefined;
              return (
                <tr
                  key={e.id}
                  className="border-t border-white/5 align-top hover:bg-white/[0.02]"
                >
                  <td className="p-3 text-xs text-white/60">
                    {fmtDate(e.created_at)}
                  </td>
                  <td className="p-3">
                    <div className="text-white">{e.actor_name}</div>
                    <div className="text-[11px] text-white/40">
                      {e.actor_role ?? '—'}
                    </div>
                  </td>
                  <td className="p-3">
                    <ActionBadge action={e.action} />
                  </td>
                  <td className="p-3 text-xs">
                    <div className="text-white/70">{e.target_type ?? '—'}</div>
                    <div className="font-mono text-[11px] text-white/40">
                      {e.target_id ?? '—'}
                    </div>
                  </td>
                  <td className="p-3 text-xs text-white/70">
                    {reason && (
                      <div className="mb-1">
                        <span className="text-white/40">Motivo: </span>
                        <span className="text-white/90">{reason}</span>
                      </div>
                    )}
                    {(userName || plan) && (
                      <div className="text-white/60">
                        {userName && <span>{userName}</span>}
                        {userName && plan && ' · '}
                        {plan && <span>{plan}</span>}
                      </div>
                    )}
                    {!reason && !userName && !plan && meta && (
                      <code className="block max-w-[320px] truncate text-[11px] text-white/50">
                        {JSON.stringify(meta)}
                      </code>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
