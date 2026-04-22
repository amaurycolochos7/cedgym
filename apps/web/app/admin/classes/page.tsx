'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfWeek,
  subWeeks,
  addWeeks,
} from 'date-fns';
import { toast } from 'sonner';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  List as ListIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import {
  TrainerAutocomplete,
  type TrainerOption,
} from '@/components/admin/trainer-autocomplete';
import { adminApi, type AdminClass } from '@/lib/admin-api';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const SPORTS = [
  { value: 'FOOTBALL', label: 'Fútbol' },
  { value: 'BOXING', label: 'Boxeo' },
  { value: 'MMA', label: 'MMA' },
  { value: 'POWERLIFTING', label: 'Powerlifting' },
  { value: 'CROSSFIT', label: 'CrossFit' },
  { value: 'WEIGHTLIFTING', label: 'Weightlifting' },
  { value: 'GENERAL_FITNESS', label: 'Fitness general' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'NUTRITION', label: 'Nutrición' },
  { value: 'OTHER', label: 'Otro' },
];

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 disabled:pointer-events-none';
const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none';
const BTN_DANGER =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60 disabled:pointer-events-none';

export default function AdminClassesPage() {
  const qc = useQueryClient();
  const [anchor, setAnchor] = React.useState(new Date());
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(anchor, { weekStartsOn: 1 });
  const [detail, setDetail] = React.useState<AdminClass | null>(null);
  const [newOpen, setNewOpen] = React.useState(false);
  const [cancel, setCancel] = React.useState<AdminClass | null>(null);

  const { data: classes } = useQuery({
    queryKey: [
      'admin',
      'classes',
      weekStart.toISOString(),
      weekEnd.toISOString(),
    ],
    queryFn: () =>
      adminApi.listClasses({
        from: weekStart.toISOString(),
        to: weekEnd.toISOString(),
      }),
  });

  const byDay = React.useMemo(() => {
    const map = new Map<string, AdminClass[]>();
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      map.set(format(d, 'yyyy-MM-dd'), []);
    }
    for (const c of classes ?? []) {
      const key = format(parseISO(c.starts_at), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [classes, weekStart]);

  const cancelMut = useMutation({
    mutationFn: (id: string) => adminApi.cancelClass(id),
    onSuccess: () => {
      toast.success('Clase cancelada, notificaciones en cola.');
      qc.invalidateQueries({ queryKey: ['admin', 'classes'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Clases
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM yyyy')}
          </p>
        </div>
        <div className="ml-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAnchor(subWeeks(anchor, 1))}
            className="inline-flex items-center rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(new Date())}
            className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setAnchor(addWeeks(anchor, 1))}
            className="inline-flex items-center rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className={BTN_PRIMARY}
          >
            <Plus className="h-4 w-4" />
            Nueva clase
          </button>
        </div>
      </div>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">
            <CalendarDays className="mr-1 h-3 w-3" />
            Calendario
          </TabsTrigger>
          <TabsTrigger value="list">
            <ListIcon className="mr-1 h-3 w-3" />
            Lista
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => {
              const d = addDays(weekStart, i);
              const key = format(d, 'yyyy-MM-dd');
              const items = byDay.get(key) ?? [];
              const today = isSameDay(d, new Date());
              return (
                <div
                  key={key}
                  className={`rounded-2xl border p-3 ${
                    today
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {DAYS[i]}
                      </div>
                      <div className="text-lg font-bold text-slate-900">
                        {format(d, 'd')}
                      </div>
                    </div>
                    {today && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold bg-blue-600 text-white">
                        Hoy
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {items.length === 0 && (
                      <div className="text-[11px] text-slate-400">—</div>
                    )}
                    {items.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setDetail(c)}
                        className="block w-full rounded-lg border border-slate-200 bg-white p-2 text-left text-[11px] hover:border-blue-300 hover:bg-blue-50"
                      >
                        <div className="font-semibold text-slate-900">
                          {c.name}
                        </div>
                        <div className="text-slate-500">
                          {format(parseISO(c.starts_at), 'HH:mm')} ·{' '}
                          {c.coach_name ?? '—'}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-slate-600">
                            {c.booked}/{c.capacity}
                          </span>
                          {c.status === 'cancelled' && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold bg-rose-100 text-rose-700 border border-rose-200">
                              Cancelada
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="list">
          <ClassListTable
            classes={classes ?? []}
            onOpen={(c) => setDetail(c)}
            onCancel={(c) => setCancel(c)}
          />
        </TabsContent>
      </Tabs>

      {/* Detail */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg bg-white border-slate-200 text-slate-900">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-900">
                  {detail.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm text-slate-700">
                <div>
                  <span className="text-slate-500">Coach:</span>{' '}
                  {detail.coach_name ?? '—'}
                </div>
                <div>
                  <span className="text-slate-500">Inicia:</span>{' '}
                  {format(parseISO(detail.starts_at), 'PPpp')}
                </div>
                <div>
                  <span className="text-slate-500">Reservados:</span>{' '}
                  {detail.booked}/{detail.capacity}
                </div>
                {detail.location && (
                  <div>
                    <span className="text-slate-500">Ubicación:</span>{' '}
                    {detail.location}
                  </div>
                )}
                {detail.min_plan && (
                  <div>
                    <span className="text-slate-500">Plan mínimo:</span>{' '}
                    {detail.min_plan}
                  </div>
                )}
              </div>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className={BTN_SECONDARY}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCancel(detail);
                    setDetail(null);
                  }}
                  disabled={detail.status === 'cancelled'}
                  className={BTN_DANGER}
                >
                  Cancelar clase
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!cancel}
        onOpenChange={(o) => !o && setCancel(null)}
        title="Cancelar clase"
        description="Se notificará a todos los reservados por WhatsApp."
        confirmLabel="Cancelar clase"
        destructive
        onConfirm={async () => {
          if (!cancel) return;
          await cancelMut.mutateAsync(cancel.id);
          setCancel(null);
        }}
      />

      <NewClassDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={() =>
          qc.invalidateQueries({ queryKey: ['admin', 'classes'] })
        }
      />
    </div>
  );
}

/* =========================================================================
 * List tab
 * =========================================================================*/

function ClassListTable({
  classes,
  onOpen,
  onCancel,
}: {
  classes: AdminClass[];
  onOpen: (c: AdminClass) => void;
  onCancel: (c: AdminClass) => void;
}) {
  const [page, setPage] = React.useState(0);
  const [q, setQ] = React.useState('');
  const pageSize = 20;
  const filtered = React.useMemo(() => {
    if (!q.trim()) return classes;
    const n = q.trim().toLowerCase();
    return classes.filter(
      (c) =>
        c.name.toLowerCase().includes(n) ||
        c.coach_name?.toLowerCase().includes(n),
    );
  }, [classes, q]);
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const rows = filtered.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="Buscar clase o coach…"
          className={`${INPUT_CLS} max-w-xs`}
        />
        <div className="ml-auto text-xs text-slate-500">
          {total} resultados
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Clase
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Coach
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Inicia
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Capacidad
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  <td className="px-4 py-3.5 font-semibold text-slate-900">
                    {c.name}
                  </td>
                  <td className="px-4 py-3.5">{c.coach_name ?? '—'}</td>
                  <td className="px-4 py-3.5">
                    {format(parseISO(c.starts_at), 'dd/MM HH:mm')}
                  </td>
                  <td className="px-4 py-3.5">
                    {c.booked}/{c.capacity}
                  </td>
                  <td className="px-4 py-3.5">
                    {c.status === 'cancelled' ? (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200">
                        Cancelada
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        Programada
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => onOpen(c)}
                        className={BTN_SECONDARY}
                      >
                        Ver
                      </button>
                      <button
                        type="button"
                        onClick={() => onCancel(c)}
                        disabled={c.status === 'cancelled'}
                        className={BTN_SECONDARY}
                      >
                        Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-xs text-slate-500"
                  >
                    Sin clases para esta semana.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="inline-flex items-center rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>
            {page + 1} / {pages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
            className="inline-flex items-center rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
 * New class dialog
 * =========================================================================*/

function NewClassDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = React.useState({
    name: '',
    sport: 'GENERAL_FITNESS',
    trainer_id: '',
    trainer_name: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '18:00',
    duration_min: 60,
    capacity: 20,
    location: '',
    min_plan: '' as '' | 'STARTER' | 'PRO' | 'ELITE',
    repeat_weeks: 0,
  });

  React.useEffect(() => {
    if (open) {
      setForm({
        name: '',
        sport: 'GENERAL_FITNESS',
        trainer_id: '',
        trainer_name: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        time: '18:00',
        duration_min: 60,
        capacity: 20,
        location: '',
        min_plan: '',
        repeat_weeks: 0,
      });
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: () => {
      const starts_at = new Date(`${form.date}T${form.time}:00`).toISOString();
      return adminApi.createClass({
        name: form.name,
        sport: form.sport,
        trainer_id: form.trainer_id,
        starts_at,
        duration_min: Number(form.duration_min) || 60,
        capacity: Number(form.capacity) || 1,
        location: form.location || 'Gimnasio',
        min_plan: form.min_plan ? form.min_plan : null,
        repeat_weeks: Number(form.repeat_weeks) || 0,
      });
    },
    onSuccess: (r: { created_count?: number } | void) => {
      const n = (r as any)?.created_count ?? 1;
      toast.success(n > 1 ? `${n} clases creadas` : 'Clase creada');
      onCreated();
      onOpenChange(false);
    },
    onError: () => toast.error('No se pudo crear'),
  });

  const disabled =
    !form.name ||
    !form.trainer_id ||
    !form.location ||
    !form.date ||
    !form.time;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-white border-slate-200 text-slate-900">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Nueva clase</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Nombre
            </label>
            <input
              placeholder="Ej. Boxeo intermedio"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={INPUT_CLS}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Deporte
              </label>
              <select
                value={form.sport}
                onChange={(e) => setForm({ ...form, sport: e.target.value })}
                className={INPUT_CLS}
              >
                {SPORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Trainer
              </label>
              <TrainerAutocomplete
                value={form.trainer_id || null}
                valueLabel={form.trainer_name || null}
                onSelect={(u: TrainerOption | null) =>
                  setForm({
                    ...form,
                    trainer_id: u?.id ?? '',
                    trainer_name: u?.name ?? '',
                  })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Fecha inicio
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Hora
              </label>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className={INPUT_CLS}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Duración (min)
              </label>
              <input
                type="number"
                min={10}
                max={300}
                value={form.duration_min}
                onChange={(e) =>
                  setForm({
                    ...form,
                    duration_min: Number(e.target.value) || 0,
                  })
                }
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Capacidad
              </label>
              <input
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) =>
                  setForm({ ...form, capacity: Number(e.target.value) || 0 })
                }
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Plan mínimo
              </label>
              <select
                value={form.min_plan}
                onChange={(e) =>
                  setForm({
                    ...form,
                    min_plan: e.target.value as typeof form.min_plan,
                  })
                }
                className={INPUT_CLS}
              >
                <option value="">—</option>
                <option value="STARTER">Básico</option>
                <option value="PRO">Pro</option>
                <option value="ELITE">Élite</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Ubicación
            </label>
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Ej. Sala 1"
              className={INPUT_CLS}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Repetir semanalmente (0 = solo esta fecha; máx. 52)
            </label>
            <input
              type="number"
              min={0}
              max={52}
              value={form.repeat_weeks}
              onChange={(e) =>
                setForm({
                  ...form,
                  repeat_weeks: Math.max(
                    0,
                    Math.min(52, Number(e.target.value) || 0),
                  ),
                })
              }
              className={INPUT_CLS}
            />
          </div>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={BTN_SECONDARY}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || disabled}
            className={BTN_PRIMARY}
          >
            {mut.isPending ? 'Creando…' : 'Crear'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
