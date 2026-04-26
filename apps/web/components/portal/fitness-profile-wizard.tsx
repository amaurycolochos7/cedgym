'use client';

/* eslint-disable react/no-unescaped-entities */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dumbbell,
  User as UserIcon,
  Users as UsersIcon,
  Baby,
  Trophy,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api, normalizeError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import type { ApiError } from '@/lib/schemas';

/* Light-theme primitives — local so we don't pull the dark shared <Button>/<Input>/<Field>. */
const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const LABEL_CLS =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600';

function LightField({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col', className)}>
      {label && (
        <label htmlFor={id} className={LABEL_CLS}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Types mirroring apps/api/src/routes/ai-routines.js mergeProfile.
 * Values are API-facing (SCREAMING_SNAKE where applicable) so we
 * can PATCH the JSON blob straight through.
 * ─────────────────────────────────────────────────────────────*/

type Objective =
  | 'WEIGHT_LOSS'
  | 'MUSCLE_GAIN'
  | 'MAINTENANCE'
  | 'STRENGTH'
  | 'ENDURANCE'
  | 'GENERAL_FITNESS';

type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
type UserType = 'ADULT' | 'SENIOR' | 'KID' | 'ATHLETE';
type Discipline =
  | 'STRENGTH'
  | 'HYROX'
  | 'POWERLIFTING'
  | 'FUNCTIONAL'
  | 'FOOTBALL_US'
  | 'FOOTBALL_SOCCER'
  | 'BASKETBALL'
  | 'TENNIS'
  | 'BOXING'
  | 'CROSSFIT';
type Gender = 'MALE' | 'FEMALE' | 'OTHER';
type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'high'
  | 'very_high';

interface FitnessProfileDraft {
  // Step 1
  age: number | '';
  gender: Gender | '';
  height_cm: number | '';
  weight_kg: number | '';
  // Step 2
  user_type: UserType | '';
  discipline?: Discipline | '';
  // Step 3
  objective: Objective | '';
  level: Level | '';
  activity_level: ActivityLevel | '';
  // Step 4
  days_per_week: number;
  session_duration_min: number;
  // Step 5
  injuries: string[];
  dietary: string[];
  allergies: string[];
  notes: string;
}

const DRAFT_KEY = 'cedgym-fitness-profile-draft';

const EMPTY_DRAFT: FitnessProfileDraft = {
  age: '',
  gender: '',
  height_cm: '',
  weight_kg: '',
  user_type: '',
  discipline: '',
  objective: '',
  level: '',
  activity_level: '',
  days_per_week: 4,
  session_duration_min: 60,
  injuries: [],
  dietary: [],
  allergies: [],
  notes: '',
};

const USER_TYPES: {
  value: UserType;
  title: string;
  sub: string;
  Icon: typeof UserIcon;
}[] = [
  { value: 'ADULT', title: 'Adulto', sub: '18 – 55 años', Icon: UserIcon },
  { value: 'SENIOR', title: 'Adulto mayor', sub: '55+ años', Icon: UsersIcon },
  { value: 'KID', title: 'Niño / Juvenil', sub: '6 – 17 años', Icon: Baby },
  { value: 'ATHLETE', title: 'Deportista', sub: 'Entrena un deporte', Icon: Trophy },
];

const DISCIPLINES: { value: Discipline; label: string }[] = [
  { value: 'FOOTBALL_US', label: 'Football Americano' },
  { value: 'FOOTBALL_SOCCER', label: 'Fútbol Soccer' },
  { value: 'BASKETBALL', label: 'Básquetbol' },
  { value: 'TENNIS', label: 'Tenis' },
  { value: 'BOXING', label: 'Boxeo' },
  { value: 'CROSSFIT', label: 'CrossFit' },
  { value: 'POWERLIFTING', label: 'Powerlifting' },
  { value: 'HYROX', label: 'HYROX' },
];

const OBJECTIVES: {
  value: Objective;
  title: string;
  emoji: string;
}[] = [
  { value: 'WEIGHT_LOSS', title: 'Bajar grasa', emoji: '🔥' },
  { value: 'MUSCLE_GAIN', title: 'Ganar músculo', emoji: '💪' },
  { value: 'MAINTENANCE', title: 'Mantenimiento', emoji: '⚖️' },
  { value: 'STRENGTH', title: 'Fuerza', emoji: '🏋️' },
  { value: 'ENDURANCE', title: 'Resistencia', emoji: '🏃' },
  { value: 'GENERAL_FITNESS', title: 'Fitness general', emoji: '🤸' },
];

const LEVELS: { value: Level; label: string }[] = [
  { value: 'BEGINNER', label: 'Principiante' },
  { value: 'INTERMEDIATE', label: 'Intermedio' },
  { value: 'ADVANCED', label: 'Avanzado' },
];

const ACTIVITY_LEVELS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentario' },
  { value: 'light', label: 'Ligero' },
  { value: 'moderate', label: 'Moderado' },
  { value: 'high', label: 'Alto' },
  { value: 'very_high', label: 'Muy alto' },
];

const INJURIES: { value: string; label: string }[] = [
  { value: 'knee', label: 'Rodilla' },
  { value: 'lower_back', label: 'Lumbares' },
  { value: 'shoulder', label: 'Hombro' },
  { value: 'neck', label: 'Cuello' },
  { value: 'wrist', label: 'Muñeca' },
  { value: 'ankle', label: 'Tobillo' },
  { value: 'hip', label: 'Cadera' },
  { value: 'none', label: 'Ninguna' },
];

const DIETARY = [
  'Vegetariano',
  'Vegano',
  'Sin lactosa',
  'Sin gluten',
  'Sin cerdo',
  'Kosher',
  'Halal',
  'Ninguna',
];

const ALLERGIES = [
  'Nueces',
  'Mariscos',
  'Huevos',
  'Lácteos',
  'Soja',
  'Gluten',
  'Ninguna',
];

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: 'Masculino' },
  { value: 'FEMALE', label: 'Femenino' },
  { value: 'OTHER', label: 'Otro' },
];

const TOTAL_STEPS = 5;

/* ─────────────────────────────────────────────────────────────
 * Wizard component
 * ─────────────────────────────────────────────────────────────*/

interface Props {
  /**
   * Initial value from `/auth/me` → user.fitness_profile. The backend stores
   * this as a raw JSON blob (Prisma Json), so we accept an untyped dict and
   * only pick the keys we recognize via spread-merge with EMPTY_DRAFT.
   */
  initial?: Record<string, unknown> | null;
}

export function FitnessProfileWizard({ initial }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const { refreshMe } = useAuth();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<FitnessProfileDraft>(EMPTY_DRAFT);

  /* Hydrate once from localStorage (takes precedence) or initial server data. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FitnessProfileDraft>;
        setDraft({ ...EMPTY_DRAFT, ...parsed });
        return;
      }
    } catch {
      /* ignore */
    }
    if (initial && typeof initial === 'object') {
      // Trust-but-verify: the backend stores this as an opaque JSON blob.
      // We merge optimistically — unknown keys are harmless, missing ones
      // keep EMPTY_DRAFT defaults.
      setDraft({ ...EMPTY_DRAFT, ...(initial as Partial<FitnessProfileDraft>) });
    }
    // We intentionally run this once. `initial` may arrive late but if the
    // user has already started editing we don't want to clobber their work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Persist on every change. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* quota; ignore */
    }
  }, [draft]);

  const update = <K extends keyof FitnessProfileDraft>(
    key: K,
    value: FitnessProfileDraft[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));

  const toggleInList = (key: 'injuries' | 'dietary' | 'allergies', v: string) => {
    // "none" (injuries) / "Ninguna" (dietary, allergies) is exclusive with the rest.
    const NONE: Record<typeof key, string> = {
      injuries: 'none',
      dietary: 'Ninguna',
      allergies: 'Ninguna',
    };
    const none = NONE[key];
    setDraft((d) => {
      const list = d[key];
      if (v === none) {
        return { ...d, [key]: list.includes(none) ? [] : [none] };
      }
      const next = list.includes(v)
        ? list.filter((x) => x !== v)
        : [...list.filter((x) => x !== none), v];
      return { ...d, [key]: next };
    });
  };

  /* ── Per-step validity ───────────────────────────────────── */
  const stepValid = useMemo(() => {
    switch (step) {
      case 1: {
        const age = Number(draft.age);
        const h = Number(draft.height_cm);
        const w = Number(draft.weight_kg);
        return (
          age >= 6 &&
          age <= 99 &&
          !!draft.gender &&
          h >= 100 &&
          h <= 230 &&
          w >= 30 &&
          w <= 250
        );
      }
      case 2:
        if (!draft.user_type) return false;
        if (draft.user_type === 'ATHLETE' && !draft.discipline) return false;
        return true;
      case 3:
        return !!(draft.objective && draft.level && draft.activity_level);
      case 4:
        return (
          draft.days_per_week >= 2 &&
          draft.days_per_week <= 6 &&
          draft.session_duration_min >= 30 &&
          draft.session_duration_min <= 120
        );
      case 5:
        // Step 5 fields are all optional; "Guardar" always enabled.
        return draft.notes.length <= 500;
      default:
        return false;
    }
  }, [step, draft]);

  /* ── Save mutation ───────────────────────────────────────── */
  const save = useMutation({
    mutationFn: async () => {
      // Shape the payload exactly as mergeProfile expects. "none" in injuries
      // means "no injuries" — send an empty array server-side.
      const injuries =
        draft.injuries.length === 1 && draft.injuries[0] === 'none'
          ? []
          : draft.injuries;
      const dietary =
        draft.dietary.length === 1 && draft.dietary[0] === 'Ninguna'
          ? []
          : draft.dietary.filter((x) => x !== 'Ninguna');
      const allergies =
        draft.allergies.length === 1 && draft.allergies[0] === 'Ninguna'
          ? []
          : draft.allergies.filter((x) => x !== 'Ninguna');

      const fitness_profile = {
        age: Number(draft.age),
        gender: draft.gender,
        height_cm: Number(draft.height_cm),
        weight_kg: Number(draft.weight_kg),
        user_type: draft.user_type,
        ...(draft.user_type === 'ATHLETE' && draft.discipline
          ? { discipline: draft.discipline }
          : {}),
        objective: draft.objective,
        level: draft.level,
        activity_level: draft.activity_level,
        days_per_week: draft.days_per_week,
        session_duration_min: draft.session_duration_min,
        injuries,
        // Equipment defaults to gym-available for now; the HOME-flow can set
        // this via a future step. `available_equipment` is required by the
        // AI endpoint only when location=HOME, so [] is a safe default.
        available_equipment: [] as string[],
        dietary_restrictions: dietary,
        allergies,
        notes: draft.notes.trim() || undefined,
      };

      // Preferred endpoint (to be added backend-side). Fall back to the
      // generic /users/me PATCH shape used by portalApi.updateProfile.
      try {
        const res = await api.patch('/users/me/fitness-profile', fitness_profile);
        return res.data;
      } catch (err) {
        const norm = normalizeError(err) as ApiError;
        if (norm.status === 404) {
          const res = await api.patch('/users/me', { fitness_profile });
          return res.data;
        }
        throw err;
      }
    },
    onSuccess: () => {
      toast.success('Perfil fitness guardado. Generando tu rutina…');
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      // refreshMe sincroniza el AuthContext (separado de React Query) — sin
      // esto, el banner "Completa tu perfil" sigue saliendo aunque el flag
      // ya esté true en el backend.
      refreshMe();
      router.push('/portal/rutinas');
    },
    onError: (err) => {
      const norm = normalizeError(err) as ApiError;
      toast.error(norm.message || 'No pudimos guardar tu perfil.');
    },
  });

  const goNext = () => {
    if (!stepValid) return;
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
    else save.mutate();
  };
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const progressPct = (step / TOTAL_STEPS) * 100;

  return (
    <section className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-5 sm:p-6 space-y-6">
      {/* ── Header & progress ─────────────────────────────── */}
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg font-semibold text-slate-900">Perfil fitness</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              5 pasos rápidos. Nuestro motor lo usa para generar rutinas y
              planes de comida personalizados para ti.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {step}/{TOTAL_STEPS}
          </span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-sky-400 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      {/* ── Step body ─────────────────────────────────────── */}
      <div className="min-h-[260px]">
        {step === 1 && <StepAboutYou draft={draft} update={update} />}
        {step === 2 && (
          <StepTrainingType draft={draft} update={update} />
        )}
        {step === 3 && <StepGoalLevel draft={draft} update={update} />}
        {step === 4 && <StepAvailability draft={draft} update={update} />}
        {step === 5 && (
          <StepRestrictions
            draft={draft}
            update={update}
            toggleInList={toggleInList}
          />
        )}
      </div>

      {/* ── Nav ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 1 || save.isPending}
          className="inline-flex items-center h-10 px-4 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Atrás
        </button>
        {step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={goNext}
            disabled={!stepValid}
            className="inline-flex items-center h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-300 disabled:cursor-not-allowed text-sm font-semibold transition shadow-sm"
          >
            Continuar
            <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={!stepValid || save.isPending}
            className="inline-flex items-center h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-300 disabled:cursor-not-allowed text-sm font-semibold transition shadow-sm"
          >
            {save.isPending ? 'Guardando…' : 'Guardar perfil'}
          </button>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Step components — kept in the same file to avoid churn.
 * Each takes the draft + a typed update() setter.
 * ─────────────────────────────────────────────────────────────*/

interface StepProps {
  draft: FitnessProfileDraft;
  update: <K extends keyof FitnessProfileDraft>(
    key: K,
    value: FitnessProfileDraft[K],
  ) => void;
}

function StepHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-1">
      <h3 className="font-display text-xl font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

function StepAboutYou({ draft, update }: StepProps) {
  return (
    <div className="space-y-5">
      <StepHeading
        title="Sobre ti"
        subtitle="Necesitamos tus datos básicos para calcular tu plan (Mifflin-St Jeor)."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <LightField id="fp_age" label="Edad">
          <input
            id="fp_age"
            className={INPUT_CLS}
            type="number"
            min={6}
            max={99}
            inputMode="numeric"
            value={draft.age === '' ? '' : String(draft.age)}
            onChange={(e) =>
              update(
                'age',
                e.target.value === '' ? '' : Number(e.target.value),
              )
            }
            placeholder="28"
          />
        </LightField>

        <LightField label="Género">
          <div className="flex flex-wrap gap-2">
            {GENDERS.map((g) => {
              const active = draft.gender === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => update('gender', g.value)}
                  className={cn(
                    'h-11 flex-1 min-w-[90px] rounded-xl border px-3 text-sm font-medium transition-colors',
                    active
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </LightField>

        <LightField id="fp_height" label="Altura (cm)">
          <input
            id="fp_height"
            className={INPUT_CLS}
            type="number"
            min={100}
            max={230}
            inputMode="numeric"
            value={draft.height_cm === '' ? '' : String(draft.height_cm)}
            onChange={(e) =>
              update(
                'height_cm',
                e.target.value === '' ? '' : Number(e.target.value),
              )
            }
            placeholder="175"
          />
        </LightField>

        <LightField id="fp_weight" label="Peso (kg)">
          <input
            id="fp_weight"
            className={INPUT_CLS}
            type="number"
            min={30}
            max={250}
            inputMode="decimal"
            value={draft.weight_kg === '' ? '' : String(draft.weight_kg)}
            onChange={(e) =>
              update(
                'weight_kg',
                e.target.value === '' ? '' : Number(e.target.value),
              )
            }
            placeholder="72"
          />
        </LightField>
      </div>
    </div>
  );
}

function StepTrainingType({ draft, update }: StepProps) {
  return (
    <div className="space-y-5">
      <StepHeading
        title="Tu tipo de entrenamiento"
        subtitle="Esto define la estructura base de tu rutina."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {USER_TYPES.map(({ value, title, sub, Icon }) => {
          const active = draft.user_type === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => update('user_type', value)}
              className={cn(
                'flex items-start gap-3 rounded-2xl ring-1 p-4 text-left transition-colors',
                active
                  ? 'ring-blue-500 bg-blue-50 shadow-sm'
                  : 'ring-slate-200 bg-slate-50 hover:bg-white hover:ring-slate-300',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  active
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-white ring-1 ring-slate-200 text-slate-500',
                )}
              >
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <div className={cn('font-semibold', active ? 'text-blue-900' : 'text-slate-900')}>{title}</div>
                <div className={cn('text-xs', active ? 'text-blue-700' : 'text-slate-500')}>{sub}</div>
              </div>
            </button>
          );
        })}
      </div>

      {draft.user_type === 'ATHLETE' && (
        <LightField id="fp_discipline" label="Disciplina" className="pt-2">
          <select
            id="fp_discipline"
            value={draft.discipline ?? ''}
            onChange={(e) =>
              update('discipline', e.target.value as FitnessProfileDraft['discipline'])
            }
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
          >
            <option value="">Elige tu deporte…</option>
            {DISCIPLINES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </LightField>
      )}
    </div>
  );
}

function StepGoalLevel({ draft, update }: StepProps) {
  return (
    <div className="space-y-6">
      <StepHeading
        title="Tu objetivo y nivel"
        subtitle="Afina el volumen e intensidad."
      />

      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
          Objetivo
        </div>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
          {OBJECTIVES.map((o) => {
            const active = draft.objective === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => update('objective', o.value)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-xl ring-1 p-3 text-left transition-colors',
                  active
                    ? 'ring-blue-500 bg-blue-50 shadow-sm'
                    : 'ring-slate-200 bg-slate-50 hover:bg-white hover:ring-slate-300',
                )}
              >
                <span className="text-xl">{o.emoji}</span>
                <span className={cn('text-sm font-semibold', active ? 'text-blue-900' : 'text-slate-900')}>{o.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
          Nivel
        </div>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => {
            const active = draft.level === l.value;
            return (
              <button
                key={l.value}
                type="button"
                onClick={() => update('level', l.value)}
                className={cn(
                  'h-10 rounded-full ring-1 px-4 text-sm font-semibold transition-colors',
                  active
                    ? 'ring-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                    : 'ring-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {l.label}
              </button>
            );
          })}
        </div>
      </div>

      <LightField id="fp_activity" label="Nivel de actividad fuera del gym">
        <select
          id="fp_activity"
          value={draft.activity_level}
          onChange={(e) =>
            update('activity_level', e.target.value as ActivityLevel)
          }
          className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
        >
          <option value="">Elige…</option>
          {ACTIVITY_LEVELS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </LightField>
    </div>
  );
}

function StepAvailability({ draft, update }: StepProps) {
  return (
    <div className="space-y-6">
      <StepHeading
        title="Tu disponibilidad"
        subtitle="Honesto vence a ambicioso — mejor consistencia que volumen."
      />

      <SliderRow
        label="Días por semana"
        min={2}
        max={6}
        value={draft.days_per_week}
        onChange={(v) => update('days_per_week', v)}
        renderValue={(v) => `${v} día${v === 1 ? '' : 's'}`}
      />

      <SliderRow
        label="Duración por sesión"
        min={30}
        max={120}
        step={5}
        value={draft.session_duration_min}
        onChange={(v) => update('session_duration_min', v)}
        renderValue={(v) => `${v} min`}
      />
    </div>
  );
}

function SliderRow({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  renderValue,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  renderValue: (v: number) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          {label}
        </span>
        <span className="font-display text-2xl font-semibold text-blue-600 tabular-nums">
          {renderValue(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-600"
      />
      <div className="flex justify-between text-[11px] text-slate-400">
        <span>{renderValue(min)}</span>
        <span>{renderValue(max)}</span>
      </div>
    </div>
  );
}

interface StepRestrictionsProps extends StepProps {
  toggleInList: (
    key: 'injuries' | 'dietary' | 'allergies',
    v: string,
  ) => void;
}

function StepRestrictions({
  draft,
  update,
  toggleInList,
}: StepRestrictionsProps) {
  return (
    <div className="space-y-6">
      <StepHeading
        title="Restricciones"
        subtitle="Usamos esto para adaptar ejercicios y meal-plans. Todos los campos son opcionales."
      />

      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Lesiones / molestias
        </div>
        <p className="text-[11px] text-slate-400 mb-2">
          Evitamos ejercicios que comprometan estas zonas al generar tu rutina.
        </p>
        <div className="flex flex-wrap gap-2">
          {INJURIES.map((i) => {
            const active = draft.injuries.includes(i.value);
            return (
              <button
                key={i.value}
                type="button"
                onClick={() => toggleInList('injuries', i.value)}
                className={cn(
                  'h-9 rounded-full ring-1 px-3 text-xs font-semibold transition-colors',
                  active
                    ? 'ring-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                    : 'ring-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {i.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Preferencia alimenticia
        </div>
        <p className="text-[11px] text-slate-400 mb-2">
          Filtramos ingredientes del plan de comidas. No genera dietas nuevas — excluye lo que no comes.
        </p>
        <div className="flex flex-wrap gap-2">
          {DIETARY.map((tag) => {
            const active = draft.dietary.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleInList('dietary', tag)}
                className={cn(
                  'h-9 rounded-full ring-1 px-3 text-xs font-semibold transition-colors',
                  active
                    ? 'ring-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                    : 'ring-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Alergias
        </div>
        <p className="text-[11px] text-slate-400 mb-2">
          Excluidas automáticamente del plan. Marca "Ninguna" si no tienes.
        </p>
        <div className="flex flex-wrap gap-2">
          {ALLERGIES.map((a) => {
            const active = draft.allergies.includes(a);
            return (
              <button
                key={a}
                type="button"
                onClick={() => toggleInList('allergies', a)}
                className={cn(
                  'h-9 rounded-full ring-1 px-3 text-xs font-semibold transition-colors',
                  active
                    ? 'ring-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                    : 'ring-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {a}
              </button>
            );
          })}
        </div>
      </div>

      <LightField
        id="fp_notes"
        label="Notas (opcional)"
        hint={`${draft.notes.length}/500`}
      >
        <textarea
          id="fp_notes"
          value={draft.notes}
          onChange={(e) => update('notes', e.target.value.slice(0, 500))}
          rows={3}
          maxLength={500}
          placeholder="Cualquier cosa relevante: cirugías recientes, preferencias, etc."
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
        />
      </LightField>

      <div className="flex items-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 p-3 text-xs text-blue-900">
        <Dumbbell size={14} className="text-blue-600" />
        Al guardar, generaremos tu primera rutina con IA basada en este perfil.
      </div>
    </div>
  );
}
