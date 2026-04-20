'use client';

// Vista de membresías vencidas + campaña masiva de WhatsApp.
// El backend ya devuelve el template sugerido — lo editamos en un
// <textarea> antes de disparar.

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Send, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export default function ExpiredMembershipsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'memberships-expired'],
    queryFn: adminApi.listExpiredMemberships,
  });

  const items: ExpiredMember[] = data?.items ?? [];
  const [template, setTemplate] = React.useState(DEFAULT_TEMPLATE);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [q, setQ] = React.useState('');

  // Prefer backend template if it arrives later.
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
        e?.response?.data?.error?.message ||
        'No se pudo encolar la campaña';
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-bold uppercase tracking-wider text-white">
          Membresías vencidas · Campañas
        </h1>
        <p className="text-xs text-white/50">
          Socios con membresía expirada. Selecciona para enviar una campaña
          de reactivación por WhatsApp (2 s entre mensajes para no saturar).
        </p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <label className="block text-[11px] uppercase tracking-wider text-white/50">
          Plantilla del mensaje
        </label>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={8}
          className="mt-2 w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 font-mono text-xs text-white placeholder:text-white/30 focus:border-brand-orange/60 focus:outline-none"
          maxLength={2000}
        />
        <p className="mt-2 text-[11px] text-white/40">
          Variables disponibles: <code>{'{nombre}'}</code>,{' '}
          <code>{'{dias}'}</code>, <code>{'{plan}'}</code>.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Socios vencidos{' '}
            <span className="text-white/40">({items.length})</span>
          </h2>
          <Input
            placeholder="Buscar por nombre, teléfono o email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 w-full sm:ml-4 sm:max-w-xs"
          />
          <div className="flex items-center gap-2 sm:ml-auto">
            <Button
              disabled={selected.size === 0 || campaign.isPending}
              loading={campaign.isPending}
              onClick={() => campaign.mutate()}
              className="w-full sm:w-auto"
            >
              <Send className="h-3 w-3" />
              Enviar a {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-white/50">
            Cargando…
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/60">
            <AlertCircle className="h-4 w-4 text-brand-orange" />
            No hay membresías vencidas. ¡Buen trabajo!
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <div className="hidden overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02] md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-white/40">
                <tr>
                  <th className="p-3">
                    <input
                      type="checkbox"
                      checked={allFilteredChecked}
                      onChange={toggleAll}
                      className="accent-brand-orange"
                      aria-label="Seleccionar todos"
                    />
                  </th>
                  <th className="p-3">Socio</th>
                  <th className="p-3">Teléfono</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Días vencido</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const checked = selected.has(m.user_id);
                  return (
                    <tr
                      key={m.user_id}
                      className="border-t border-white/5 hover:bg-white/[0.02]"
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(m.user_id)}
                          className="accent-brand-orange"
                        />
                      </td>
                      <td className="p-3 text-white">{m.name}</td>
                      <td className="p-3 text-white/70">{m.phone}</td>
                      <td className="p-3 text-white/70">{m.plan}</td>
                      <td className="p-3">
                        <span
                          className={
                            m.days_since_expiry > 30
                              ? 'text-red-400'
                              : m.days_since_expiry > 7
                              ? 'text-amber-400'
                              : 'text-white/70'
                          }
                        >
                          {m.days_since_expiry} días
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={campaign.isPending}
                          onClick={() => {
                            // One-shot: send just this user.
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
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-6 text-center text-sm text-white/40"
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
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-white/40">
                Sin resultados para «{q}».
              </div>
            )}
            {filtered.map((m) => {
              const checked = selected.has(m.user_id);
              return (
                <div
                  key={m.user_id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(m.user_id)}
                      className="mt-1 accent-brand-orange"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-white">
                        {m.name}
                      </div>
                      <div className="truncate text-xs text-white/60">
                        {m.phone}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded bg-white/5 px-2 py-0.5 text-white/70">
                          {m.plan}
                        </span>
                        <span
                          className={
                            m.days_since_expiry > 30
                              ? 'text-red-400'
                              : m.days_since_expiry > 7
                              ? 'text-amber-400'
                              : 'text-white/70'
                          }
                        >
                          Vencido hace {m.days_since_expiry} d
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-3 w-full"
                    disabled={campaign.isPending}
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
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
