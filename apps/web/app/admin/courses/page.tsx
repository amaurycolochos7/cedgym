'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, EyeOff, Pencil, Plus, Trash2, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 disabled:pointer-events-none';
const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none';

export default function AdminCoursesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'courses'],
    queryFn: adminApi.listCourses,
  });

  const [editing, setEditing] = React.useState<AdminCourse | null>(null);
  const [newOpen, setNewOpen] = React.useState(false);
  const [enrollmentsFor, setEnrollmentsFor] =
    React.useState<AdminCourse | null>(null);
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
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Cursos
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Cursos de duración fija con horarios recurrentes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className={BTN_PRIMARY}
        >
          <Plus className="h-4 w-4" />
          Nuevo curso
        </button>
      </div>

      {isLoading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
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
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
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
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-slate-900">
            {c.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {c.sport && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                {c.sport}
              </span>
            )}
            <span
              className={
                c.published
                  ? 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200'
                  : 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200'
              }
            >
              {c.published ? 'Publicado' : 'Borrador'}
            </span>
            {c.trainer_name && (
              <span className="text-[11px] text-slate-500">
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
        <div className="mt-3 text-[11px] text-slate-500">{scheduleLabel}</div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <button type="button" onClick={onEnrollments} className={BTN_SECONDARY}>
          <Users className="h-3 w-3" />
          Inscritos
        </button>
        <button type="button" onClick={onEdit} className={BTN_SECONDARY}>
          <Pencil className="h-3 w-3" />
          Editar
        </button>
        <button
          type="button"
          onClick={onTogglePublish}
          className={
            c.published
              ? BTN_SECONDARY
              : 'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700'
          }
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
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto inline-flex items-center rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">{value}</div>
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
      <DialogContent className="max-w-2xl bg-white border-slate-200 text-slate-900">
        <DialogHeader>
          <DialogTitle className="text-slate-900">
            {isEdit ? 'Editar curso' : 'Nuevo curso'}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Nombre
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej. Bootcamp de Boxeo Otoño"
                className={INPUT_CLS}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Descripción
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={3}
                className={INPUT_CLS}
                placeholder="Qué aprenderán, requisitos, equipo necesario…"
              />
            </div>

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
                Precio (MXN)
              </label>
              <input
                type="number"
                min={0}
                value={form.price_mxn}
                onChange={(e) =>
                  setForm({ ...form, price_mxn: Number(e.target.value) || 0 })
                }
                className={INPUT_CLS}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Fecha inicio
              </label>
              <input
                type="date"
                value={form.starts_at}
                onChange={(e) =>
                  setForm({ ...form, starts_at: e.target.value })
                }
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Fecha fin
              </label>
              <input
                type="date"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                className={INPUT_CLS}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Horarios semanales
            </label>
            <DayHourPicker
              value={form.schedule}
              onChange={(rows) => setForm({ ...form, schedule: rows })}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900">
            <input
              type="checkbox"
              checked={form.publish_now}
              onChange={(e) =>
                setForm({ ...form, publish_now: e.target.checked })
              }
              className="accent-blue-600"
            />
            Publicar inmediatamente
          </label>
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
            onClick={() => save.mutate()}
            disabled={save.isPending || disabled}
            className={BTN_PRIMARY}
          >
            {save.isPending
              ? 'Guardando…'
              : isEdit
              ? 'Guardar cambios'
              : 'Crear curso'}
          </button>
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
      <DialogContent className="max-w-2xl bg-white border-slate-200 text-slate-900">
        <DialogHeader>
          <DialogTitle className="text-slate-900">
            Inscritos — {course?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading && (
            <div className="p-4 text-sm text-slate-500">Cargando…</div>
          )}
          {!isLoading && (!data || data.total === 0) && (
            <div className="p-4 text-sm text-slate-500">
              Aún sin inscritos.
            </div>
          )}
          {!isLoading && data && data.total > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                <tr>
                  <th className="py-2 px-3">Nombre</th>
                  <th className="py-2 px-3">Email</th>
                  <th className="py-2 px-3">Teléfono</th>
                  <th className="py-2 px-3 text-right">Pagado</th>
                  <th className="py-2 px-3 text-right">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {data.enrollments.map((e) => (
                  <tr
                    key={e.payment_id}
                    className="border-t border-slate-200 text-slate-700"
                  >
                    <td className="py-2 px-3">
                      {e.user.full_name ?? e.user.name ?? '—'}
                    </td>
                    <td className="py-2 px-3">{e.user.email ?? '—'}</td>
                    <td className="py-2 px-3">{e.user.phone ?? '—'}</td>
                    <td className="py-2 px-3 text-right">
                      ${e.amount_mxn}
                    </td>
                    <td className="py-2 px-3 text-right">
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
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>
            Cerrar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
 * Schedule helpers
 * =========================================================================*/

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
