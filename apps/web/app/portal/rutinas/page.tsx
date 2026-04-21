'use client';

/* -------------------------------------------------------------------------
 * Member routine page — AI-generated.
 *
 * Two modes:
 *   1. No active routine → inline "generate your routine" form.
 *   2. Active routine    → day tabs with expandable exercise cards.
 *
 * Backend:
 *   GET  /ai/routines/me          → { routine: Routine | null }
 *   POST /ai/routines/generate    → { routine, ai: {...} }  (201)
 *
 * `GET /ai/routines/me` returns 200 with `routine: null` when the user has
 * no active routine (we verified in the API source), so we gate on that and
 * NOT on a 404. A 403 from missing membership still flows through to the
 * error block below.
 * -------------------------------------------------------------------------*/

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  ExternalLink,
  Lightbulb,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
  Timer,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, normalizeError } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────────
type Location = 'GYM' | 'HOME' | 'BOTH';

interface RoutineExercise {
  id?: string;
  exercise_name_snapshot?: string;
  exercise_name?: string;
  video_url?: string | null;
  sets: number;
  reps: string;
  rest_sec: number;
  notes?: string | null;
  exercise?: {
    id: string;
    name?: string;
    description?: string | null;
    thumbnail_url?: string | null;
  } | null;
}

interface RoutineDay {
  id?: string;
  day_of_week: number;
  title: string;
  notes?: string | null;
  exercises: RoutineExercise[];
}

interface Routine {
  id: string;
  name: string;
  goal?: string;
  location?: Location;
  days_per_week: number;
  is_active: boolean;
  started_at?: string | null;
  days: RoutineDay[];
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Extract a YouTube video id from a plain watch/short URL so we can embed
 * it. Returns null for search URLs (`/results?search_query=…`) or anything
 * else — the UI falls back to an "open in YouTube" link in that case.
 */
function getYouTubeEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  if (!m) return null;
  return `https://www.youtube.com/embed/${m[1]}`;
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function formatStartedAt(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

// ═════════════════════════════════════════════════════════════════════════
export default function PortalRutinasPage() {
  const qc = useQueryClient();

  // Active routine — the source of truth for which case we render.
  const routineQ = useQuery<{ routine: Routine | null }>({
    queryKey: ['routines', 'me'],
    queryFn: async () => (await api.get('/ai/routines/me')).data,
    retry: false,
  });

  // Pull `me` to check fitness_profile presence (blocks Generate CTA).
  const meQ = useQuery<{ user: { fitness_profile?: unknown } }>({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  if (routineQ.isLoading) {
    return (
      <div className="flex items-center gap-3 text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando tu rutina…
      </div>
    );
  }

  // Membership-gated → backend throws 403. Surface a clean upsell block.
  const err = routineQ.error as { status?: number; message?: string } | null;
  if (err && err.status === 403) {
    return <MembershipBlock />;
  }

  const routine = routineQ.data?.routine ?? null;
  const hasFitnessProfile = Boolean(meQ.data?.user?.fitness_profile);

  if (!routine) {
    return (
      <GenerateRoutineCard
        hasFitnessProfile={hasFitnessProfile}
        onGenerated={() => qc.invalidateQueries({ queryKey: ['routines', 'me'] })}
      />
    );
  }

  return (
    <ActiveRoutineView
      routine={routine}
      hasFitnessProfile={hasFitnessProfile}
      onRegenerated={() => qc.invalidateQueries({ queryKey: ['routines', 'me'] })}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Case 1: no active routine → generate form
// ═════════════════════════════════════════════════════════════════════════

interface GenerateFormState {
  location: Location;
  days_per_week: number;
  session_duration_min: number;
}

const DEFAULT_FORM: GenerateFormState = {
  location: 'GYM',
  days_per_week: 4,
  session_duration_min: 60,
};

function GenerateRoutineCard({
  hasFitnessProfile,
  onGenerated,
}: {
  hasFitnessProfile: boolean;
  onGenerated: () => void;
}) {
  const [form, setForm] = useState<GenerateFormState>(DEFAULT_FORM);

  const mut = useMutation({
    mutationFn: async (body: GenerateFormState) =>
      (await api.post('/ai/routines/generate', body)).data,
    onSuccess: () => {
      toast.success('Tu rutina está lista.');
      onGenerated();
    },
    onError: (e) => {
      const n = normalizeError(e);
      if (n.status === 429) {
        toast.error('Demasiadas generaciones. Espera un momento e intenta de nuevo.');
      } else if (n.status === 403) {
        toast.error('Necesitas una membresía activa para generar rutinas.');
      } else {
        toast.error(n.message || 'No pudimos generar tu rutina. Intenta de nuevo.');
      }
    },
  });

  const disabled = !hasFitnessProfile || mut.isPending;

  return (
    <div className="space-y-6">
      <section className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-6 sm:p-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <Sparkles className="w-5 h-5" />
          </span>
          <span className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">
            Rutina personalizada
          </span>
        </div>
        <h1 className="font-display text-3xl sm:text-5xl leading-tight text-slate-900">
          GENERA TU RUTINA CON IA
        </h1>
        <p className="text-slate-600 mt-3 max-w-xl">
          Adaptada a tu objetivo, nivel y equipo disponible. Lista en 30 segundos.
        </p>

        {!hasFitnessProfile && (
          <div className="mt-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              Completa tu perfil fitness primero para que la IA pueda adaptar la
              rutina a tu nivel y objetivo.{' '}
              <Link
                href="/portal/perfil"
                className="underline decoration-amber-400 font-semibold hover:text-amber-700"
              >
                Ir a mi perfil →
              </Link>
            </div>
          </div>
        )}

        {/* ── Form ─────────────────────────────────────────────────── */}
        <div className="mt-8 space-y-6">
          <FieldBlock label="¿Dónde entrenas?">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {(['GYM', 'HOME', 'BOTH'] as Location[]).map((loc) => (
                <RadioCard
                  key={loc}
                  active={form.location === loc}
                  onClick={() => setForm((f) => ({ ...f, location: loc }))}
                  label={
                    loc === 'GYM' ? 'Gym' : loc === 'HOME' ? 'Casa' : 'Ambos'
                  }
                  hint={
                    loc === 'GYM'
                      ? 'Máquinas + pesos'
                      : loc === 'HOME'
                      ? 'Mínimo equipo'
                      : 'Alterna'
                  }
                />
              ))}
            </div>
          </FieldBlock>

          <FieldBlock label="Días por semana">
            <Segmented
              options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))}
              value={form.days_per_week}
              onChange={(v) => setForm((f) => ({ ...f, days_per_week: v as number }))}
            />
          </FieldBlock>

          <FieldBlock label="Duración por sesión">
            <Segmented
              options={[
                { value: 45, label: '45 min' },
                { value: 60, label: '60 min' },
                { value: 90, label: '90 min' },
              ]}
              value={form.session_duration_min}
              onChange={(v) =>
                setForm((f) => ({ ...f, session_duration_min: v as number }))
              }
            />
          </FieldBlock>

          <button
            type="button"
            disabled={disabled}
            onClick={() => mut.mutate(form)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold transition shadow-sm"
          >
            {mut.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generando tu rutina… ~20 segundos
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generar mi rutina con IA
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Case 2: active routine view
// ═════════════════════════════════════════════════════════════════════════

function ActiveRoutineView({
  routine,
  hasFitnessProfile,
  onRegenerated,
}: {
  routine: Routine;
  hasFitnessProfile: boolean;
  onRegenerated: () => void;
}) {
  // Sort days by day_of_week so tabs come out in weekday order.
  const sortedDays = useMemo(
    () => [...routine.days].sort((a, b) => a.day_of_week - b.day_of_week),
    [routine.days],
  );
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [regenOpen, setRegenOpen] = useState(false);

  const activeDay = sortedDays[activeDayIdx];

  return (
    <div className="space-y-6">
      {/* ── Top bar ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl leading-tight text-slate-900">
            {routine.name}
          </h1>
          {routine.started_at && (
            <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full bg-blue-50 ring-1 ring-blue-200 text-xs text-blue-700">
              <Timer className="w-3.5 h-3.5" />
              Iniciada {formatStartedAt(routine.started_at)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setRegenOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm bg-white ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Regenerar
        </button>
      </div>

      {/* ── Day tabs ─────────────────────────────────────────── */}
      <div className="-mx-4 sm:mx-0 overflow-x-auto scrollbar-none border-b border-slate-200">
        <div className="flex gap-1 px-4 sm:px-0 min-w-max snap-x snap-mandatory">
          {sortedDays.map((day, idx) => {
            const active = idx === activeDayIdx;
            return (
              <button
                key={day.id ?? `${day.day_of_week}-${idx}`}
                type="button"
                onClick={() => setActiveDayIdx(idx)}
                className={`snap-start shrink-0 px-4 py-2.5 text-sm font-medium transition border-b-2 ${
                  active
                    ? 'text-blue-700 border-blue-600'
                    : 'text-slate-500 hover:text-slate-700 border-transparent'
                }`}
              >
                {DAY_LABELS[day.day_of_week] ?? `D${day.day_of_week + 1}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Day content ─────────────────────────────────────── */}
      {activeDay && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-xl sm:text-2xl text-slate-900">{activeDay.title}</h2>
            {activeDay.notes && (
              <p className="italic text-slate-500 text-sm mt-1">{activeDay.notes}</p>
            )}
          </div>

          <div className="space-y-3">
            {activeDay.exercises.map((ex, i) => (
              <ExerciseCard
                key={ex.id ?? `${activeDay.day_of_week}-${i}`}
                routineId={routine.id}
                exerciseKey={`${activeDay.day_of_week}-${i}`}
                exercise={ex}
              />
            ))}
          </div>
        </div>
      )}

      {regenOpen && (
        <RegenerateModal
          currentRoutine={routine}
          hasFitnessProfile={hasFitnessProfile}
          onClose={() => setRegenOpen(false)}
          onDone={() => {
            setRegenOpen(false);
            onRegenerated();
          }}
        />
      )}
    </div>
  );
}

// ── Exercise card ────────────────────────────────────────────────────────

function ExerciseCard({
  routineId,
  exerciseKey,
  exercise,
}: {
  routineId: string;
  exerciseKey: string;
  exercise: RoutineExercise;
}) {
  const [open, setOpen] = useState(false);
  const lsKey = `cedgym-routine-done-${routineId}-${exerciseKey}`;

  // Local-only "done" state. Intentional: per spec we don't persist to
  // the API. Re-reads on mount from localStorage so the check survives
  // a reload but resets next week when a new routine is generated.
  const [done, setDone] = useState(false);
  useMemo(() => {
    if (typeof window === 'undefined') return;
    try {
      setDone(window.localStorage.getItem(lsKey) === '1');
    } catch {
      /* private mode / quota — silently ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey]);

  const toggleDone = () => {
    const next = !done;
    setDone(next);
    try {
      if (next) window.localStorage.setItem(lsKey, '1');
      else window.localStorage.removeItem(lsKey);
    } catch {
      /* ignore */
    }
  };

  const name = exercise.exercise_name_snapshot ?? exercise.exercise_name ?? exercise.exercise?.name ?? 'Ejercicio';
  const embedUrl = getYouTubeEmbedUrl(exercise.video_url);
  const hasSearchUrl =
    !embedUrl && !!exercise.video_url && /\/results\?search_query=/.test(exercise.video_url);

  return (
    <div
      className={`bg-white ring-1 rounded-2xl overflow-hidden transition shadow-sm hover:shadow-md ${
        done ? 'ring-emerald-300' : 'ring-slate-200'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-slate-400 shrink-0" />
            <h3 className="font-semibold text-slate-900 truncate">{name}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-500">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 ring-1 ring-blue-200 font-mono tabular-nums">
              {exercise.sets} × {exercise.reps}
            </span>
            <span className="inline-flex items-center gap-1">
              <Timer className="w-3 h-3" />
              {exercise.rest_sec}s descanso
            </span>
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-4 border-t border-slate-200 pt-4">
          {embedUrl ? (
            <div className="relative w-full aspect-video rounded-xl overflow-hidden ring-1 ring-slate-200 bg-black">
              <iframe
                src={embedUrl}
                title={name}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
          ) : exercise.video_url ? (
            <a
              href={exercise.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 underline underline-offset-4 font-medium"
            >
              {hasSearchUrl ? 'Ver video en YouTube' : 'Abrir video'}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : null}

          {exercise.exercise?.description && (
            <p className="text-sm text-slate-700 leading-relaxed">
              {exercise.exercise.description}
            </p>
          )}

          {exercise.notes && (
            <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3">
              <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="italic">{exercise.notes}</span>
            </div>
          )}

          <button
            type="button"
            onClick={toggleDone}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition ring-1 ${
              done
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-300'
                : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
            }`}
          >
            {done ? '✓ Hecho' : 'Marcar como hecho'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Regenerate modal ─────────────────────────────────────────────────────

function RegenerateModal({
  currentRoutine,
  hasFitnessProfile,
  onClose,
  onDone,
}: {
  currentRoutine: Routine;
  hasFitnessProfile: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<GenerateFormState>({
    location: (currentRoutine.location as Location) ?? 'GYM',
    days_per_week: currentRoutine.days_per_week ?? 4,
    session_duration_min: 60,
  });

  const mut = useMutation({
    mutationFn: async (body: GenerateFormState) =>
      (await api.post('/ai/routines/generate', body)).data,
    onSuccess: () => {
      toast.success('Nueva rutina generada.');
      onDone();
    },
    onError: (e) => {
      const n = normalizeError(e);
      if (n.status === 429) {
        toast.error('Demasiadas generaciones. Espera un momento e intenta de nuevo.');
      } else {
        toast.error(n.message || 'No pudimos regenerar. Intenta de nuevo.');
      }
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white ring-1 ring-slate-200 shadow-xl rounded-t-2xl sm:rounded-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl text-slate-900">REGENERAR RUTINA</h2>
            <p className="text-sm text-slate-500 mt-1">
              Esto reemplaza tu rutina activa. La anterior queda en historial.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 text-sm"
          >
            Cerrar
          </button>
        </div>

        {!hasFitnessProfile && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              Completa tu perfil fitness primero.{' '}
              <Link href="/portal/perfil" className="underline font-semibold">
                Ir a mi perfil →
              </Link>
            </div>
          </div>
        )}

        <FieldBlock label="¿Dónde?">
          <div className="grid grid-cols-3 gap-2">
            {(['GYM', 'HOME', 'BOTH'] as Location[]).map((loc) => (
              <RadioCard
                key={loc}
                active={form.location === loc}
                onClick={() => setForm((f) => ({ ...f, location: loc }))}
                label={loc === 'GYM' ? 'Gym' : loc === 'HOME' ? 'Casa' : 'Ambos'}
              />
            ))}
          </div>
        </FieldBlock>

        <FieldBlock label="Días">
          <Segmented
            options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))}
            value={form.days_per_week}
            onChange={(v) => setForm((f) => ({ ...f, days_per_week: v as number }))}
          />
        </FieldBlock>

        <FieldBlock label="Duración">
          <Segmented
            options={[
              { value: 45, label: '45' },
              { value: 60, label: '60' },
              { value: 90, label: '90' },
            ]}
            value={form.session_duration_min}
            onChange={(v) =>
              setForm((f) => ({ ...f, session_duration_min: v as number }))
            }
          />
        </FieldBlock>

        <button
          type="button"
          disabled={!hasFitnessProfile || mut.isPending}
          onClick={() => mut.mutate(form)}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold transition shadow-sm"
        >
          {mut.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generando… ~20s
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Regenerar con IA
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Small UI atoms (local to this page)
// ═════════════════════════════════════════════════════════════════════════

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">{label}</div>
      {children}
    </div>
  );
}

function RadioCard({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-xl ring-1 transition ${
        active
          ? 'bg-blue-50 ring-blue-500 text-blue-900 shadow-sm'
          : 'bg-slate-50 ring-slate-200 text-slate-700 hover:bg-white hover:ring-slate-300'
      }`}
    >
      <div className="font-semibold text-sm">{label}</div>
      {hint && <div className={`text-[11px] mt-0.5 ${active ? 'text-blue-700' : 'text-slate-500'}`}>{hint}</div>}
    </button>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-slate-100 overflow-x-auto max-w-full">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 sm:px-4 py-1.5 text-sm rounded-lg transition whitespace-nowrap ${
              active
                ? 'bg-white shadow-sm text-slate-900 ring-1 ring-slate-200 font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function MembershipBlock() {
  return (
    <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-8 text-center">
      <Lock className="w-10 h-10 text-slate-400 mx-auto mb-3" />
      <h2 className="font-display text-2xl mb-2 text-slate-900">NECESITAS UNA MEMBRESÍA ACTIVA</h2>
      <p className="text-slate-600 mb-6">
        Las rutinas con IA están incluidas en todos los planes de CED·GYM.
      </p>
      <Link
        href="/portal/membership"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition shadow-sm"
      >
        Ver planes →
      </Link>
    </div>
  );
}
