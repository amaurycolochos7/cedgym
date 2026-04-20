'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, EyeOff, Pencil, Plus, Trash2, Users } from 'lucide-react';
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
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import {
  TrainerAutocomplete,
  type TrainerOption,
} from '@/components/admin/trainer-autocomplete';
import {
  DayHourPicker,
  type ScheduleRow,
} from '@/components/admin/day-hour-picker';
import { adminApi, type AdminCourse } from '@/lib/admin-api';

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const SPORTS: { value: string; label: string }[] = [
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

/**
 * Admin · Courses page. Lists every course with inline publish toggle,
 * edit, enrollments drawer and hard-delete. Creation and edition share
 * the same rich dialog.
 */
export default function AdminCoursesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'courses'],
    queryFn: adminApi.listCourses,
  });

  const [editing, setEditing] = React.useState<AdminCourse | null>(null);
  const [newOpen, setNewOpen] = React.useState(false);
  const [enrollmentsFor, setEnrollmentsFor] = React.useState<AdminCourse | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = React.useState<AdminCourse | null>(
    null,
  );

  const pub = useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
      adminApi.publishCourse(id, publish),
    onSuccess: () => {
      toast.success('Estado actualizado');
      qc.invalidateQueries({ queryKey: ['admin', 'courses'] });
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => adminApi.deleteCourse(id),
    onSuccess: () => {
      toast.success('Curso eliminado');
      qc.invalidateQueries({ queryKey: ['admin', 'courses'] });
    },
    onError: () => toast.error('No se pudo eliminar'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Cursos
          </h2>
          <p className="text-xs text-white/50">
            Cursos de duración fija con horarios recurrentes.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" />
          Nuevo curso
        </Button>
      </div>

      {isLoading && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/50">
          Cargando…
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(data ?? []).map((c) => (
          <CourseCard
            key={c.id}
            course={c}
            onEdit={() => setEditing(c)}
            onTogglePublish={() =>
              pub.mutate({ id: c.id, publish: !c.published })
            }
            onEnrollments={() => setEnrollmentsFor(c)}
            onDelete={() => setDeleteTarget(c)}
          />
        ))}
        {data && data.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/50 md:col-span-2 xl:col-span-3">
            No hay cursos todavía. Crea uno para empezar.
          </div>
        )}
      </div>

      <CourseDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        course={null}
        onSaved={() =>
          qc.invalidateQueries({ queryKey: ['admin', 'courses'] })
        }
      />

      <CourseDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        course={editing}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['admin', 'courses'] });
          setEditing(null);
        }}
      />

      <EnrollmentsDialog
        course={enrollmentsFor}
        onClose={() => setEnrollmentsFor(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Eliminar "${deleteTarget?.name ?? ''}"`}
        description="Esta acción es irreversible. Los inscritos no serán notificados."
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return;
          await del.mutateAsync(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

/* =========================================================================
 * Card
 * =========================================================================*/

function CourseCard({
  course: c,
  onEdit,
  onTogglePublish,
  onEnrollments,
  onDelete,
}: {
  course: AdminCourse;
  onEdit: () => void;
  onTogglePublish: () => void;
  onEnrollments: () => void;
  onDelete: () => void;
}) {
  const scheduleLabel = React.useMemo(
    () => describeSchedule(c.schedule),
    [c.schedule],
  );

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-white">{c.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {c.sport && <Badge variant="brand">{c.sport}</Badge>}
            <Badge variant={c.published ? 'success' : 'muted'}>
              {c.published ? 'Publicado' : 'Borrador'}
            </Badge>
            {c.trainer_name && (
              <span className="text-[11px] text-white/50">
                · {c.trainer_name}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Info label="Capacidad" value={String(c.capacity)} />
        <Info label="Inscritos" value={String(c.enrolled_count ?? 0)} />
        <Info label="Precio" value={`$${c.price_mxn}`} />
      </div>

      {scheduleLabel && (
        <div className="mt-3 text-[11px] text-white/50">{scheduleLabel}</div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <Button variant="ghost" size="sm" onClick={onEnrollments}>
          <Users className="h-3 w-3" />
          Inscritos
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="h-3 w-3" />
          Editar
        </Button>
        <Button
          variant={c.published ? 'ghost' : 'primary'}
          size="sm"
          onClick={onTogglePublish}
        >
          {c.published ? (
            <>
              <EyeOff className="h-3 w-3" />
              Despublicar
            </>
          ) : (
            <>
              <Eye className="h-3 w-3" />
              Publicar
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="ml-auto text-red-300 hover:text-red-200"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] p-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

/* =========================================================================
 * Create/Edit dialog
 * =========================================================================*/

interface CourseForm {
  name: string;
  description: string;
  sport: string;
  trainer_id: string;
  trainer_name: string;
  capacity: number;
  price_mxn: number;
  starts_at: string;
  ends_at: string;
  schedule: ScheduleRow[];
  publish_now: boolean;
}

function initialForm(): CourseForm {
  return {
    name: '',
    description: '',
    sport: 'GENERAL_FITNESS',
    trainer_id: '',
    trainer_name: '',
    capacity: 20,
    price_mxn: 0,
    starts_at: '',
    ends_at: '',
    schedule: [],
    publish_now: false,
  };
}

function courseToForm(c: AdminCourse): CourseForm {
  return {
    name: c.name,
    description: c.description ?? '',
    sport: c.sport ?? 'GENERAL_FITNESS',
    trainer_id: c.trainer_id ?? '',
    trainer_name: c.trainer_name ?? '',
    capacity: c.capacity ?? 20,
    price_mxn: c.price_mxn ?? 0,
    starts_at: c.starts_at ? c.starts_at.slice(0, 10) : '',
    ends_at: c.ends_at ? c.ends_at.slice(0, 10) : '',
    schedule: scheduleToRows(c.schedule),
    publish_now: c.published,
  };
}

function CourseDialog({
  open,
  onOpenChange,
  course,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  course: AdminCourse | null;
  onSaved: () => void;
}) {
  const isEdit = Boolean(course);
  const [form, setForm] = React.useState<CourseForm>(() =>
    course ? courseToForm(course) : initialForm(),
  );

  // Reset form when the dialog (re-)opens.
  React.useEffect(() => {
    if (open) {
      setForm(course ? courseToForm(course) : initialForm());
    }
  }, [open, course]);

  const save = useMutation({
    mutationFn: async () => {
      const scheduleJson = rowsToSchedule(form.schedule);
      const payload = {
        name: form.name,
        description: form.description || undefined,
        sport: form.sport,
        trainer_id: form.trainer_id,
        capacity: Number(form.capacity) || 0,
        price_mxn: Number(form.price_mxn) || 0,
        starts_at: form.starts_at
          ? new Date(form.starts_at).toISOString()
          : new Date().toISOString(),
        ends_at: form.ends_at
          ? new Date(form.ends_at).toISOString()
          : new Date().toISOString(),
        schedule: scheduleJson,
      };
      let saved: AdminCourse;
      if (isEdit && course) {
        saved = await adminApi.updateCourse(course.id, payload);
      } else {
        saved = await adminApi.createCourse(payload);
      }
      // Publish toggle is a separate endpoint.
      const shouldPublish = form.publish_now;
      if (saved?.id && shouldPublish !== !!saved.published) {
        await adminApi.publishCourse(saved.id, shouldPublish);
      }
      return saved;
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Curso actualizado' : 'Curso creado');
      onSaved();
      onOpenChange(false);
    },
    onError: () => toast.error('No se pudo guardar el curso'),
  });

  const disabled =
    !form.name ||
    !form.trainer_id ||
    !form.sport ||
    !form.starts_at ||
    !form.ends_at ||
    form.schedule.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar curso' : 'Nuevo curso'}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-white/60">Nombre</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej. Bootcamp de Boxeo Otoño"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-white/60">
                Descripción
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-input/60 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-brand-orange/60 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                placeholder="Qué aprenderán, requisitos, equipo necesario…"
              />
            </div>

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
                Precio (MXN)
              </label>
              <Input
                type="number"
                min={0}
                value={form.price_mxn}
                onChange={(e) =>
                  setForm({ ...form, price_mxn: Number(e.target.value) || 0 })
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-white/60">
                Fecha inicio
              </label>
              <Input
                type="date"
                value={form.starts_at}
                onChange={(e) =>
                  setForm({ ...form, starts_at: e.target.value })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">
                Fecha fin
              </label>
              <Input
                type="date"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">
              Horarios semanales
            </label>
            <DayHourPicker
              value={form.schedule}
              onChange={(rows) => setForm({ ...form, schedule: rows })}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm text-white">
            <input
              type="checkbox"
              checked={form.publish_now}
              onChange={(e) =>
                setForm({ ...form, publish_now: e.target.checked })
              }
              className="accent-brand-orange"
            />
            Publicar inmediatamente
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={disabled}
          >
            {isEdit ? 'Guardar cambios' : 'Crear curso'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
 * Enrollments dialog
 * =========================================================================*/

function EnrollmentsDialog({
  course,
  onClose,
}: {
  course: AdminCourse | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'course-enrollments', course?.id],
    queryFn: () => adminApi.courseEnrollments(course!.id),
    enabled: !!course,
  });

  return (
    <Dialog open={!!course} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Inscritos — {course?.name}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading && (
            <div className="p-4 text-sm text-white/50">Cargando…</div>
          )}
          {!isLoading && (!data || data.total === 0) && (
            <div className="p-4 text-sm text-white/50">Aún sin inscritos.</div>
          )}
          {!isLoading && data && data.total > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-white/40">
                <tr>
                  <th className="py-2">Nombre</th>
                  <th>Email</th>
                  <th>Teléfono</th>
                  <th className="text-right">Pagado</th>
                  <th className="text-right">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {data.enrollments.map((e) => (
                  <tr
                    key={e.payment_id}
                    className="border-t border-white/5 text-white/80"
                  >
                    <td className="py-2">
                      {e.user.full_name ?? e.user.name ?? '—'}
                    </td>
                    <td>{e.user.email ?? '—'}</td>
                    <td>{e.user.phone ?? '—'}</td>
                    <td className="text-right">${e.amount_mxn}</td>
                    <td className="text-right">
                      {e.paid_at
                        ? new Date(e.paid_at).toLocaleDateString('es-MX')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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

/* =========================================================================
 * Schedule helpers
 * =========================================================================*/

// Back-compat read: accept either the new `{rows: [...]}` shape or the
// legacy `{days:[], hour:"HH:mm", duration_min:60}` shape.
function scheduleToRows(
  schedule: AdminCourse['schedule'] | undefined,
): ScheduleRow[] {
  if (!schedule) return [];
  const s: any = schedule;
  if (Array.isArray(s?.rows)) {
    return s.rows.map((r: any) => ({
      day: Number(r.day) || 0,
      hour: String(r.hour || '18:00'),
      duration_min: Number(r.duration_min) || 60,
    }));
  }
  if (Array.isArray(s?.days)) {
    const hour = s.hour || '18:00';
    const duration = Number(s.duration_min) || 60;
    return s.days.map((d: number) => ({
      day: d,
      hour,
      duration_min: duration,
    }));
  }
  return [];
}

function rowsToSchedule(rows: ScheduleRow[]) {
  // We write both shapes so the public `/courses` route (which still
  // reads legacy `{days, hour, duration_min}`) keeps working for the
  // simple case where all rows share hour + duration.
  const hours = new Set(rows.map((r) => r.hour));
  const durations = new Set(rows.map((r) => r.duration_min));
  const simple = hours.size === 1 && durations.size === 1;
  return {
    rows,
    ...(simple && rows.length > 0
      ? {
          days: rows.map((r) => r.day),
          hour: [...hours][0],
          duration_min: [...durations][0],
        }
      : {}),
  };
}

function describeSchedule(schedule: AdminCourse['schedule'] | undefined) {
  const rows = scheduleToRows(schedule);
  if (rows.length === 0) return '';
  // Group rows by hour+duration to keep it short.
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    const key = `${r.hour} · ${r.duration_min} min`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r.day);
  }
  return [...groups.entries()]
    .map(
      ([key, days]) =>
        `${days.map((d) => DAY_LABELS[d] ?? d).join(', ')} · ${key}`,
    )
    .join(' / ');
}
