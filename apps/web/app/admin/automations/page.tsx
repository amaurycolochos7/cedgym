'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Plus, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/admin/status-badge';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import {
  adminApi,
  type Automation,
  type AutomationActionType,
  type AutomationJob,
} from '@/lib/admin-api';

export default function AdminAutomationsPage() {
  const qc = useQueryClient();
  const { data: list } = useQuery({
    queryKey: ['admin', 'automations'],
    queryFn: adminApi.listAutomations,
  });

  const [editor, setEditor] = React.useState<
    | { mode: 'new' }
    | { mode: 'edit'; automation: Automation }
    | null
  >(null);
  const [jobsFor, setJobsFor] = React.useState<Automation | null>(null);
  const [toDelete, setToDelete] = React.useState<Automation | null>(null);

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      adminApi.updateAutomation(id, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'automations'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Automaciones
          </h2>
          <p className="text-xs text-white/50">
            Dispara mensajes cuando ocurren eventos (altas, vencimientos, pagos…).
          </p>
        </div>
        <Button onClick={() => setEditor({ mode: 'new' })}>
          <Plus className="h-4 w-4" />
          Nueva automación
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/50">
            <tr>
              <th className="px-3 py-2 text-left">Nombre</th>
              <th className="px-3 py-2 text-left">Trigger</th>
              <th className="px-3 py-2 text-left">Acción</th>
              <th className="px-3 py-2 text-left">Delay</th>
              <th className="px-3 py-2 text-left">Últimas 24h</th>
              <th className="px-3 py-2 text-left">Activo</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(list ?? []).map((a) => (
              <tr key={a.id} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2 font-semibold text-white">
                  {a.name}
                </td>
                <td className="px-3 py-2">
                  <code className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-brand-orange">
                    {a.trigger_event}
                  </code>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="info">{a.action_type}</Badge>
                </td>
                <td className="px-3 py-2 text-white/70">
                  {a.delay_minutes}m
                </td>
                <td className="px-3 py-2">
                  <span className="text-white/70">{a.runs_24h ?? 0}</span>
                  {a.failures_24h ? (
                    <span className="ml-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300">
                      {a.failures_24h} fail
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={a.enabled}
                    onChange={(e) =>
                      toggle.mutate({ id: a.id, enabled: e.target.checked })
                    }
                    className="accent-brand-orange"
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setJobsFor(a)}
                    >
                      <Eye className="h-3 w-3" />
                      Jobs
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEditor({ mode: 'edit', automation: a })
                      }
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setToDelete(a)}
                    >
                      <Trash2 className="h-3 w-3 text-red-300" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {list && list.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-white/40">
                  No hay automaciones. Crea la primera.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editor && (
        <AutomationEditor
          open
          onOpenChange={() => setEditor(null)}
          initial={editor.mode === 'edit' ? editor.automation : undefined}
          onSaved={() => {
            setEditor(null);
            qc.invalidateQueries({ queryKey: ['admin', 'automations'] });
          }}
        />
      )}

      <JobsDialog
        automation={jobsFor}
        onClose={() => setJobsFor(null)}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Eliminar "${toDelete?.name}"`}
        description="No se podrán deshacer los jobs ya programados, pero dejará de dispararse."
        destructive
        onConfirm={async () => {
          if (!toDelete) return;
          await adminApi.deleteAutomation(toDelete.id);
          toast.success('Automación eliminada');
          qc.invalidateQueries({ queryKey: ['admin', 'automations'] });
          setToDelete(null);
        }}
      />
    </div>
  );
}

function AutomationEditor({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Automation;
  onSaved: () => void;
}) {
  const isEdit = !!initial;

  const triggers = useQuery({
    queryKey: ['admin', 'triggers'],
    queryFn: adminApi.automationTriggers,
  });
  const templates = useQuery({
    queryKey: ['admin', 'templates'],
    queryFn: adminApi.listTemplates,
  });

  const [form, setForm] = React.useState<{
    name: string;
    trigger_event: string;
    filter_text: string;
    delay_minutes: number;
    action_type: AutomationActionType;
    template_id: string;
    enabled: boolean;
  }>({
    name: initial?.name ?? '',
    trigger_event: initial?.trigger_event ?? '',
    filter_text: initial?.filter
      ? JSON.stringify(initial.filter, null, 2)
      : '{}',
    delay_minutes: initial?.delay_minutes ?? 0,
    action_type:
      (initial?.action_type as AutomationActionType) ??
      'whatsapp.send_template',
    template_id: initial?.template_id ?? '',
    enabled: initial?.enabled ?? true,
  });

  const [preview, setPreview] = React.useState<string | null>(null);

  const parsedFilter = React.useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(form.filter_text || '{}') };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [form.filter_text]);

  const save = useMutation({
    mutationFn: async () => {
      if (!parsedFilter.ok) throw new Error('Filter JSON inválido');
      const payload = {
        name: form.name,
        trigger_event: form.trigger_event,
        filter: parsedFilter.value,
        delay_minutes: form.delay_minutes,
        action_type: form.action_type,
        template_id: form.template_id || undefined,
        enabled: form.enabled,
      };
      if (isEdit) {
        return adminApi.updateAutomation(initial!.id, payload);
      }
      return adminApi.createAutomation(payload);
    },
    onSuccess: () => {
      toast.success('Guardado');
      onSaved();
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'No se pudo guardar');
    },
  });

  const doPreview = async () => {
    if (!form.template_id) {
      toast.error('Selecciona una plantilla');
      return;
    }
    try {
      const { preview: body } = await adminApi.previewTemplate(
        form.template_id,
        parsedFilter.ok ? parsedFilter.value : {},
      );
      setPreview(body);
    } catch {
      toast.error('No se pudo generar el preview');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar automación' : 'Nueva automación'}
          </DialogTitle>
          <DialogDescription>
            Disparar una acción cuando ocurra un evento, con un filtro opcional
            y un delay.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Input
            placeholder="Nombre (interno)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <div>
            <label className="mb-1 block text-xs text-white/60">Trigger</label>
            <Select
              value={form.trigger_event}
              onChange={(e) =>
                setForm({ ...form, trigger_event: e.target.value })
              }
            >
              <option value="">Selecciona un evento</option>
              {(triggers.data ?? []).map((t) => (
                <option key={t.event} value={t.event}>
                  {t.event} — {t.description}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">
              Filtro (JSON, opcional)
            </label>
            <textarea
              rows={4}
              value={form.filter_text}
              onChange={(e) =>
                setForm({ ...form, filter_text: e.target.value })
              }
              className="w-full rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-white"
              placeholder='{"plan_code":"pro"}'
            />
            {!parsedFilter.ok && (
              <div className="mt-1 text-[11px] text-red-300">
                JSON inválido: {parsedFilter.error}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-white/60">
                Delay (minutos)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={7 * 24 * 60}
                  step={5}
                  value={form.delay_minutes}
                  onChange={(e) =>
                    setForm({ ...form, delay_minutes: Number(e.target.value) })
                  }
                  className="flex-1 accent-brand-orange"
                />
                <Input
                  type="number"
                  value={form.delay_minutes}
                  onChange={(e) =>
                    setForm({ ...form, delay_minutes: Number(e.target.value) })
                  }
                  className="h-9 w-20"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">Acción</label>
              <Select
                value={form.action_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    action_type: e.target.value as AutomationActionType,
                  })
                }
              >
                <option value="whatsapp.send_template">WhatsApp (template)</option>
                <option value="push.notify">Push notification</option>
                <option value="email.send">Email</option>
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">Plantilla</label>
            <div className="flex items-center gap-2">
              <Select
                value={form.template_id}
                onChange={(e) =>
                  setForm({ ...form, template_id: e.target.value })
                }
                className="flex-1"
              >
                <option value="">—</option>
                {(templates.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.channel})
                  </option>
                ))}
              </Select>
              <Button
                variant="ghost"
                type="button"
                onClick={doPreview}
                disabled={!form.template_id}
              >
                Preview
              </Button>
            </div>
            {preview && (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-white/80">
                {preview}
              </pre>
            )}
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="accent-brand-orange"
            />
            Habilitada
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!form.name || !form.trigger_event}
          >
            {isEdit ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JobsDialog({
  automation,
  onClose,
}: {
  automation: Automation | null;
  onClose: () => void;
}) {
  const { data } = useQuery<AutomationJob[]>({
    queryKey: ['admin', 'automation-jobs', automation?.id],
    queryFn: () => adminApi.automationJobs(automation!.id),
    enabled: !!automation,
  });

  return (
    <Dialog open={!!automation} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Jobs — {automation?.name}</DialogTitle>
          <DialogDescription>
            Últimos 100 disparos. Útil para debuggear por qué no llegó un
            mensaje.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-950 text-[11px] uppercase tracking-wider text-white/50">
              <tr>
                <th className="px-3 py-2 text-left">Socio</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Creado</th>
                <th className="px-3 py-2 text-left">Finalizado</th>
                <th className="px-3 py-2 text-left">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(data ?? []).map((j) => (
                <tr key={j.id}>
                  <td className="px-3 py-2">{j.user_name ?? j.user_id ?? '—'}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="px-3 py-2 text-white/70">
                    {format(new Date(j.created_at), 'dd MMM HH:mm')}
                  </td>
                  <td className="px-3 py-2 text-white/70">
                    {j.finished_at
                      ? format(new Date(j.finished_at), 'dd MMM HH:mm')
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-red-300">
                    {j.error ?? ''}
                  </td>
                </tr>
              ))}
              {data && data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-xs text-white/40">
                    Sin jobs todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
