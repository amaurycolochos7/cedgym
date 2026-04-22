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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
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
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Clases
          </h2>
          <p className="text-xs text-white/50">
            {format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM yyyy')}
          </p>
        </div>
        <div className="ml-2 flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAnchor(subWeeks(anchor, 1))}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAnchor(new Date())}
          >
            Hoy
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAnchor(addWeeks(anchor, 1))}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
        <div className="ml-auto">
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" />
            Nueva clase
          </Button>
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
                      ? 'border-brand-orange/40 bg-brand-orange/5'
                      : 'border-white/10 bg-white/[0.02]'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-white/40">
                        {DAYS[i]}
                      </div>
                      <div className="text-lg font-bold text-white">
                        {format(d, 'd')}
                      </div>
                    </div>
                    {today && (
                      <Badge variant="brand" className="text-[9px]">
                        Hoy
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {items.length === 0 && (
                      <div className="text-[11px] text-white/30">—</div>
                    )}
                    {items.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setDetail(c)}
                        className="block w-full rounded-md border border-white/10 bg-white/[0.02] p-2 text-left text-[11px] hover:border-brand-orange/30 hover:bg-brand-orange/5"
                      >
                        <div className="font-semibold text-white">{c.name}</div>
                        <div className="text-white/50">
                          {format(parseISO(c.starts_at), 'HH:mm')} ·{' '}
                          {c.coach_name ?? '—'}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-white/60">
                            {c.booked}/{c.capacity}
                          </span>
                          {c.status === 'cancelled' && (
                            <Badge variant="danger" className="text-[9px]">
                              Cancelada
                            </Badge>
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
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm text-white/80">
                <div>
                  <span className="text-white/50">Coach:</span>{' '}
                  {detail.coach_name ?? '—'}
                </div>
                <div>
                  <span className="text-white/50">Inicia:</span>{' '}
                  {format(parseISO(detail.starts_at), 'PPpp')}
                </div>
                <div>
                  <span className="text-white/50">Reservados:</span>{' '}
                  {detail.booked}/{detail.capacity}
                </div>
                {detail.location && (
                  <div>
                    <span className="text-white/50">Ubicación:</span>{' '}
                    {detail.location}
                  </div>
                )}
                {detail.min_plan && (
                  <div>
                    <span className="text-white/50">Plan mínimo:</span>{' '}
                    {detail.min_plan}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDetail(null)}>
                  Cerrar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setCancel(detail);
                    setDetail(null);
                  }}
                  disabled={detail.status === 'cancelled'}
                >
                  Cancelar clase
                </Button>
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
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="Buscar clase o coach…"
          className="max-w-xs"
        />
        <div className="ml-auto text-xs text-white/50">
          {total} resultados
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-3 py-2">Clase</th>
              <th className="px-3 py-2">Coach</th>
              <th className="px-3 py-2">Inicia</th>
              <th className="px-3 py-2">Capacidad</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                className="border-t border-white/5 text-white/80 hover:bg-white/[0.02]"
              >
                <td className="px-3 py-2 font-semibold text-white">
                  {c.name}
                </td>
                <td className="px-3 py-2">{c.coach_name ?? '—'}</td>
                <td className="px-3 py-2">
                  {format(parseISO(c.starts_at), 'dd/MM HH:mm')}
                </td>
                <td className="px-3 py-2">
                  {c.booked}/{c.capacity}
                </td>
                <td className="px-3 py-2">
                  {c.status === 'cancelled' ? (
                    <Badge variant="danger">Cancelada</Badge>
                  ) : (
                    <Badge variant="muted">Programada</Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => onOpen(c)}>
                    Ver
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onCancel(c)}
                    disabled={c.status === 'cancelled'}
                  >
                    Cancelar
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-xs text-white/40"
                >
                  Sin clases para esta semana.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-white/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span>
            {page + 1} / {pages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
 * New class dialog — uses the admin POST /admin/classes endpoint with
 * optional weekly repetition (0 = only this date, 1-52 = repeat N weeks).
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

  // Reset when opening.
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
    !form.name || !form.trainer_id || !form.location || !form.date || !form.time;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva clase</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <div>
            <label className="mb-1 block text-xs text-white/60">Nombre</label>
            <Input
              placeholder="Ej. Boxeo intermedio"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-white/60">
                Deporte
              </label>
              <Select
                value={form.sport}
                onChange={(e) => setForm({ ...form, sport: e.target.value })}
              >
                {SPORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">
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
              <label className="mb-1 block text-xs text-white/60">
                Fecha inicio
              </label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">Hora</label>
              <Input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs text-white/60">
                Duración (min)
              </label>
              <Input
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
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">
                Capacidad
              </label>
              <Input
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) =>
                  setForm({ ...form, capacity: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">
                Plan mínimo
              </label>
              <Select
                value={form.min_plan}
                onChange={(e) =>
                  setForm({
                    ...form,
                    min_plan: e.target.value as typeof form.min_plan,
                  })
                }
              >
                <option value="">—</option>
                <option value="STARTER">Básico</option>
                <option value="PRO">Pro</option>
                <option value="ELITE">Élite</option>
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">
              Ubicación
            </label>
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Ej. Sala 1"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">
              Repetir semanalmente (0 = solo esta fecha; máx. 52)
            </label>
            <Input
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
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => mut.mutate()}
            loading={mut.isPending}
            disabled={disabled}
          >
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
