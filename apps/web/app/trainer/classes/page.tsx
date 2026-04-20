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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
          <h1 className="text-2xl font-bold uppercase tracking-widest text-white">
            Mis clases
          </h1>
          <p className="text-sm text-white/50">
            Semana del{' '}
            <strong>{format(anchor, 'dd MMM', { locale: es })}</strong> al{' '}
            <strong>
              {format(addDays(anchor, 6), "dd MMM yyyy", { locale: es })}
            </strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAnchor((a) => subDays(a, 7))}
          >
            <ChevronLeft className="h-4 w-4" />
            Semana anterior
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setAnchor(weekStart(new Date()))}
          >
            Hoy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAnchor((a) => addDays(a, 7))}
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="text-sm text-white/50">Cargando agenda…</div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
        {days.map((d) => (
          <div
            key={d.date.toISOString()}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 min-h-[160px]"
          >
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/50">
                  {format(d.date, 'EEE', { locale: es })}
                </div>
                <div className="text-sm font-bold text-white">
                  {format(d.date, 'dd')}
                </div>
              </div>
              {isSameDay(d.date, new Date()) && (
                <Badge variant="brand">Hoy</Badge>
              )}
            </div>
            <div className="space-y-1.5">
              {d.classes.length === 0 ? (
                <div className="text-[11px] text-white/30">Sin clases</div>
              ) : (
                d.classes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className="w-full rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-2 text-left transition hover:bg-brand-orange/20"
                  >
                    <div className="text-[11px] font-semibold text-brand-orange">
                      {format(parseISO(c.starts_at), 'HH:mm')} · {c.duration_min}m
                    </div>
                    <div className="truncate text-xs font-semibold text-white">
                      {c.name}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-white/60">
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
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-white">
          Historial
        </h2>
        {pastClasses.length === 0 ? (
          <div className="text-xs text-white/40">Sin clases pasadas.</div>
        ) : (
          <ul className="divide-y divide-white/5">
            {pastClasses.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-white">
                    {c.name}
                  </div>
                  <div className="text-[11px] text-white/50">
                    {format(parseISO(c.starts_at), "EEE dd MMM · HH:mm", {
                      locale: es,
                    })}
                    {c.location ? ` · ${c.location}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className="text-[11px] font-semibold text-brand-orange hover:underline"
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

/* ─── Detail dialog with attendance marking ──────────────────────── */

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

  return (
    <Dialog open={!!classId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{c?.name ?? 'Clase'}</DialogTitle>
        </DialogHeader>
        {!c ? (
          <div className="text-sm text-white/50">Cargando…</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
              <span>
                {format(parseISO(c.starts_at), "EEE dd MMM · HH:mm", {
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

            <div className="max-h-96 overflow-y-auto rounded-xl border border-white/5 bg-white/[0.02]">
              {c.bookings && c.bookings.length > 0 ? (
                <ul className="divide-y divide-white/5">
                  {c.bookings.map((b) => {
                    const current = draft[b.id] ?? b.status;
                    return (
                      <li
                        key={b.id}
                        className="flex items-center justify-between gap-3 p-3"
                      >
                        <div>
                          <div className="text-sm font-medium text-white">
                            {b.user_name}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-white/50">
                            {b.status}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant={
                              current === 'ATTENDED' ? 'primary' : 'ghost'
                            }
                            onClick={() =>
                              setDraft((d) => ({ ...d, [b.id]: 'ATTENDED' }))
                            }
                          >
                            Asistió
                          </Button>
                          <Button
                            size="sm"
                            variant={
                              current === 'NO_SHOW' ? 'destructive' : 'ghost'
                            }
                            onClick={() =>
                              setDraft((d) => ({ ...d, [b.id]: 'NO_SHOW' }))
                            }
                          >
                            <X className="h-3 w-3" />
                            No vino
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="p-4 text-sm text-white/40">
                  Sin reservas aún.
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={Object.keys(draft).length === 0}
          >
            Guardar asistencia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
