'use client';

// Vista de membresías vencidas + campaña masiva de WhatsApp.

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Send, AlertCircle } from 'lucide-react';
import { adminApi, type ExpiredMember } from '@/lib/admin-api';

const DEFAULT_TEMPLATE = [
  'Hola {nombre} 👋',
  '',
  'Te extrañamos en CED·GYM 💪. Tu plan venció hace {dias} días — es momento de volver.',
  '',
  '📣 *Promoción exclusiva*: 15% off en tu renovación si activas hoy.',
  '',
  '👉 https://cedgym.187-77-11-79.sslip.io/planes',
].join('\n');

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 disabled:pointer-events-none';
const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none';

export default function ExpiredMembershipsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'memberships-expired'],
    queryFn: adminApi.listExpiredMemberships,
  });

  const items: ExpiredMember[] = data?.items ?? [];
  const [template, setTemplate] = React.useState(DEFAULT_TEMPLATE);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [q, setQ] = React.useState('');

  React.useEffect(() => {
    if (data?.template && template === DEFAULT_TEMPLATE) {
      setTemplate(data.template);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.template]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(needle) ||
        (i.phone || '').includes(needle) ||
        (i.email || '').toLowerCase().includes(needle),
    );
  }, [items, q]);

  const allFilteredChecked =
    filtered.length > 0 && filtered.every((i) => selected.has(i.user_id));

  function toggleAll() {
    const next = new Set(selected);
    if (allFilteredChecked) {
      filtered.forEach((i) => next.delete(i.user_id));
    } else {
      filtered.forEach((i) => next.add(i.user_id));
    }
    setSelected(next);
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const campaign = useMutation({
    mutationFn: () =>
      adminApi.whatsappBulkCampaign({
        user_ids: [...selected],
        message_template: template,
      }),
    onSuccess: (res) => {
      toast.success(`Campaña encolada: ${res.enqueued} mensajes`);
      setSelected(new Set());
    },
    onError: (e: any) => {
      const msg =
        e?.response?.data?.error?.message || 'No se pudo encolar la campaña';
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Membresías vencidas · Campañas
        </h1>
        <p className="text-xs text-slate-500">
          Socios con membresía expirada. Selecciona para enviar una campaña de
          reactivación por WhatsApp (2 s entre mensajes para no saturar).
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Plantilla del mensaje
        </label>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={8}
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none"
          maxLength={2000}
        />
        <p className="mt-2 text-[11px] text-slate-500">
          Variables disponibles: <code>{'{nombre}'}</code>,{' '}
          <code>{'{dias}'}</code>, <code>{'{plan}'}</code>.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
            Socios vencidos{' '}
            <span className="text-slate-500">({items.length})</span>
          </h2>
          <input
            placeholder="Buscar por nombre, teléfono o email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={`${INPUT_CLS} sm:ml-4 sm:max-w-xs`}
          />
          <div className="flex items-center gap-2 sm:ml-auto">
            <button
              type="button"
              disabled={selected.size === 0 || campaign.isPending}
              onClick={() => campaign.mutate()}
              className={`${BTN_PRIMARY} w-full sm:w-auto`}
            >
              <Send className="h-3.5 w-3.5" />
              {campaign.isPending
                ? 'Enviando…'
                : `Enviar a ${selected.size} seleccionado${
                    selected.size === 1 ? '' : 's'
                  }`}
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            Cargando…
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            No hay membresías vencidas. ¡Buen trabajo!
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={allFilteredChecked}
                      onChange={toggleAll}
                      className="accent-blue-600"
                      aria-label="Seleccionar todos"
                    />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                    Socio
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                    Teléfono
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                    Días vencido
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-right">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const checked = selected.has(m.user_id);
                  return (
                    <tr
                      key={m.user_id}
                      className="border-t border-slate-200 hover:bg-slate-50 transition"
                    >
                      <td className="px-4 py-3.5 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(m.user_id)}
                          className="accent-blue-600"
                        />
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-900 font-medium">
                        {m.name}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">
                        {m.phone}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">
                        {m.plan}
                      </td>
                      <td className="px-4 py-3.5 text-sm">
                        <span
                          className={
                            m.days_since_expiry > 30
                              ? 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200'
                              : m.days_since_expiry > 7
                              ? 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200'
                              : 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200'
                          }
                        >
                          {m.days_since_expiry} días
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          disabled={campaign.isPending}
                          className={BTN_SECONDARY}
                          onClick={() => {
                            adminApi
                              .whatsappBulkCampaign({
                                user_ids: [m.user_id],
                                message_template: template,
                              })
                              .then(() =>
                                toast.success(`Campaña enviada a ${m.name}`),
                              )
                              .catch((e: any) =>
                                toast.error(
                                  e?.response?.data?.error?.message ||
                                    'No se pudo enviar',
                                ),
                              );
                          }}
                        >
                          <Send className="h-3 w-3" />
                          Enviar campaña
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-6 text-center text-sm text-slate-500"
                    >
                      Sin resultados para «{q}».
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <div className="space-y-2 md:hidden">
            {filtered.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                Sin resultados para «{q}».
              </div>
            )}
            {filtered.map((m) => {
              const checked = selected.has(m.user_id);
              return (
                <div
                  key={m.user_id}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(m.user_id)}
                      className="mt-1 accent-blue-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">
                        {m.name}
                      </div>
                      <div className="truncate text-xs text-slate-600">
                        {m.phone}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-slate-700">
                          {m.plan}
                        </span>
                        <span
                          className={
                            m.days_since_expiry > 30
                              ? 'text-rose-700 font-semibold'
                              : m.days_since_expiry > 7
                              ? 'text-amber-700 font-semibold'
                              : 'text-slate-600'
                          }
                        >
                          Vencido hace {m.days_since_expiry} d
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={campaign.isPending}
                    className={`${BTN_SECONDARY} mt-3 w-full`}
                    onClick={() => {
                      adminApi
                        .whatsappBulkCampaign({
                          user_ids: [m.user_id],
                          message_template: template,
                        })
                        .then(() =>
                          toast.success(`Campaña enviada a ${m.name}`),
                        )
                        .catch((e: any) =>
                          toast.error(
                            e?.response?.data?.error?.message ||
                              'No se pudo enviar',
                          ),
                        );
                    }}
                  >
                    <Send className="h-3 w-3" />
                    Enviar campaña
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
