'use client';

import * as React from 'react';
import {
  addDays,
  addMinutes,
  format,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
  startOfWeek,
  subDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Users,
  X,
} from 'lucide-react';
import { trainerApi, type TrainerClass } from '@/lib/trainer-api';

function weekStart(d: Date) {
  return startOfWeek(d, { weekStartsOn: 1 });
}

export default function TrainerClassesPage() {
  const qc = useQueryClient();
  const [anchor, setAnchor] = React.useState<Date>(() =>
    weekStart(startOfDay(new Date())),
  );
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const from = anchor.toISOString();
  const to = addDays(anchor, 7).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ['trainer', 'classes', from, to],
    queryFn: () => trainerApi.classes({ from, to }),
  });

  const history = useQuery({
    queryKey: ['trainer', 'classes-history'],
    queryFn: () =>
      trainerApi.classes({
        from: subDays(new Date(), 60).toISOString(),
        to: new Date().toISOString(),
      }),
  });

  const classes = data ?? [];

  const days = React.useMemo(() => {
    const arr: { date: Date; classes: TrainerClass[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(anchor, i);
      arr.push({
        date,
        classes: classes.filter((c) =>
          isSameDay(parseISO(c.starts_at), date),
        ),
      });
    }
    return arr;
  }, [anchor, classes]);

  const pastClasses = React.useMemo(() => {
    const all = history.data ?? [];
    return all
      .filter((c) => isBefore(parseISO(c.starts_at), new Date()))
      .sort(
        (a, b) =>
          parseISO(b.starts_at).getTime() - parseISO(a.starts_at).getTime(),
      )
      .slice(0, 20);
  }, [history.data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Mis clases</h1>
          <p className="text-sm text-slate-600">
            Semana del{' '}
            <strong>{format(anchor, 'dd MMM', { locale: es })}</strong> al{' '}
            <strong>
              {format(addDays(anchor, 6), 'dd MMM yyyy', { locale: es })}
            </strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAnchor((a) => subDays(a, 7))}
            className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Semana anterior
          </button>
          <button
            type="button"
            onClick={() => setAnchor(weekStart(new Date()))}
            className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setAnchor((a) => addDays(a, 7))}
            className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="text-sm text-slate-500">Cargando agenda…</div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
        {days.map((d) => (
          <div
            key={d.date.toISOString()}
            className="min-h-[160px] rounded-2xl border border-slate-200 bg-white p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500">
                  {format(d.date, 'EEE', { locale: es })}
                </div>
                <div className="text-sm font-bold text-slate-900">
                  {format(d.date, 'dd')}
                </div>
              </div>
              {isSameDay(d.date, new Date()) && (
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                  Hoy
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {d.classes.length === 0 ? (
                <div className="text-[11px] text-slate-400">Sin clases</div>
              ) : (
                d.classes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className="w-full rounded-lg border border-blue-200 bg-blue-50 p-2 text-left transition hover:border-blue-300 hover:bg-blue-100"
                  >
                    <div className="text-[11px] font-semibold text-blue-700">
                      {format(parseISO(c.starts_at), 'HH:mm')} · {c.duration_min}m
                    </div>
                    <div className="truncate text-xs font-semibold text-slate-900">
                      {c.name}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                      <Users className="h-3 w-3" />
                      {c.booked}/{c.capacity}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* History */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-900">
          Historial
        </h2>
        {pastClasses.length === 0 ? (
          <div className="text-xs text-slate-500">Sin clases pasadas.</div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {pastClasses.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">
                    {c.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {format(parseISO(c.starts_at), 'EEE dd MMM · HH:mm', {
                      locale: es,
                    })}
                    {c.location ? ` · ${c.location}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className="text-[11px] font-semibold text-blue-600 hover:underline"
                >
                  Ver asistencia
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ClassDialog
        classId={selectedId}
        onClose={() => setSelectedId(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['trainer', 'classes'] });
          qc.invalidateQueries({
            queryKey: ['trainer', 'class-detail', selectedId],
          });
        }}
      />
    </div>
  );
}

/* ─── Detail modal with attendance marking ──────────────────────── */

function ClassDialog({
  classId,
  onClose,
  onSaved,
}: {
  classId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const detail = useQuery({
    queryKey: ['trainer', 'class-detail', classId],
    queryFn: () => trainerApi.classDetail(classId as string),
    enabled: !!classId,
  });

  const [draft, setDraft] = React.useState<
    Record<string, 'ATTENDED' | 'NO_SHOW'>
  >({});

  React.useEffect(() => {
    setDraft({});
  }, [classId]);

  const save = useMutation({
    mutationFn: async () => {
      const records = Object.entries(draft).map(([booking_id, status]) => ({
        booking_id,
        status,
      }));
      if (!records.length || !classId) return { updated_count: 0 };
      return trainerApi.markAttendance(classId, records);
    },
    onSuccess: (r) => {
      toast.success(`Asistencia guardada (${r.updated_count})`);
      onSaved();
      onClose();
    },
    onError: () => toast.error('No se pudo guardar la asistencia'),
  });

  const c = detail.data;

  if (!classId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Cerrar</span>
        </button>
        <h2 className="text-lg font-semibold leading-none tracking-tight text-slate-900">
          {c?.name ?? 'Clase'}
        </h2>
        <div className="mt-4">
          {!c ? (
            <div className="text-sm text-slate-500">Cargando…</div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span>
                  {format(parseISO(c.starts_at), 'EEE dd MMM · HH:mm', {
                    locale: es,
                  })}
                </span>
                <span>
                  ·{' '}
                  {format(
                    addMinutes(parseISO(c.starts_at), c.duration_min),
                    'HH:mm',
                  )}
                </span>
                {c.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {c.location}
                  </span>
                )}
                <span>
                  <Users className="inline-block h-3 w-3" /> {c.booked}/
                  {c.capacity}
                </span>
              </div>

              <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50">
                {c.bookings && c.bookings.length > 0 ? (
                  <ul className="divide-y divide-slate-200">
                    {c.bookings.map((b) => {
                      const current = draft[b.id] ?? b.status;
                      return (
                        <li
                          key={b.id}
                          className="flex items-center justify-between gap-3 p-3"
                        >
                          <div>
                            <div className="text-sm font-medium text-slate-900">
                              {b.user_name}
                            </div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-500">
                              {b.status}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setDraft((d) => ({ ...d, [b.id]: 'ATTENDED' }))
                              }
                              className={
                                current === 'ATTENDED'
                                  ? 'inline-flex min-h-[36px] items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700'
                                  : 'inline-flex min-h-[36px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50'
                              }
                            >
                              Asistió
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDraft((d) => ({ ...d, [b.id]: 'NO_SHOW' }))
                              }
                              className={
                                current === 'NO_SHOW'
                                  ? 'inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700'
                                  : 'inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50'
                              }
                            >
                              <X className="h-3 w-3" />
                              No vino
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="p-4 text-sm text-slate-500">
                    Sin reservas aún.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || Object.keys(draft).length === 0}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {save.isPending ? 'Guardando…' : 'Guardar asistencia'}
          </button>
        </div>
      </div>
    </div>
  );
}
