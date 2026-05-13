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
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, normalizeError } from '@/lib/api';
import { planDisplayName } from '@/lib/utils';
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

// Etiquetas humanas + emoji para mostrar tipo de usuario y disciplina
// que el socio configuró en su perfil. Si vino como ATHLETE+KARATE,
// queremos que vea "🥋 Karate" en su resumen para confirmar que la
// rutina sí va a salir orientada a karate (antes el resumen ignoraba
// estos campos y daba la impresión de que se perdían).
const USER_TYPE_LABELS: Record<string, string> = {
  ADULT:   '🧍 Adulto',
  SENIOR:  '👴 Adulto mayor',
  KID:     '👶 Niño/Juvenil',
  ATHLETE: '🏆 Deportista',
};

const DISCIPLINE_LABELS: Record<string, string> = {
  FOOTBALL_SOCCER: '⚽ Fútbol soccer',
  FOOTBALL_US:     '🏈 Fútbol americano',
  BASKETBALL:      '🏀 Básquetbol',
  TENNIS:          '🎾 Tenis',
  KARATE:          '🥋 Karate',
  GOLF:            '⛳ Golf',
  SWIMMING:        '🏊 Natación',
  BASEBALL:        '⚾ Béisbol',
  VOLLEYBALL:      '🏐 Voleibol',
  BOXING:          '🥊 Boxeo',
  CROSSFIT:        '🏋️ CrossFit',
  POWERLIFTING:    '🏋️‍♂️ Powerlifting',
  HYROX:           '🏃 HYROX',
  STRENGTH:        '💪 Fuerza/hipertrofia',
  FUNCTIONAL:      '🤸 Funcional',
};

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER:     'Principiante',
  INTERMEDIATE: 'Intermedio',
  ADVANCED:     'Avanzado',
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
  membership_expires_at?: string | null;
  membership_days_remaining?: number;
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

  // Pull `me` para chequear que el perfil esté listo (bloquea CTA si no)
  // y pre-rellenar los overrides con lo que el socio ya configuró en su
  // wizard. Leemos routine_profile (nuevo) con fallback al fitness_profile
  // legacy para cuentas que aún no migraron.
  // refetchOnMount: 'always' — el socio pide explícitamente que cada
  // vez que entre a /portal/rutinas (o vuelva de editar perfil) se
  // recarguen sus preferencias antes de mostrar/generar nada. Sin
  // esto React Query podía servir caché viejo y la card del header
  // mostraba un Tipo/Deporte/Nivel desactualizado.
  const meQ = useQuery<{
    user: {
      name?: string | null;
      full_name?: string | null;
      fitness_profile?: Record<string, unknown> | null;
      routine_profile?: Record<string, unknown> | null;
    };
  }>({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
    refetchOnMount: 'always',
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
  // Perfil de rutina (nuevo) con fallback al legacy. La presencia de
  // CUALQUIERA marca el perfil como completo para efectos de habilitar
  // la CTA — el backend hará el merge cuando se genere.
  const routineProfile =
    (meQ.data?.user?.routine_profile as Record<string, unknown> | null) ?? null;
  const fitnessProfile =
    (meQ.data?.user?.fitness_profile as Record<string, unknown> | null) ?? null;
  const effectiveProfile = routineProfile ?? fitnessProfile ?? null;
  const hasFitnessProfile = Boolean(effectiveProfile);

  // Greet the member by first name. Split on any whitespace so
  // "María José Pérez" resolves to "María" without the last name
  // bleeding into the hero's display font line.
  const rawName = meQ.data?.user?.full_name ?? meQ.data?.user?.name ?? '';
  const firstName = rawName.trim().split(/\s+/)[0] ?? '';

  const quota = quotaQ.data ?? null;
  const onGenOrRegen = () => {
    qc.invalidateQueries({ queryKey: ['routines', 'me'] });
    qc.invalidateQueries({ queryKey: ['ai', 'quota', 'me'] });
  };

  if (!routine) {
    return (
      <GenerateRoutineCard
        hasFitnessProfile={hasFitnessProfile}
        profile={effectiveProfile}
        quota={quota}
        onGenerated={onGenOrRegen}
      />
    );
  }

  return (
    <ActiveRoutineView
      routine={routine}
      hasFitnessProfile={hasFitnessProfile}
      profile={effectiveProfile}
      quota={quota}
      firstName={firstName}
      onRegenerated={onGenOrRegen}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Case 1: no active routine → generate form
// ═════════════════════════════════════════════════════════════════════════

// Body que mandamos al backend. Todos opcionales — el backend
// resuelve cualquier campo faltante con el routine_profile del socio.
// Solo mandamos los que el socio explícitamente cambió en el panel
// "ajustar para esta vez", para que se sienta como override claro.
type UserType = 'ADULT' | 'SENIOR' | 'KID' | 'ATHLETE';
type Discipline =
  | 'FOOTBALL_SOCCER' | 'FOOTBALL_US' | 'BASKETBALL' | 'TENNIS'
  | 'KARATE' | 'GOLF' | 'SWIMMING' | 'BASEBALL' | 'VOLLEYBALL'
  | 'BOXING' | 'CROSSFIT' | 'POWERLIFTING' | 'HYROX'
  | 'STRENGTH' | 'FUNCTIONAL';

const USER_TYPE_OPTIONS: { value: UserType; label: string; emoji: string }[] = [
  { value: 'ADULT',   label: 'Adulto',         emoji: '🧍' },
  { value: 'SENIOR',  label: 'Adulto mayor',   emoji: '👴' },
  { value: 'KID',     label: 'Niño/Juvenil',   emoji: '👶' },
  { value: 'ATHLETE', label: 'Deportista',     emoji: '🏆' },
];

// Lista completa de disciplinas — replica las del wizard (todas las 15
// que el backend ya tiene catalogadas). Si el socio cambia a otro
// deporte solo para esta generación, no tiene que ir al perfil.
const DISCIPLINE_OPTIONS: { value: Discipline; label: string }[] = [
  { value: 'FOOTBALL_SOCCER', label: '⚽ Fútbol soccer' },
  { value: 'FOOTBALL_US',     label: '🏈 Fútbol americano' },
  { value: 'BASKETBALL',      label: '🏀 Básquetbol' },
  { value: 'TENNIS',          label: '🎾 Tenis' },
  { value: 'KARATE',          label: '🥋 Karate' },
  { value: 'GOLF',            label: '⛳ Golf' },
  { value: 'SWIMMING',        label: '🏊 Natación' },
  { value: 'BASEBALL',        label: '⚾ Béisbol' },
  { value: 'VOLLEYBALL',      label: '🏐 Voleibol' },
  { value: 'BOXING',          label: '🥊 Boxeo' },
  { value: 'CROSSFIT',        label: '🏋️ CrossFit' },
  { value: 'POWERLIFTING',    label: '🏋️‍♂️ Powerlifting' },
  { value: 'HYROX',           label: '🏃 HYROX' },
  { value: 'STRENGTH',        label: '💪 Fuerza / hipertrofia' },
  { value: 'FUNCTIONAL',      label: '🤸 Funcional' },
];

interface GenerateOverride {
  location?: Location;
  objective?: Objective;
  days_per_week?: number;
  session_duration_min?: number;
  user_type?: UserType;
  discipline?: Discipline;
}

function GenerateRoutineCard({
  hasFitnessProfile,
  profile,
  quota,
  onGenerated,
}: {
  hasFitnessProfile: boolean;
  profile: Record<string, unknown> | null;
  quota: AiQuota | null;
  onGenerated: () => void;
}) {
  // Si el socio expande "ajustar para esta vez", pre-rellenamos con
  // los valores del perfil y dejamos que tape solo lo que quiera.
  const profileLocation = (profile?.location as Location | undefined) ?? 'GYM';
  const profileObjective = (profile?.objective as Objective | undefined) ?? 'GENERAL_FITNESS';
  const profileDays = (profile?.days_per_week as number | undefined) ?? 4;
  const profileDuration = (profile?.session_duration_min as number | undefined) ?? 60;
  // Tipo, disciplina y nivel también vienen del routine_profile —
  // los mostramos en el resumen aunque no sean editables por
  // generación. El backend SÍ los usa al generar (ai-routines.js
  // hace merge body > routine_profile, y como nosotros no los
  // mandamos en body, gana lo del perfil).
  const profileUserType = profile?.user_type as string | undefined;
  const profileDiscipline = profile?.discipline as string | undefined;
  const profileLevel = profile?.level as string | undefined;

  const [showOverrides, setShowOverrides] = useState(false);
  const [override, setOverride] = useState<GenerateOverride>({});

  const mut = useMutation({
    // 180s mirrors the Fastify requestTimeout in apps/api/src/index.js.
    // The COACH_TEMPLATES_V1 path runs up to 2 OpenAI calls (initial
    // attempt + retry-with-feedback when the validator rejects the
    // response), and each call can take 30-50s. The previous 90s
    // limit aborted axios while the backend was still working, which
    // surfaced as "No pudimos conectar con el servidor" in the toast.
    // Same fix that meal-plans got in d441e50.
    mutationFn: async (body: GenerateOverride) =>
      (await api.post('/ai/routines/generate', body, { timeout: 180_000 })).data,
    onSuccess: () => {
      toast.success('Tu rutina está lista.');
      onGenerated();
    },
    onError: (e) => {
      const n = normalizeError(e);
      if (
        n.code === 'QUOTA_EXCEEDED' ||
        n.code === 'MEMBERSHIP_REQUIRED' ||
        n.code === 'FEATURE_NOT_IN_PLAN' ||
        n.code === 'PROFILE_INCOMPLETE'
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

  // Effective values (lo que se va a enviar): perfil + overrides puestos.
  const effective = {
    location: override.location ?? profileLocation,
    objective: override.objective ?? profileObjective,
    days_per_week: override.days_per_week ?? profileDays,
    session_duration_min: override.session_duration_min ?? profileDuration,
    user_type:
      (override.user_type ?? (profileUserType as UserType | undefined) ?? 'ADULT') as UserType,
    discipline:
      (override.discipline ?? (profileDiscipline as Discipline | undefined)) as
        | Discipline
        | undefined,
  };

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
              Completa tu perfil fitness primero para que podamos adaptar la
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

        {/* ── Resumen del perfil + CTA principal ─────────────────────────
            La filosofía: el socio ya configuró todo en su perfil de rutina.
            Aquí solo mostramos un resumen y un botón grande "Generar".
            Si quiere cambiar algo solo para esta generación, expande el
            panel de overrides — pre-rellenado con su perfil. ────────────*/}
        <div className="mt-8 space-y-5">
          {hasFitnessProfile && (
            <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                    Tu plan actual
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Lo armamos con el perfil que llenaste.{' '}
                    <Link href="/portal/perfil" className="text-blue-600 hover:underline font-medium">
                      Editar perfil
                    </Link>
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <SummaryPill label="Objetivo" value={GOAL_LABELS[effective.objective] ?? effective.objective} />
                <SummaryPill label="Dónde" value={LOCATION_LABELS[effective.location] ?? effective.location} />
                <SummaryPill label="Días/sem" value={`${effective.days_per_week}`} />
                <SummaryPill label="Duración" value={`${effective.session_duration_min} min`} />
                {profileUserType && (
                  <SummaryPill
                    label="Tipo"
                    value={USER_TYPE_LABELS[profileUserType] ?? profileUserType}
                  />
                )}
                {profileUserType === 'ATHLETE' && profileDiscipline && (
                  <SummaryPill
                    label="Deporte"
                    value={DISCIPLINE_LABELS[profileDiscipline] ?? profileDiscipline}
                  />
                )}
                {profileLevel && (
                  <SummaryPill
                    label="Nivel"
                    value={LEVEL_LABELS[profileLevel] ?? profileLevel}
                  />
                )}
              </div>
              {profileUserType === 'ATHLETE' && profileDiscipline && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                  Tu rutina será específica para{' '}
                  <strong>
                    {(DISCIPLINE_LABELS[profileDiscipline] ?? profileDiscipline).replace(/^[^ ]+ /, '')}
                  </strong>{' '}
                  — con énfasis en las demandas del deporte (movilidad,
                  potencia, etc.), no solo fitness general.
                </div>
              )}
            </div>
          )}

          <QuotaStatus quota={quota} />

          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              // Mandamos el effective COMPLETO (perfil + overrides), no
              // solo el override. Así el body que viaja al backend
              // refleja exactamente lo que el socio ve en pantalla,
              // incluyendo user_type/discipline. Sin esto, si el socio
              // es ATHLETE/BASKETBALL en perfil pero no abrió el panel
              // de "ajustar", body llegaba {} y dependíamos 100% de
              // que el backend leyera la BD fresca.
              mut.mutate({
                location: effective.location,
                objective: effective.objective,
                days_per_week: effective.days_per_week,
                session_duration_min: effective.session_duration_min,
                user_type: effective.user_type,
                discipline: effective.discipline,
              })
            }
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

          {hasFitnessProfile && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowOverrides((s) => !s)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
              >
                {showOverrides ? 'Ocultar ajustes' : 'Ajustar solo para esta vez'}
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${showOverrides ? 'rotate-180' : ''}`}
                />
              </button>
            </div>
          )}

          {showOverrides && hasFitnessProfile && (
            <div className="space-y-5 pt-2 border-t border-slate-200">
              <p className="text-[11px] text-slate-400">
                Estos cambios solo aplican a esta generación. Tu perfil queda intacto.
              </p>

              <FieldBlock label="Tipo de entrenamiento">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  {USER_TYPE_OPTIONS.map((t) => {
                    const active = effective.user_type === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() =>
                          setOverride((ov) => ({
                            ...ov,
                            user_type: t.value,
                            // Si dejó de ser Deportista, limpiar la disciplina
                            discipline: t.value === 'ATHLETE' ? ov.discipline : undefined,
                          }))
                        }
                        className={[
                          'flex items-center gap-2 rounded-xl ring-1 p-3 text-left transition-colors',
                          active
                            ? 'ring-blue-500 bg-blue-50 shadow-sm'
                            : 'ring-slate-200 bg-slate-50 hover:bg-white hover:ring-slate-300',
                        ].join(' ')}
                      >
                        <span className="text-xl leading-none">{t.emoji}</span>
                        <span className={['text-sm font-semibold', active ? 'text-blue-900' : 'text-slate-900'].join(' ')}>
                          {t.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </FieldBlock>

              {effective.user_type === 'ATHLETE' && (
                <FieldBlock label="Deporte para esta rutina">
                  <select
                    value={effective.discipline ?? ''}
                    onChange={(e) =>
                      setOverride((ov) => ({
                        ...ov,
                        discipline: (e.target.value || undefined) as Discipline | undefined,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none"
                  >
                    <option value="">— Elige deporte —</option>
                    {DISCIPLINE_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Para esta generación nada más. Si quieres cambiarlo
                    permanente, ve a <Link href="/portal/perfil" className="text-blue-600 hover:underline">Editar perfil</Link>.
                  </p>
                </FieldBlock>
              )}

              <FieldBlock label="Objetivo">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                  {OBJECTIVE_OPTIONS.map((o) => {
                    const active = effective.objective === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setOverride((ov) => ({ ...ov, objective: o.value }))}
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

              <FieldBlock label="¿Dónde entrenas esta vez?">
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {(['GYM', 'HOME', 'BOTH'] as Location[]).map((loc) => (
                    <RadioCard
                      key={loc}
                      active={effective.location === loc}
                      onClick={() => setOverride((ov) => ({ ...ov, location: loc }))}
                      label={loc === 'GYM' ? 'Gym' : loc === 'HOME' ? 'Casa' : 'Ambos'}
                      hint={
                        loc === 'GYM' ? 'Máquinas + pesos' : loc === 'HOME' ? 'Mínimo equipo' : 'Alterna'
                      }
                    />
                  ))}
                </div>
              </FieldBlock>

              <FieldBlock label="Días por semana">
                <Segmented
                  options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))}
                  value={effective.days_per_week}
                  onChange={(v) => setOverride((ov) => ({ ...ov, days_per_week: v as number }))}
                />
              </FieldBlock>

              <FieldBlock label="Duración por sesión">
                <Segmented
                  options={[
                    { value: 30, label: '30 min' },
                    { value: 45, label: '45 min' },
                    { value: 60, label: '60 min' },
                    { value: 75, label: '75 min' },
                    { value: 90, label: '90 min' },
                    { value: 120, label: '120 min' },
                  ]}
                  value={effective.session_duration_min}
                  onChange={(v) => setOverride((ov) => ({ ...ov, session_duration_min: v as number }))}
                />
              </FieldBlock>

              <button
                type="button"
                onClick={() => setOverride({})}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600 underline"
              >
                Restablecer a mi perfil
              </button>
            </div>
          )}
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
          Rutinas ilimitadas con tu plan {quota.plan ? planDisplayName(quota.plan) : ''}.
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
    // Clamp the countdown to whichever ends first: the 30-day quota
    // window OR the membership itself. A member whose plan expires
    // in 5 days won't actually have a quota reset at day 29.
    const quotaDays = quota.days_until_renewal;
    const memberDays = quota.membership_days_remaining ?? Number.POSITIVE_INFINITY;
    const membershipEndsFirst = memberDays < quotaDays;
    const days = membershipEndsFirst ? memberDays : quotaDays;
    const headline = membershipEndsFirst
      ? `Tu membresía vence en ${days} día${days === 1 ? '' : 's'} — renuévala para generar otra rutina.`
      : `Ya usaste tu rutina este periodo. Se renueva en ${days} día${days === 1 ? '' : 's'}.`;
    return (
      <div className="flex items-start gap-3 bg-amber-50 ring-1 ring-amber-200 text-amber-900 rounded-xl p-4">
        <Clock className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex-1 text-sm">
          <div className="font-semibold">
            {headline}
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
  profile,
  quota,
  firstName,
  onRegenerated,
}: {
  routine: Routine;
  hasFitnessProfile: boolean;
  profile: Record<string, unknown> | null;
  quota: AiQuota | null;
  firstName: string;
  onRegenerated: () => void;
}) {
  // Sort days by day_of_week so tabs come out in weekday order.
  const sortedDays = useMemo(
    () => [...routine.days].sort((a, b) => a.day_of_week - b.day_of_week),
    [routine.days],
  );

  // Pick a sensible default tab for the member. We store
  // day_of_week as 0=Monday…6=Sunday, but JS Date.getDay() returns
  // 0=Sunday…6=Saturday. Shift with (+6) % 7 to match our convention.
  // If today isn't a training day, land on the next upcoming training
  // day (so a member opening the app on Sunday sees Monday, not Monday's
  // stale top-of-list state).
  const pickDefaultDayIdx = (days: RoutineDay[]): number => {
    if (days.length === 0) return 0;
    const today = (new Date().getDay() + 6) % 7;
    const exact = days.findIndex((d) => d.day_of_week === today);
    if (exact !== -1) return exact;
    const upcoming = days.findIndex((d) => d.day_of_week > today);
    return upcoming !== -1 ? upcoming : 0;
  };
  const [activeDayIdx, setActiveDayIdx] = useState(() =>
    pickDefaultDayIdx(sortedDays),
  );
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

  // Only one exercise expanded at a time. When the user opens a new
  // card the previous one collapses — which unmounts its InlinePlayer,
  // so the video stops playing. Switching days also resets the
  // expansion so a new day starts fully collapsed.
  const [openKey, setOpenKey] = useState<string | null>(null);
  useEffect(() => {
    setOpenKey(null);
  }, [activeDayIdx]);

  // Day-pill refs, used by the effect below to pull the active pill
  // into view once per change. Previous version put scrollIntoView in
  // the JSX ref callback, which fires on EVERY render — so expanding
  // an exercise (setOpenKey) re-rendered, the active pill ref re-ran,
  // and the page jerked back to the top of the day. Tracking refs in
  // an array + scrolling only when activeDayIdx changes fixes that.
  const dayPillRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const node = dayPillRefs.current[activeDayIdx];
    if (node) {
      node.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
    }
  }, [activeDayIdx]);

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

  // Tipo / Deporte / Nivel salen del FitnessProfile actual del socio.
  // No están persistidos en la Routine — si el socio cambia perfil y
  // regenera, los pills reflejan el perfil con el que se generó esta
  // nueva rutina. Mostrarlos aquí cierra el ciclo "qué configuré → qué
  // rutina obtuve" que el socio pidió ver explícito.
  const profileUserType = profile?.user_type as string | undefined;
  const profileDiscipline = profile?.discipline as string | undefined;
  const profileLevel = profile?.level as string | undefined;
  const profilePills: { label: string; value: string }[] = [];
  if (profileUserType) {
    profilePills.push({
      label: 'Tipo',
      value: USER_TYPE_LABELS[profileUserType] ?? profileUserType,
    });
  }
  if (profileUserType === 'ATHLETE' && profileDiscipline) {
    profilePills.push({
      label: 'Deporte',
      value: DISCIPLINE_LABELS[profileDiscipline] ?? profileDiscipline,
    });
  }
  if (profileLevel) {
    profilePills.push({
      label: 'Nivel',
      value: LEVEL_LABELS[profileLevel] ?? profileLevel,
    });
  }
  // routine.name suele venir con el deporte ("Básquet — rutina de Ana
  // 4 días"). Lo mostramos solo si la IA lo personalizó — caemos al
  // genérico de la página si está vacío.
  const routineDisplayName =
    routine.name && routine.name.trim().length > 0 ? routine.name.trim() : null;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ─────────────────────────────────────────────────────────────
         Hero — editorial greeting, display-font member name as the
         anchor. Decorative gradient corner + accent rail keep it from
         reading like a generic dashboard card.
         ───────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm"
      >
        {/* Top gradient rail — signals "premium member content"
            without hijacking the whole card like the old dark hero. */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-transparent pointer-events-none" />
        {/* Corner glow — subtle, brand-colored, never competes with
            the headline or the stats row. */}
        <div className="absolute -top-24 -right-20 w-48 h-48 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-56 h-56 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />

        <div className="relative px-5 sm:px-7 py-6 sm:py-7">
          {/* Greeting block — display-font first name as the anchor.
              "Hola," is a small intro beat; the name carries the card.
              Goal + days-per-week ride underneath as a clean subtitle
              so we don't need a separate eyebrow cluttering the top. */}
          <div>
            <div className="text-sm text-slate-500">Hola,</div>
            <h1 className="font-display text-4xl sm:text-5xl leading-[1] text-slate-900 mt-0.5">
              {firstName || 'atleta'}
              <span className="text-blue-600">.</span>
            </h1>
            {(goalLabel || routine.days_per_week) && (
              <div className="mt-3 text-[13px] text-slate-500">
                {goalLabel && (
                  <span className="font-semibold text-slate-700">{goalLabel}</span>
                )}
                {goalLabel && (
                  <span className="mx-1.5 text-slate-300">·</span>
                )}
                <span>
                  {routine.days_per_week} días por semana
                </span>
              </div>
            )}
            {routineDisplayName && (
              <div className="mt-1.5 text-[12px] text-slate-400 italic truncate">
                {routineDisplayName}
              </div>
            )}
            {profilePills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {profilePills.map((p) => (
                  <span
                    key={p.label}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-100"
                  >
                    <span className="uppercase tracking-wide text-[9px] text-blue-500 font-semibold">
                      {p.label}
                    </span>
                    {p.value}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Stats strip — secondary numeric readout. Light rule above
              so it feels like a data block, not more copy. */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
            <StatInline value={totalExercises} label={`ejercicio${totalExercises === 1 ? '' : 's'}`} />
            {locationLabel && <StatInline value={locationLabel} muted />}
            {startedDays !== null && startedDays > 0 && (
              <StatInline value={`${startedDays}d`} label="activa" muted />
            )}
          </div>

          {/* Action row. For STARTER after their monthly routine we
              show when the quota renews — BUT clamped to when their
              membership ends. If the membership expires before the
              quota window resets, the quota is moot (they need to
              renew the plan first), so the copy switches to
              "Renueva tu membresía" with the shorter countdown. */}
          <div className="mt-5 flex justify-end">
            {regenState === 'locked-days' ? (
              (() => {
                const daysUntilQuotaRenews = quota?.days_until_renewal ?? 0;
                const daysUntilMembershipEnds =
                  quota?.membership_days_remaining ?? Number.POSITIVE_INFINITY;
                const membershipEndsFirst =
                  daysUntilMembershipEnds < daysUntilQuotaRenews;
                const effectiveDays = membershipEndsFirst
                  ? daysUntilMembershipEnds
                  : daysUntilQuotaRenews;
                const label = membershipEndsFirst
                  ? 'Tu membresía vence en'
                  : 'Próxima rutina en';
                return (
                  <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    {label}{' '}
                    <span className="font-semibold text-slate-700 tabular-nums">
                      {effectiveDays} día{effectiveDays === 1 ? '' : 's'}
                    </span>
                  </span>
                );
              })()
            ) : (
              <button
                type="button"
                onClick={() => setRegenOpen(true)}
                className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm shadow-blue-600/20 transition-all active:scale-[0.98]"
              >
                <RefreshCw className="w-3.5 h-3.5 transition-transform group-hover:rotate-180 duration-500" />
                Regenerar rutina
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
                  // Store the node so the day-change effect above can
                  // scroll the active pill into view. The actual
                  // scrollIntoView lives there — putting it in this
                  // ref callback (the previous shape) fired on every
                  // render and dragged the page back to the top each
                  // time the user expanded an exercise.
                  ref={(node) => {
                    dayPillRefs.current[idx] = node;
                  }}
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
                    open={openKey === exKey}
                    onToggleOpen={() =>
                      setOpenKey((curr) => (curr === exKey ? null : exKey))
                    }
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

// ── Stat inline ──────────────────────────────────────────────────────────
//
// One-line numeric readout used in the hero stats strip. Keeps the
// visual rhythm consistent (big numeric, small caption) without
// boxing each value into its own pill.
function StatInline({
  value,
  label,
  muted = false,
}: {
  value: string | number;
  label?: string;
  muted?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        className={[
          'font-display tabular-nums font-bold',
          muted ? 'text-slate-700 text-base' : 'text-slate-900 text-lg',
        ].join(' ')}
      >
        {value}
      </span>
      {label && (
        <span className="text-xs text-slate-500">{label}</span>
      )}
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
  open,
  onToggleOpen,
}: {
  index: number;
  exercise: RoutineExercise;
  done: boolean;
  onToggleDone: () => void;
  /** Controlled expand state — parent keeps only one card open. */
  open: boolean;
  onToggleOpen: () => void;
}) {

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
        onClick={onToggleOpen}
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
            <h3 className="font-semibold text-slate-900 leading-snug line-clamp-2">{name}</h3>
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
  // Pre-rellenamos con el PERFIL ACTUAL del socio, NO con la rutina
  // vieja. Antes leíamos de currentRoutine, así que si el socio
  // actualizaba su perfil (ej. cambió objetivo de Hipertrofia a
  // WeightLoss) y abría "Regenerar", el modal arrancaba con los
  // valores viejos y si daba Regenerar sin tocar nada regeneraba
  // otra Hipertrofia. Loop infinito. Ahora el perfil manda; la
  // rutina actual solo se usa como fallback si el perfil aún no
  // tiene esos campos.
  //
  // refetchOnMount: 'always' garantiza que SIEMPRE pidamos al backend
  // el perfil más reciente al abrir el modal. El socio pidió esto:
  // "al darle generar quiero que cargue de nuevo las preferencias"
  // — antes podíamos servir caché de hace minutos y mandar a la IA
  // un perfil viejo (sin ATHLETE/BASKETBALL recién guardados).
  const meQ = useQuery<{
    user?: { routine_profile?: Record<string, unknown> | null };
  }>({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
    refetchOnMount: 'always',
  });
  const profile = meQ.data?.user?.routine_profile ?? null;
  const profileLocation = profile?.location as Location | undefined;
  const profileObjective = profile?.objective as Objective | undefined;
  const profileDays = profile?.days_per_week as number | undefined;
  const profileDuration = profile?.session_duration_min as number | undefined;
  const profileUserType = profile?.user_type as UserType | undefined;
  const profileDiscipline = profile?.discipline as Discipline | undefined;
  const profileLevel = profile?.level as string | undefined;

  const [form, setForm] = useState<Required<GenerateOverride>>({
    location:
      profileLocation ?? (currentRoutine.location as Location) ?? 'GYM',
    objective:
      profileObjective ??
      (currentRoutine.goal as Objective) ??
      'GENERAL_FITNESS',
    days_per_week:
      profileDays ?? currentRoutine.days_per_week ?? 4,
    session_duration_min: profileDuration ?? 60,
    user_type: profileUserType ?? 'ADULT',
    discipline: profileDiscipline as Discipline,
  });
  // Si el perfil llega DESPUÉS del primer render (useQuery todavía
  // cargando al montar el modal), sincronizamos el form una sola vez
  // cuando aterriza. Si el socio ya tocó algún campo, no pisamos su
  // edición — solo aplicamos al estado "intacto".
  const [hydratedFromProfile, setHydratedFromProfile] = useState(!!profile);
  useEffect(() => {
    if (hydratedFromProfile || !profile) return;
    setForm((f) => ({
      location: profileLocation ?? f.location,
      objective: profileObjective ?? f.objective,
      days_per_week: profileDays ?? f.days_per_week,
      session_duration_min: profileDuration ?? f.session_duration_min,
      user_type: profileUserType ?? f.user_type,
      discipline: (profileDiscipline ?? f.discipline) as Discipline,
    }));
    setHydratedFromProfile(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const qcLocal = useQueryClient();

  const mut = useMutation({
    // See the GenerateForm comment above — same 180s ceiling, same
    // reason (template-path retry can run two OpenAI calls).
    //
    // CAUSA RAÍZ del bug "elegí Natación pero el pill sigue diciendo
    // Básquet": el modal mandaba user_type/discipline solo como
    // override de UNA generación, sin persistir nada al perfil. La
    // rutina sí se generaba para Natación, pero el pill (que lee de
    // `routine_profile` en BD) seguía mostrando Básquet → cliente
    // confundido porque las dos cosas no concuerdan. Ahora ANTES de
    // generar persistimos los cambios al perfil mergeando con lo que
    // ya tenía, así pill + rutina + próximas generaciones coinciden.
    mutationFn: async (body: GenerateOverride) => {
      // Solo mandamos los campos que el modal edita — el endpoint
      // backend ahora hace merge, así que NO necesitamos enviar todo
      // el profile y arriesgarnos a pisar likes/injuries/etc.
      const profilePatch = {
        location: body.location,
        objective: body.objective,
        days_per_week: body.days_per_week,
        session_duration_min: body.session_duration_min,
        user_type: body.user_type,
        // discipline solo aplica si es ATHLETE — si dejó de serlo,
        // mandamos null para limpiarla del perfil.
        discipline: body.user_type === 'ATHLETE' ? (body.discipline ?? null) : null,
      };
      try {
        await api.patch('/users/me/routine-profile', profilePatch);
      } catch (e) {
        // Si el PATCH falla (ej. validación), seguimos con la
        // generación — mejor un pill viejo que bloquear al socio.
        // eslint-disable-next-line no-console
        console.warn('[regenerate] profile persist failed', e);
      }
      return (await api.post('/ai/routines/generate', body, { timeout: 180_000 })).data;
    },
    onSuccess: () => {
      // Invalidamos /auth/me para que el pill DEPORTE refleje
      // inmediatamente el nuevo deporte sin requerir un F5.
      qcLocal.invalidateQueries({ queryKey: ['auth', 'me'] });
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

  // Lock del body scroll mientras el modal está abierto — sin esto en
  // mobile el background sigue siendo scrolleable y la "hoja inferior"
  // se siente desconectada.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // createPortal a document.body — sin esto el modal queda atrapado
  // dentro del árbol DOM de la página, que vive bajo motion.section
  // de framer-motion. framer-motion aplica `transform` a sus nodos,
  // y CSS spec dice que un ancestro con `transform` crea un containing
  // block que rompe `position:fixed` (el fixed se posiciona relativo
  // a ese ancestro, NO al viewport). Resultado visible: el header del
  // portal (z-40) se filtraba por encima del modal porque el modal
  // empezaba debajo del header en vez de cubrir todo. Renderizar al
  // body lo saca de cualquier transform-parent y vuelve a ser
  // verdaderamente fullscreen.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <AIGenerationOverlay open={mut.isPending} kind="routine" />
      {/* max-h + overflow-y-auto: el modal creció (ahora también
          edita Tipo + Deporte) y en pantallas chicas el contenido se
          comía el botón "Regenerar". Limitamos a 90vh y dejamos
          scroll interno; el bg fijo de atrás no se mueve.
          onClick stopPropagation evita que click dentro del modal lo
          cierre — solo cierra al tocar el backdrop o la X. */}
      <div
        className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto overscroll-contain bg-white ring-1 ring-slate-200 shadow-xl rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl sm:text-2xl text-slate-900 leading-tight">
              Regenerar rutina
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Esto reemplaza tu rutina activa. La anterior queda en historial.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 -mr-1 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
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

        {/* Tipo y Deporte editables EN EL MODAL. El socio pidió poder
            cambiar deporte sin tener que ir al perfil — útil cuando
            quiere "esta semana entreno básquet, la próxima karate"
            sin reescribir su perfil base. Si selecciona ATHLETE pero
            no elige Deporte, el backend resuelve fallback al perfil
            guardado, no falla. El Nivel sigue heredándose del perfil
            porque es una propiedad estable del socio (años de
            entrenamiento) — para cambiarlo, link a Editar perfil. */}
        <FieldBlock label="Tipo de entrenamiento">
          <div className="grid grid-cols-2 gap-2">
            {USER_TYPE_OPTIONS.map((t) => {
              const active = form.user_type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      user_type: t.value,
                      // Si dejó de ser Deportista, limpiar disciplina
                      discipline: t.value === 'ATHLETE' ? f.discipline : (undefined as unknown as Discipline),
                    }))
                  }
                  className={[
                    'flex items-center gap-2 rounded-xl ring-1 p-2.5 text-left transition-colors',
                    active
                      ? 'ring-blue-500 bg-blue-50 shadow-sm'
                      : 'ring-slate-200 bg-slate-50 hover:bg-white hover:ring-slate-300',
                  ].join(' ')}
                >
                  <span className="text-lg leading-none">{t.emoji}</span>
                  <span className={['text-xs font-semibold', active ? 'text-blue-900' : 'text-slate-900'].join(' ')}>
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </FieldBlock>

        {form.user_type === 'ATHLETE' && (
          <FieldBlock label="Deporte">
            <select
              value={form.discipline ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  discipline: (e.target.value || undefined) as Discipline,
                }))
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none"
            >
              <option value="">— Elige deporte —</option>
              {DISCIPLINE_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </FieldBlock>
        )}

        {profileLevel && (
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[11px]">
            <span className="text-slate-600">
              <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mr-1.5">
                Nivel
              </span>
              {LEVEL_LABELS[profileLevel] ?? profileLevel}
            </span>
            <Link href="/portal/perfil" className="text-blue-600 hover:underline font-semibold">
              Cambiar →
            </Link>
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
    </div>,
    document.body,
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

// Píldora compacta para el resumen del perfil arriba del CTA principal.
function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col bg-white rounded-xl ring-1 ring-slate-200 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-900 truncate">{value}</span>
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
