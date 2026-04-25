'use client';

// Audit log — solo SUPERADMIN.

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, Search } from 'lucide-react';
import { adminApi, type AuditEntry } from '@/lib/admin-api';
import { useAuth } from '@/lib/auth';
import { planDisplayName } from '@/lib/utils';

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';

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
    ? 'bg-rose-100 text-rose-700 border-rose-200'
    : warn
    ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${color}`}
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
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
        <ShieldAlert className="h-5 w-5 text-rose-600" />
        Solo disponible para SUPERADMIN.
      </div>
    );
  }

  const items: AuditEntry[] = query.data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Auditoría
        </h1>
        <p className="text-sm text-slate-600">
          Últimas 200 acciones sensibles del workspace. Útil para rastrear
          bajas de membresías, cambios de rol y envíos masivos.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Acción
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.action}
              onChange={(e) =>
                setFilters({ ...filters, action: e.target.value })
              }
              placeholder="membership.deleted"
              className={`${INPUT_CLS} pl-9`}
            />
          </div>
        </label>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Actor (user id)
          <input
            value={filters.actor}
            onChange={(e) =>
              setFilters({ ...filters, actor: e.target.value })
            }
            placeholder="ckx..."
            className={`${INPUT_CLS} mt-1`}
          />
        </label>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Target (id)
          <input
            value={filters.target}
            onChange={(e) =>
              setFilters({ ...filters, target: e.target.value })
            }
            placeholder="id de membresía, usuario, etc."
            className={`${INPUT_CLS} mt-1`}
          />
        </label>
      </section>

      {/* Desktop table */}
      <section className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-700">
            <tr>
              <th className="p-3 text-xs font-semibold uppercase tracking-wider">
                Fecha
              </th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wider">
                Actor
              </th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wider">
                Acción
              </th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wider">
                Target
              </th>
              <th className="p-3 text-xs font-semibold uppercase tracking-wider">
                Detalle
              </th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!query.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
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
                  className="border-t border-slate-200 align-top hover:bg-slate-50"
                >
                  <td className="p-3 text-xs text-slate-600">
                    {fmtDate(e.created_at)}
                  </td>
                  <td className="p-3">
                    <div className="text-slate-900">{e.actor_name}</div>
                    <div className="text-[11px] text-slate-500">
                      {e.actor_role ?? '—'}
                    </div>
                  </td>
                  <td className="p-3">
                    <ActionBadge action={e.action} />
                  </td>
                  <td className="p-3 text-xs">
                    <div className="text-slate-700">
                      {e.target_type ?? '—'}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {e.target_id ?? '—'}
                    </div>
                  </td>
                  <td className="p-3 text-xs text-slate-700">
                    {reason && (
                      <div className="mb-1">
                        <span className="text-slate-500">Motivo: </span>
                        <span className="text-slate-900">{reason}</span>
                      </div>
                    )}
                    {(userName || plan) && (
                      <div className="text-slate-600">
                        {userName && <span>{userName}</span>}
                        {userName && plan && ' · '}
                        {plan && <span>{planDisplayName(plan)}</span>}
                      </div>
                    )}
                    {!reason && !userName && !plan && meta && (
                      <code className="block max-w-[320px] truncate text-[11px] text-slate-500">
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

      {/* Mobile card list */}
      <section className="space-y-2 md:hidden">
        {query.isLoading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            Cargando…
          </div>
        )}
        {!query.isLoading && items.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            Sin eventos.
          </div>
        )}
        {items.map((e) => {
          const meta = e.metadata as Record<string, any> | null;
          const reason = meta?.reason as string | undefined;
          const userName = meta?.user_name as string | undefined;
          const plan = meta?.plan as string | undefined;
          return (
            <div
              key={e.id}
              className="rounded-2xl border border-slate-200 bg-white p-3 text-sm"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <ActionBadge action={e.action} />
                <span className="text-[11px] text-slate-500">
                  {fmtDate(e.created_at)}
                </span>
              </div>
              <div className="mb-2 text-xs">
                <span className="text-slate-500">Actor: </span>
                <span className="text-slate-900">{e.actor_name}</span>
                <span className="ml-1 text-slate-500">
                  ({e.actor_role ?? '—'})
                </span>
              </div>
              {(e.target_type || e.target_id) && (
                <div className="mb-2 text-xs text-slate-700">
                  <span className="text-slate-500">Target: </span>
                  {e.target_type ?? '—'}
                  <span className="ml-1 block truncate font-mono text-[11px] text-slate-500">
                    {e.target_id ?? '—'}
                  </span>
                </div>
              )}
              {reason && (
                <div className="mb-1 text-xs">
                  <span className="text-slate-500">Motivo: </span>
                  <span className="text-slate-900">{reason}</span>
                </div>
              )}
              {(userName || plan) && (
                <div className="text-xs text-slate-600">
                  {userName && <span>{userName}</span>}
                  {userName && plan && ' · '}
                  {plan && <span>{planDisplayName(plan)}</span>}
                </div>
              )}
              {!reason && !userName && !plan && meta && (
                <code className="block truncate text-[11px] text-slate-500">
                  {JSON.stringify(meta)}
                </code>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
