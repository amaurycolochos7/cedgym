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
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Dumbbell,
  Lightbulb,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, normalizeError } from '@/lib/api';
import { AIGenerationOverlay } from '@/components/portal/ai-generation-overlay';
import { ExerciseMedia } from '@/components/portal/exercise-media';

// ── Localization maps ────────────────────────────────────────────────────
const GOAL_LABELS: Record<string, string> = {
  WEIGHT_LOSS: 'Pérdida de grasa',
  MUSCLE_GAIN: 'Hipertrofia',
  MAINTENANCE: 'Mantenimiento',
  STRENGTH: 'Fuerza',
  ENDURANCE: 'Resistencia',
  GENERAL_FITNESS: 'Fitness general',
};

const LOCATION_LABELS: Record<string, string> = {
  GYM: 'En el gym',
  HOME: 'En casa',
  BOTH: 'Gym + casa',
};

const DAY_LABELS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// ── Types ────────────────────────────────────────────────────────────────
type Location = 'GYM' | 'HOME' | 'BOTH';
type Objective =
  | 'WEIGHT_LOSS'
  | 'MUSCLE_GAIN'
  | 'MAINTENANCE'
  | 'STRENGTH'
  | 'ENDURANCE'
  | 'GENERAL_FITNESS';

const OBJECTIVE_OPTIONS: { value: Objective; label: string; emoji: string }[] = [
  { value: 'WEIGHT_LOSS', label: 'Bajar grasa', emoji: '🔥' },
  { value: 'MUSCLE_GAIN', label: 'Ganar músculo', emoji: '💪' },
  { value: 'MAINTENANCE', label: 'Mantener', emoji: '⚖️' },
  { value: 'STRENGTH', label: 'Fuerza', emoji: '🏋️' },
  { value: 'ENDURANCE', label: 'Resistencia', emoji: '🏃' },
  { value: 'GENERAL_FITNESS', label: 'Fitness general', emoji: '✨' },
];

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

interface QuotaFeature {
  used: number;
  limit: number | null;
  allowed: boolean;
  unlimited: boolean;
}

interface AiQuota {
  plan: 'STARTER' | 'PRO' | 'ELITE' | null;
  has_active_membership: boolean;
  period_ends_at: string | null;
  days_until_renewal: number;
  routine: QuotaFeature;
  meal_plan: QuotaFeature;
}

// ── Helpers ──────────────────────────────────────────────────────────────

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

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function countTotalExercises(days: RoutineDay[]): number {
  return days.reduce((acc, d) => acc + (d.exercises?.length ?? 0), 0);
}

// Normalized "today" key so per-day progress auto-resets when the UTC
// date rolls over. We could gate per routine week, but a day-key is
// enough for the lightweight checkbox contract.
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
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

  // Pull `me` to check fitness_profile presence (blocks Generate CTA) and
  // pre-fill the objective selector with what the user already chose in their
  // wizard (so WEIGHT_LOSS actually reaches the AI instead of defaulting to
  // GENERAL_FITNESS on the backend).
  const meQ = useQuery<{ user: { fitness_profile?: { objective?: string } | null } }>({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  // AI usage quota — drives status line above the generator CTA and the
  // disabled state of the button when the user has exhausted this period.
  const quotaQ = useQuery<AiQuota>({
    queryKey: ['ai', 'quota', 'me'],
    queryFn: async () => (await api.get('/ai/quota/me')).data,
    retry: false,
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
  const fitnessProfile = meQ.data?.user?.fitness_profile ?? null;
  const hasFitnessProfile = Boolean(fitnessProfile);
  const profileObjective = (fitnessProfile?.objective ?? '') as Objective | '';

  const quota = quotaQ.data ?? null;
  const onGenOrRegen = () => {
    qc.invalidateQueries({ queryKey: ['routines', 'me'] });
    qc.invalidateQueries({ queryKey: ['ai', 'quota', 'me'] });
  };

  if (!routine) {
    return (
      <GenerateRoutineCard
        hasFitnessProfile={hasFitnessProfile}
        defaultObjective={profileObjective}
        quota={quota}
        onGenerated={onGenOrRegen}
      />
    );
  }

  return (
    <ActiveRoutineView
      routine={routine}
      hasFitnessProfile={hasFitnessProfile}
      quota={quota}
      onRegenerated={onGenOrRegen}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Case 1: no active routine → generate form
// ═════════════════════════════════════════════════════════════════════════

interface GenerateFormState {
  location: Location;
  objective: Objective;
  days_per_week: number;
  session_duration_min: number;
}

const DEFAULT_FORM: GenerateFormState = {
  location: 'GYM',
  objective: 'GENERAL_FITNESS',
  days_per_week: 4,
  session_duration_min: 60,
};

function GenerateRoutineCard({
  hasFitnessProfile,
  defaultObjective,
  quota,
  onGenerated,
}: {
  hasFitnessProfile: boolean;
  defaultObjective?: Objective | '';
  quota: AiQuota | null;
  onGenerated: () => void;
}) {
  const [form, setForm] = useState<GenerateFormState>(() => ({
    ...DEFAULT_FORM,
    objective: (defaultObjective || 'GENERAL_FITNESS') as Objective,
  }));

  const mut = useMutation({
    mutationFn: async (body: GenerateFormState) =>
      (await api.post('/ai/routines/generate', body, { timeout: 90_000 })).data,
    onSuccess: () => {
      toast.success('Tu rutina está lista.');
      onGenerated();
    },
    onError: (e) => {
      const n = normalizeError(e);
      // Quota/plan gating errors surface the backend message directly so
      // the user sees exact days-until-renewal or plan-upgrade copy.
      if (
        n.code === 'QUOTA_EXCEEDED' ||
        n.code === 'MEMBERSHIP_REQUIRED' ||
        n.code === 'FEATURE_NOT_IN_PLAN'
      ) {
        toast.error(n.message || 'No puedes generar una rutina ahora mismo.');
      } else if (n.status === 429) {
        toast.error('Demasiadas generaciones. Espera un momento e intenta de nuevo.');
      } else if (n.status === 403) {
        toast.error('Necesitas una membresía activa para generar rutinas.');
      } else {
        toast.error(n.message || 'No pudimos generar tu rutina. Intenta de nuevo.');
      }
    },
  });

  const quotaBlocks = !!quota && !quota.routine.allowed;
  const disabled = !hasFitnessProfile || mut.isPending || quotaBlocks;

  return (
    <div className="space-y-6">
      <AIGenerationOverlay open={mut.isPending} kind="routine" />
      <section className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-6 sm:p-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <Dumbbell className="w-5 h-5" />
          </span>
          <span className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">
            Rutina personalizada
          </span>
        </div>
        <h1 className="font-display text-3xl sm:text-5xl leading-tight text-slate-900">
          GENERA TU RUTINA
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
          <FieldBlock label="Objetivo">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {OBJECTIVE_OPTIONS.map((o) => {
                const active = form.objective === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, objective: o.value }))}
                    className={[
                      'flex items-center gap-2 rounded-xl ring-1 p-3 text-left transition-colors',
                      active
                        ? 'ring-blue-500 bg-blue-50 shadow-sm'
                        : 'ring-slate-200 bg-slate-50 hover:bg-white hover:ring-slate-300',
                    ].join(' ')}
                  >
                    <span className="text-xl leading-none">{o.emoji}</span>
                    <span className={['text-sm font-semibold', active ? 'text-blue-900' : 'text-slate-900'].join(' ')}>
                      {o.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </FieldBlock>

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

          <QuotaStatus quota={quota} />

          <button
            type="button"
            disabled={disabled}
            onClick={() => mut.mutate(form)}
            className={[
              'group relative w-full inline-flex items-center justify-center px-5 py-3 rounded-xl text-white font-semibold text-sm transition-all',
              disabled
                ? 'bg-slate-300 cursor-not-allowed opacity-50 shadow-none'
                : 'bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 hover:from-blue-700 hover:via-blue-700 hover:to-indigo-700 shadow-md shadow-blue-600/25 hover:shadow-lg hover:shadow-blue-600/35 active:scale-[0.99]',
            ].join(' ')}
          >
            {mut.isPending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Generando tu rutina… ~20 s
              </span>
            ) : (
              <span className="tracking-tight">Generar mi rutina</span>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

// ── Quota status line ────────────────────────────────────────────────────
// Renders above the generate CTA. Four states, matching the backend's
// `/ai/quota/me` contract: unlimited, not-in-plan (limit === 0), exhausted
// (allowed === false but limit > 0), and normal "n rutinas left".
function QuotaStatus({ quota }: { quota: AiQuota | null }) {
  if (!quota) return null;
  const r = quota.routine;

  if (r.unlimited) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Dumbbell className="w-4 h-4 text-blue-500" />
        <span>
          Rutinas ilimitadas con tu plan {quota.plan ?? ''}.
        </span>
      </div>
    );
  }

  if (r.limit === 0) {
    return (
      <div className="flex items-start gap-3 bg-amber-50 ring-1 ring-amber-200 text-amber-900 rounded-xl p-4">
        <Lock className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex-1 text-sm">
          <div className="font-semibold">
            Tu plan actual no incluye generación de rutinas
          </div>
          <Link
            href="/portal/membership"
            className="inline-flex items-center gap-1 mt-2 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition"
          >
            Ver planes →
          </Link>
        </div>
      </div>
    );
  }

  if (!r.allowed) {
    const days = quota.days_until_renewal;
    return (
      <div className="flex items-start gap-3 bg-amber-50 ring-1 ring-amber-200 text-amber-900 rounded-xl p-4">
        <Clock className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex-1 text-sm">
          <div className="font-semibold">
            Ya usaste tu rutina este periodo. Se renueva en {days} día
            {days === 1 ? '' : 's'}.
          </div>
          {r.limit !== null && (
            <div className="text-xs text-amber-800/80 mt-1">
              Uso: {r.used}/{r.limit} este periodo.
            </div>
          )}
        </div>
      </div>
    );
  }

  // Allowed with a finite limit > 0.
  if (r.limit !== null && r.limit > 0) {
    const remaining = Math.max(0, r.limit - r.used);
    return (
      <div className="text-sm text-slate-500">
        Te queda{remaining === 1 ? '' : 'n'} {remaining} rutina
        {remaining === 1 ? '' : 's'} este periodo.
      </div>
    );
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════
// Case 2: active routine view
// ═════════════════════════════════════════════════════════════════════════

function ActiveRoutineView({
  routine,
  hasFitnessProfile,
  quota,
  onRegenerated,
}: {
  routine: Routine;
  hasFitnessProfile: boolean;
  quota: AiQuota | null;
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
  const totalExercises = useMemo(() => countTotalExercises(sortedDays), [sortedDays]);

  // ── Progress tracking (localStorage, per routine+day, auto-resets on
  // date change) ───────────────────────────────────────────────────────
  const progressKey = activeDay
    ? `cedgym-routine-progress-${routine.id}-${activeDay.day_of_week}`
    : '';
  const [doneSet, setDoneSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!progressKey || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(progressKey);
      if (!raw) {
        setDoneSet(new Set());
        return;
      }
      const parsed = JSON.parse(raw) as { date?: string; keys?: string[] };
      if (parsed?.date === todayKey() && Array.isArray(parsed.keys)) {
        setDoneSet(new Set(parsed.keys));
      } else {
        // Stale day → reset.
        window.localStorage.removeItem(progressKey);
        setDoneSet(new Set());
      }
    } catch {
      setDoneSet(new Set());
    }
  }, [progressKey]);

  const toggleDone = (key: string) => {
    if (!progressKey) return;
    setDoneSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(
          progressKey,
          JSON.stringify({ date: todayKey(), keys: Array.from(next) }),
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const dayExerciseCount = activeDay?.exercises.length ?? 0;
  const dayDoneCount = activeDay
    ? activeDay.exercises.filter((_, i) => doneSet.has(`${activeDay.day_of_week}-${i}`)).length
    : 0;
  const dayProgressPct =
    dayExerciseCount > 0 ? Math.round((dayDoneCount / dayExerciseCount) * 100) : 0;

  // ── Quota-aware regenerate trigger state ─────────────────────────────
  const r = quota?.routine;
  const regenState: 'allowed' | 'locked-days' | 'unlimited' | 'no-quota' = !quota
    ? 'no-quota'
    : r?.unlimited
      ? 'unlimited'
      : r?.allowed
        ? 'allowed'
        : 'locked-days';

  const startedLabel = formatStartedAt(routine.started_at);
  const startedDays = daysSince(routine.started_at);
  const goalLabel = routine.goal ? GOAL_LABELS[routine.goal] ?? routine.goal : null;
  const locationLabel = routine.location ? LOCATION_LABELS[routine.location] ?? routine.location : null;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ─────────────────────────────────────────────────────────────
         Hero section — glass-on-blue gradient. Keeps the light palette
         of the rest of the portal but feels like a flagship screen.
         ───────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl ring-1 ring-slate-900/5 shadow-xl shadow-blue-900/10"
      >
        {/* Layered gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950" />
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 w-96 h-96 rounded-full bg-indigo-500/15 blur-3xl" />
        {/* subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative p-6 sm:p-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 backdrop-blur ring-1 ring-white/15 text-white">
              <Dumbbell className="w-4 h-4" />
            </span>
            <span className="text-[11px] uppercase tracking-[0.25em] text-white/60 font-semibold">
              Tu rutina activa
            </span>
          </div>

          <h1 className="font-display text-3xl sm:text-5xl leading-[1.05] text-white max-w-3xl">
            {routine.name}
          </h1>

          {/* Key stats row */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <HeroPill icon={<Dumbbell className="w-3.5 h-3.5" />}>
              {routine.days_per_week} días / semana
            </HeroPill>
            <HeroPill>
              {totalExercises} ejercicio{totalExercises === 1 ? '' : 's'}
            </HeroPill>
            {goalLabel && (
              <HeroPill icon={<Target className="w-3.5 h-3.5" />} accent>
                {goalLabel}
              </HeroPill>
            )}
            {locationLabel && (
              <HeroPill icon={<MapPin className="w-3.5 h-3.5" />}>
                {locationLabel}
              </HeroPill>
            )}
          </div>

          {startedLabel && (
            <div className="mt-4 text-xs text-white/50">
              {startedDays !== null && startedDays > 0
                ? `Iniciada hace ${startedDays} día${startedDays === 1 ? '' : 's'} · ${startedLabel}`
                : `Iniciada ${startedLabel}`}
            </div>
          )}

          {/* Action row */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {regenState === 'locked-days' ? (
              <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 ring-1 ring-white/10 text-sm text-white/70 backdrop-blur">
                <Lock className="w-4 h-4" />
                Próxima rutina disponible en {quota?.days_until_renewal ?? 0} día
                {(quota?.days_until_renewal ?? 0) === 1 ? '' : 's'}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setRegenOpen(true)}
                className="group inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-900 text-sm font-semibold ring-1 ring-white/80 hover:bg-blue-50 hover:ring-blue-200 shadow-sm transition-all active:scale-[0.98]"
              >
                <RefreshCw className="w-4 h-4 text-blue-600 transition-transform group-hover:rotate-180 duration-500" />
                Regenerar
                {regenState === 'unlimited' && (
                  <span className="ml-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-blue-700 font-bold">
                    · {quota?.plan ?? 'PRO'}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.section>

      {/* ─────────────────────────────────────────────────────────────
         Day navigation — pill tabs with day number anchor.
         py-3 gives the active pill's blue shadow breathing room so
         it doesn't get clipped by overflow-x-auto into a hairline.
         ───────────────────────────────────────────────────────────── */}
      <div className="pb-2">
        <div className="-mx-4 sm:mx-0 overflow-x-auto scrollbar-none">
          <div className="flex gap-2 px-4 sm:px-0 py-3 min-w-max sm:justify-center snap-x snap-mandatory">
            {sortedDays.map((day, idx) => {
              const active = idx === activeDayIdx;
              const dayNum = idx + 1;
              const hasExercises = (day.exercises?.length ?? 0) > 0;
              return (
                <button
                  key={day.id ?? `${day.day_of_week}-${idx}`}
                  type="button"
                  onClick={() => setActiveDayIdx(idx)}
                  className={[
                    'snap-start shrink-0 relative flex items-center gap-2 pl-2 pr-4 py-2 rounded-full text-sm font-semibold transition-all',
                    active
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-500'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300 hover:text-slate-900',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-700',
                    ].join(' ')}
                  >
                    {dayNum}
                  </span>
                  <span>{DAY_LABELS[day.day_of_week] ?? `D${day.day_of_week + 1}`}</span>
                  {hasExercises && (
                    <span
                      className={[
                        'inline-block w-1.5 h-1.5 rounded-full',
                        active ? 'bg-white/80' : 'bg-blue-500',
                      ].join(' ')}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
         Day content — title + progress ring + exercise tiles.
         Extra pt-2 so the day label breathes under the pill row.
         ───────────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeDay && (
          <motion.div
            key={activeDay.id ?? `${activeDay.day_of_week}-${activeDayIdx}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-5 pt-2"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold mb-1">
                  {DAY_LABELS_FULL[activeDay.day_of_week] ?? `Día ${activeDayIdx + 1}`}
                </div>
                <h2 className="font-display text-2xl sm:text-3xl text-slate-900 leading-tight">
                  {activeDay.title}
                </h2>
                {activeDay.notes && (
                  <p className="italic text-slate-500 text-sm mt-2 max-w-2xl">
                    {activeDay.notes}
                  </p>
                )}
              </div>

              {dayExerciseCount > 0 && (
                <ProgressRing
                  percent={dayProgressPct}
                  done={dayDoneCount}
                  total={dayExerciseCount}
                />
              )}
            </div>

            <div className="space-y-3">
              {activeDay.exercises.map((ex, i) => {
                const exKey = `${activeDay.day_of_week}-${i}`;
                return (
                  <ExerciseCard
                    key={ex.id ?? exKey}
                    index={i}
                    exercise={ex}
                    done={doneSet.has(exKey)}
                    onToggleDone={() => toggleDone(exKey)}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {regenOpen && (
        <RegenerateModal
          currentRoutine={routine}
          hasFitnessProfile={hasFitnessProfile}
          quota={quota}
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

// ── Hero pill ────────────────────────────────────────────────────────────
function HeroPill({
  children,
  icon,
  accent = false,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm ring-1',
        accent
          ? 'bg-blue-400/15 ring-blue-300/30 text-blue-100'
          : 'bg-white/8 ring-white/15 text-white/85',
      ].join(' ')}
    >
      {icon}
      {children}
    </span>
  );
}

// ── Progress ring ────────────────────────────────────────────────────────
function ProgressRing({
  percent,
  done,
  total,
}: {
  percent: number;
  done: number;
  total: number;
}) {
  const size = 64;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const complete = percent >= 100;

  return (
    <div className="shrink-0 relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-200"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={complete ? 'stroke-emerald-500' : 'stroke-blue-600'}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {complete ? (
          <Check className="w-5 h-5 text-emerald-500" strokeWidth={3} />
        ) : (
          <>
            <span className="text-[11px] font-bold tabular-nums text-slate-900 leading-none">
              {done}/{total}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mt-0.5">
              Hoy
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Exercise card ────────────────────────────────────────────────────────

function ExerciseCard({
  index,
  exercise,
  done,
  onToggleDone,
}: {
  index: number;
  exercise: RoutineExercise;
  done: boolean;
  onToggleDone: () => void;
}) {
  const [open, setOpen] = useState(false);

  const name =
    exercise.exercise_name_snapshot ??
    exercise.exercise_name ??
    exercise.exercise?.name ??
    'Ejercicio';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 220,
        damping: 26,
        delay: Math.min(index * 0.04, 0.4),
      }}
      className={[
        'group bg-white rounded-2xl overflow-hidden ring-1 transition-all',
        done
          ? 'ring-emerald-300 shadow-sm shadow-emerald-500/10'
          : 'ring-slate-200 shadow-sm hover:shadow-lg hover:shadow-blue-900/5 hover:ring-slate-300 hover:-translate-y-0.5',
      ].join(' ')}
    >
      <motion.button
        layout
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-4 p-3 sm:p-4 text-left"
      >
        {/* Media slot */}
        <ExerciseMedia name={name} size="sm" videoUrl={exercise.video_url} />

        {/* Main info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tabular-nums text-slate-400 bg-slate-100 rounded-md px-1.5 py-0.5">
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className="font-semibold text-slate-900 truncate">{name}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 ring-1 ring-blue-200 font-mono tabular-nums font-semibold">
              {exercise.sets} × {exercise.reps}
            </span>
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Clock className="w-3 h-3" />
              {exercise.rest_sec}s
            </span>
            {done && (
              <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
                Hecho
              </span>
            )}
          </div>
        </div>

        {/* Expand chevron */}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 inline-flex w-8 h-8 items-center justify-center rounded-full text-slate-400 group-hover:text-slate-600 group-hover:bg-slate-100"
        >
          <ChevronDown className="w-5 h-5" />
        </motion.span>
      </motion.button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="details"
            layout
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-4 border-t border-slate-100 pt-4">
              {/* Enlarged media — ExerciseMedia handles its own thumbnail
                  → inline YouTube iframe swap when the user taps play. */}
              <ExerciseMedia name={name} size="lg" videoUrl={exercise.video_url} />

              {exercise.exercise?.description && (
                <p className="text-sm text-slate-700 leading-relaxed">
                  {exercise.exercise.description}
                </p>
              )}

              {exercise.notes && (
                <div className="flex items-start gap-2 text-sm bg-blue-50/60 ring-1 ring-blue-100 text-slate-800 rounded-xl p-3.5">
                  <Lightbulb className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{exercise.notes}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={onToggleDone}
                  className={[
                    'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ring-1',
                    done
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-300 hover:bg-emerald-100'
                      : 'bg-slate-900 text-white ring-slate-900 hover:bg-slate-800 shadow-sm',
                  ].join(' ')}
                >
                  {done ? (
                    <>
                      <Check className="w-4 h-4" strokeWidth={3} />
                      Completado
                    </>
                  ) : (
                    <>Marcar hecho</>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact "done" toggle in the collapsed state for fast tap */}
      {!open && (
        <div className="flex items-center justify-end px-3 sm:px-4 pb-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone();
            }}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ring-1',
              done
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-300'
                : 'bg-white text-slate-500 ring-slate-200 hover:text-slate-900 hover:ring-slate-300',
            ].join(' ')}
          >
            {done ? (
              <>
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
                Hecho
              </>
            ) : (
              'Marcar hecho'
            )}
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ── Regenerate modal ─────────────────────────────────────────────────────

function RegenerateModal({
  currentRoutine,
  hasFitnessProfile,
  quota,
  onClose,
  onDone,
}: {
  currentRoutine: Routine;
  hasFitnessProfile: boolean;
  quota: AiQuota | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<GenerateFormState>({
    location: (currentRoutine.location as Location) ?? 'GYM',
    objective: (currentRoutine.goal as Objective) ?? 'GENERAL_FITNESS',
    days_per_week: currentRoutine.days_per_week ?? 4,
    session_duration_min: 60,
  });

  const mut = useMutation({
    mutationFn: async (body: GenerateFormState) =>
      (await api.post('/ai/routines/generate', body, { timeout: 90_000 })).data,
    onSuccess: () => {
      toast.success('Nueva rutina generada.');
      onDone();
    },
    onError: (e) => {
      const n = normalizeError(e);
      if (
        n.code === 'QUOTA_EXCEEDED' ||
        n.code === 'MEMBERSHIP_REQUIRED' ||
        n.code === 'FEATURE_NOT_IN_PLAN'
      ) {
        toast.error(n.message || 'No puedes regenerar tu rutina ahora mismo.');
      } else if (n.status === 429) {
        toast.error('Demasiadas generaciones. Espera un momento e intenta de nuevo.');
      } else {
        toast.error(n.message || 'No pudimos regenerar. Intenta de nuevo.');
      }
    },
  });

  const quotaBlocks = !!quota && !quota.routine.allowed;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4">
      <AIGenerationOverlay open={mut.isPending} kind="routine" />
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

        <FieldBlock label="Objetivo">
          <div className="grid grid-cols-2 gap-2">
            {OBJECTIVE_OPTIONS.map((o) => {
              const active = form.objective === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, objective: o.value }))}
                  className={[
                    'flex items-center gap-2 rounded-xl ring-1 p-2.5 text-left transition-colors',
                    active
                      ? 'ring-blue-500 bg-blue-50 shadow-sm'
                      : 'ring-slate-200 bg-slate-50 hover:bg-white hover:ring-slate-300',
                  ].join(' ')}
                >
                  <span className="text-lg leading-none">{o.emoji}</span>
                  <span className={['text-xs font-semibold', active ? 'text-blue-900' : 'text-slate-900'].join(' ')}>
                    {o.label}
                  </span>
                </button>
              );
            })}
          </div>
        </FieldBlock>

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

        <QuotaStatus quota={quota} />

        <button
          type="button"
          disabled={!hasFitnessProfile || mut.isPending || quotaBlocks}
          onClick={() => mut.mutate(form)}
          className={[
            'w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-semibold transition shadow-sm',
            !hasFitnessProfile || mut.isPending || quotaBlocks
              ? 'bg-slate-300 cursor-not-allowed opacity-50'
              : 'bg-blue-600 hover:bg-blue-700',
          ].join(' ')}
        >
          {mut.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generando… ~20s
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Regenerar rutina
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
        Las rutinas personalizadas están incluidas en todos los planes de CED·GYM.
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
