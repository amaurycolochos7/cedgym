'use client';

/* eslint-disable react/no-unescaped-entities */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dumbbell,
  User as UserIcon,
  Users as UsersIcon,
  Baby,
  Trophy,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Heart,
  Utensils,
  Target,
} from 'lucide-react';
import { api, normalizeError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import type { ApiError } from '@/lib/schemas';
import { SelfieCapture } from '@/components/portal/selfie-capture';

/* Light-theme primitives — local so we don't pull the dark shared <Button>/<Input>/<Field>. */
const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const TEXTAREA_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none resize-y min-h-[88px]';
const LABEL_CLS =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600';
const CHIP_BASE =
  'h-9 rounded-full ring-1 px-3 text-xs font-semibold transition-colors';
const CHIP_ACTIVE = 'ring-blue-600 bg-blue-600 text-white hover:bg-blue-700';
const CHIP_INACTIVE = 'ring-slate-300 bg-white text-slate-700 hover:bg-slate-50';

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
 * Types — superset que cubre rutina + nutrición. El submit
 * hace dos PATCH en paralelo (routine-profile + nutrition-profile)
 * proyectando solo los campos relevantes a cada uno.
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
  // Principales
  | 'FOOTBALL_SOCCER'
  | 'FOOTBALL_US'
  | 'BASKETBALL'
  | 'TENNIS'
  | 'SWIMMING'
  | 'BASEBALL'
  | 'VOLLEYBALL'
  // Otros
  | 'BOXING'
  | 'CROSSFIT'
  | 'POWERLIFTING'
  | 'HYROX'
  | 'STRENGTH'
  | 'FUNCTIONAL';
type Gender = 'MALE' | 'FEMALE' | 'OTHER';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'very_high';
type YearsTraining = 'NONE' | 'LT_1' | '1_2' | '3_5' | 'GT_5';
type TrainingStyle = 'HEAVY' | 'HYPERTROPHY' | 'CIRCUITS' | 'MIXED';
type MuscleGroup =
  | 'CHEST' | 'BACK' | 'SHOULDERS' | 'ARMS'
  | 'GLUTES' | 'QUADS' | 'HAMSTRINGS' | 'CALVES'
  | 'CORE' | 'FULL_BODY';
type GoalType =
  | 'AESTHETICS' | 'DEFINITION' | 'BULKING' | 'RECOMP'
  | 'BODYBUILDING' | 'POWERLIFTING_GOAL' | 'HYROX_GOAL' | 'CROSSFIT_GOAL'
  | 'CALISTHENICS' | 'MARATHON' | 'PERFORMANCE'
  | 'HEALTH' | 'POSTURE' | 'ENERGY'
  | 'POST_INJURY' | 'POST_PARTUM'
  | 'EVENT' | 'COMPETITION';
type TimeOfDay = 'MORNING' | 'MIDDAY' | 'AFTERNOON' | 'EVENING' | 'VARIES';
type Location = 'GYM' | 'HOME' | 'BOTH';
type Cooker = 'SELF' | 'FAMILY' | 'EATS_OUT';
type CookingTime = 'LOW' | 'MEDIUM' | 'HIGH';
type Budget = 'LOW' | 'MEDIUM' | 'HIGH';
type FoodRelationship = 'CONTROLLED' | 'ANXIOUS' | 'SOCIAL' | 'EMOTIONAL' | 'BORED';
type Alcohol = 'NONE' | 'SOCIAL' | 'REGULAR';

interface Draft {
  // ── Step 1: sobre ti ─────────────────────────────
  // Datos requeridos para la membresía (nombre completo INE, fecha de
  // nacimiento) los integramos aquí para no obligar al socio a un
  // segundo flujo de "completa tus datos" después del wizard.
  full_name: string;
  birth_date: string; // YYYY-MM-DD
  age: number | ''; // derivado de birth_date — lo mantenemos para el AI
  gender: Gender | '';
  height_cm: number | '';
  weight_kg: number | '';
  activity_level: ActivityLevel | '';
  years_training: YearsTraining | '';

  // ── Step 2: tu tipo de entrenamiento ────────────
  user_type: UserType | '';
  discipline: Discipline | '';
  level: Level | '';
  injuries: string[];
  mobility_limitations: string[];

  // ── Step 3: tu meta (motivación) ────────────────
  objective: Objective | '';
  motivation: string;
  goal_type: GoalType | '';
  goal_deadline: string;
  past_experience: string;

  // ── Step 4: cómo te gusta entrenar ──────────────
  training_style: TrainingStyle | '';
  likes: string[];
  dislikes: string[];
  priority_muscles: MuscleGroup[];
  deprioritized_muscles: MuscleGroup[];
  days_per_week: number;
  session_duration_min: number;
  time_of_day: TimeOfDay | '';
  location: Location | '';
  available_equipment: string[];

  // ── Step 5: cómo comes ──────────────────────────
  nutrition_objective: Objective | '';
  meals_per_day: 3 | 4 | 5;
  cooker: Cooker | '';
  cooking_time: CookingTime | '';
  budget: Budget | '';
  country: string;
  food_relationship: FoodRelationship | '';
  nutrition_motivation: string;

  // ── Step 6: restricciones y hábitos ─────────────
  dietary: string[];
  allergies: string[];
  disliked_foods: string[];
  supplements: string[];
  water_liters_per_day: number | '';
  coffee: boolean | null;
  alcohol: Alcohol | '';
  free_meals_per_week: number;
  notes: string;
}

const DRAFT_KEY = 'cedgym-fitness-profile-draft-v2';

const EMPTY_DRAFT: Draft = {
  full_name: '', birth_date: '',
  age: '', gender: '', height_cm: '', weight_kg: '', activity_level: '', years_training: '',
  user_type: '', discipline: '', level: '', injuries: [], mobility_limitations: [],
  objective: '', motivation: '', goal_type: '', goal_deadline: '', past_experience: '',
  training_style: '', likes: [], dislikes: [], priority_muscles: [], deprioritized_muscles: [],
  days_per_week: 4, session_duration_min: 60, time_of_day: '', location: '', available_equipment: [],
  nutrition_objective: '', meals_per_day: 5, cooker: '', cooking_time: '', budget: '', country: 'MX',
  food_relationship: '', nutrition_motivation: '',
  dietary: [], allergies: [], disliked_foods: [],
  supplements: [], water_liters_per_day: '', coffee: null, alcohol: '', free_meals_per_week: 1,
  notes: '',
};

// ── Catalogs ──────────────────────────────────────────────────

const USER_TYPES: { value: UserType; title: string; sub: string; Icon: typeof UserIcon }[] = [
  { value: 'ADULT',   title: 'Adulto',         sub: '18 – 55 años', Icon: UserIcon },
  { value: 'SENIOR',  title: 'Adulto mayor',    sub: '55+ años',     Icon: UsersIcon },
  { value: 'KID',     title: 'Niño / Juvenil',  sub: '6 – 17 años',  Icon: Baby },
  { value: 'ATHLETE', title: 'Deportista',      sub: 'Entrena un deporte', Icon: Trophy },
];

// Deportes destacados — los que el coach trabaja con más socios. Se
// muestran como chips grandes en el wizard, cada uno con su emoji.
const PRIMARY_DISCIPLINES: { value: Discipline; label: string; emoji: string }[] = [
  { value: 'FOOTBALL_SOCCER', label: 'Fútbol soccer', emoji: '⚽' },
  { value: 'FOOTBALL_US',     label: 'Fútbol americano', emoji: '🏈' },
  { value: 'BASKETBALL',      label: 'Básquetbol', emoji: '🏀' },
  { value: 'TENNIS',          label: 'Tenis', emoji: '🎾' },
  { value: 'SWIMMING',        label: 'Natación', emoji: '🏊' },
  { value: 'BASEBALL',        label: 'Béisbol', emoji: '⚾' },
  { value: 'VOLLEYBALL',      label: 'Voleibol', emoji: '🏐' },
];

// Otras disciplinas — viven detrás de un acordeón "Otros deportes y
// disciplinas". Mantenemos disponibles las que socios actuales ya
// tienen seleccionadas para no romperles el perfil.
const OTHER_DISCIPLINES: { value: Discipline; label: string; emoji: string }[] = [
  { value: 'BOXING',       label: 'Boxeo', emoji: '🥊' },
  { value: 'CROSSFIT',     label: 'CrossFit', emoji: '🏋️' },
  { value: 'POWERLIFTING', label: 'Powerlifting', emoji: '🏋️‍♂️' },
  { value: 'HYROX',        label: 'HYROX', emoji: '🏃' },
  { value: 'STRENGTH',     label: 'Fuerza / hipertrofia', emoji: '💪' },
  { value: 'FUNCTIONAL',   label: 'Funcional', emoji: '🤸' },
];

const OBJECTIVES: { value: Objective; title: string; emoji: string }[] = [
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

const YEARS_TRAINING: { value: YearsTraining; label: string }[] = [
  { value: 'NONE', label: 'Nunca antes' },
  { value: 'LT_1', label: 'Menos de 1 año' },
  { value: '1_2', label: '1 a 2 años' },
  { value: '3_5', label: '3 a 5 años' },
  { value: 'GT_5', label: 'Más de 5 años' },
];

const TRAINING_STYLES: { value: TrainingStyle; label: string; sub: string }[] = [
  { value: 'HEAVY', label: 'Pesado', sub: 'pocas reps, cargas altas' },
  { value: 'HYPERTROPHY', label: 'Volumen', sub: '8-15 reps, ver crecer músculo' },
  { value: 'CIRCUITS', label: 'Circuitos', sub: 'metcon, densidad' },
  { value: 'MIXED', label: 'Mixto', sub: 'alterna estilos' },
];

const MUSCLES: { value: MuscleGroup; label: string }[] = [
  { value: 'CHEST', label: 'Pecho' },
  { value: 'BACK', label: 'Espalda' },
  { value: 'SHOULDERS', label: 'Hombro' },
  { value: 'ARMS', label: 'Brazo' },
  { value: 'GLUTES', label: 'Glúteo' },
  { value: 'QUADS', label: 'Cuádriceps' },
  { value: 'HAMSTRINGS', label: 'Femoral' },
  { value: 'CALVES', label: 'Pantorrilla' },
  { value: 'CORE', label: 'Core' },
  { value: 'FULL_BODY', label: 'Cuerpo completo' },
];

// Agrupados por categoría — el usuario los ve en bloques con sub-header
// para que no satura. Cada chip alimenta al prompt con instrucciones
// concretas (ver GOAL_TYPE_LABELS en ai-routines.js).
const GOAL_TYPE_GROUPS: { title: string; items: { value: GoalType; label: string }[] }[] = [
  {
    title: 'Cuerpo y composición',
    items: [
      { value: 'AESTHETICS', label: 'Estética general' },
      { value: 'DEFINITION', label: 'Definición / déficit' },
      { value: 'BULKING', label: 'Volumen / bulking' },
      { value: 'RECOMP', label: 'Recomposición' },
    ],
  },
  {
    title: 'Competir / desempeño',
    items: [
      { value: 'BODYBUILDING', label: 'Fisiculturismo' },
      { value: 'POWERLIFTING_GOAL', label: 'Powerlifting (SBD)' },
      { value: 'HYROX_GOAL', label: 'HYROX' },
      { value: 'CROSSFIT_GOAL', label: 'CrossFit' },
      { value: 'CALISTHENICS', label: 'Calistenia (skills)' },
      { value: 'MARATHON', label: 'Maratón / running' },
      { value: 'PERFORMANCE', label: 'Rendimiento deportivo' },
    ],
  },
  {
    title: 'Salud y bienestar',
    items: [
      { value: 'HEALTH', label: 'Salud general' },
      { value: 'POSTURE', label: 'Postura / dolor' },
      { value: 'ENERGY', label: 'Energía / vitalidad' },
      { value: 'POST_INJURY', label: 'Recuperación de lesión' },
      { value: 'POST_PARTUM', label: 'Post-parto' },
    ],
  },
  {
    title: 'Evento concreto',
    items: [
      { value: 'EVENT', label: 'Boda / vacaciones / fecha' },
    ],
  },
];

const TIME_OF_DAYS: { value: TimeOfDay; label: string }[] = [
  { value: 'MORNING', label: 'Mañana' },
  { value: 'MIDDAY', label: 'Mediodía' },
  { value: 'AFTERNOON', label: 'Tarde' },
  { value: 'EVENING', label: 'Noche' },
  { value: 'VARIES', label: 'Varía' },
];

const LOCATIONS: { value: Location; label: string }[] = [
  { value: 'GYM', label: 'Gimnasio' },
  { value: 'HOME', label: 'Casa' },
  { value: 'BOTH', label: 'Ambos' },
];

const COMMON_LIKES = [
  'Pesas pesadas', 'Hipertrofia', 'Funcional', 'Cardio', 'Circuitos',
  'Al aire libre', 'Grupales', 'Calistenia', 'Yoga', 'Estiramiento',
];
const COMMON_DISLIKES = [
  'Correr largo', 'Cardio en máquina', 'Saltos', 'Sentadilla profunda',
  'Press de banca', 'Estiramientos largos', 'Caminadora', 'Bicicleta',
];

const COMMON_EQUIPMENT = [
  'Mancuernas', 'Bandas elásticas', 'Barra', 'Pesa rusa', 'TRX',
  'Step', 'Banco', 'Cuerda', 'Bicicleta', 'Caminadora',
];

const COOKERS: { value: Cooker; label: string }[] = [
  { value: 'SELF', label: 'Yo cocino' },
  { value: 'FAMILY', label: 'Cocina alguien en casa' },
  { value: 'EATS_OUT', label: 'Como fuera / pido' },
];

const COOKING_TIMES: { value: CookingTime; label: string }[] = [
  { value: 'LOW', label: 'Poco (<15 min)' },
  { value: 'MEDIUM', label: '15-30 min' },
  { value: 'HIGH', label: 'Más de 30 min' },
];

const BUDGETS: { value: Budget; label: string; sub: string }[] = [
  { value: 'LOW', label: 'Económico', sub: 'pollo, arroz, frijol, huevo' },
  { value: 'MEDIUM', label: 'Medio', sub: 'agregar salmón, frutos rojos' },
  { value: 'HIGH', label: 'Premium', sub: 'sin restricción' },
];

const FOOD_RELATIONSHIPS: { value: FoodRelationship; label: string }[] = [
  { value: 'CONTROLLED', label: 'Controlado' },
  { value: 'ANXIOUS', label: 'Ansioso' },
  { value: 'SOCIAL', label: 'Social' },
  { value: 'EMOTIONAL', label: 'Emocional' },
  { value: 'BORED', label: 'Me aburre cocinar' },
];

const ALCOHOLS: { value: Alcohol; label: string }[] = [
  { value: 'NONE', label: 'No tomo' },
  { value: 'SOCIAL', label: 'Social' },
  { value: 'REGULAR', label: 'Regular' },
];

const INJURIES_LIST: { value: string; label: string }[] = [
  { value: 'knee', label: 'Rodilla' },
  { value: 'lower_back', label: 'Lumbares' },
  { value: 'shoulder', label: 'Hombro' },
  { value: 'neck', label: 'Cuello' },
  { value: 'wrist', label: 'Muñeca' },
  { value: 'ankle', label: 'Tobillo' },
  { value: 'hip', label: 'Cadera' },
  { value: 'none', label: 'Ninguna' },
];

const MOBILITY_OPTIONS = [
  'Cadera tiesa', 'Hombro limitado', 'Tobillo rígido', 'Espalda alta tensa',
  'Poco rango sentadilla', 'Sin limitación',
];

const DIETARY = ['Vegetariano', 'Vegano', 'Sin lactosa', 'Sin gluten', 'Sin cerdo', 'Kosher', 'Halal', 'Ninguna'];
const ALLERGIES = ['Nueces', 'Mariscos', 'Huevos', 'Lácteos', 'Soja', 'Gluten', 'Ninguna'];
const COMMON_DISLIKED_FOODS = [
  'Brócoli', 'Coliflor', 'Pescado', 'Hígado', 'Champiñón', 'Cilantro',
  'Aguacate', 'Berenjena', 'Espinaca cocida',
];
const COMMON_SUPPLEMENTS = [
  'Whey protein', 'Creatina', 'Pre-entreno', 'Multivitamínico',
  'Omega 3', 'Vitamina D', 'Magnesio', 'BCAA',
];

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: 'Masculino' },
  { value: 'FEMALE', label: 'Femenino' },
  { value: 'OTHER', label: 'Otro' },
];

const TOTAL_STEPS = 6;

// ── Helpers de set/toggle en arrays ──────────────────────────
function toggleString(list: string[], v: string, exclusive?: string): string[] {
  if (exclusive && v === exclusive) {
    return list.includes(exclusive) ? [] : [exclusive];
  }
  if (list.includes(v)) return list.filter((x) => x !== v);
  return [...list.filter((x) => x !== exclusive), v];
}
function toggleEnum<T extends string>(list: T[], v: T, max?: number): T[] {
  if (list.includes(v)) return list.filter((x) => x !== v);
  if (max && list.length >= max) return list;
  return [...list, v];
}

/* ─────────────────────────────────────────────────────────────
 * Wizard component
 * ─────────────────────────────────────────────────────────────*/

interface Props {
  initial?: Record<string, unknown> | null;
}

export function FitnessProfileWizard({ initial }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const { refreshMe } = useAuth();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // Ref al contenedor del wizard. Cuando cambia de paso scrolleamos
  // a este punto para que el socio empiece desde arriba — sin esto
  // el usuario aterriza a media página del paso anterior.
  const sectionRef = useRef<HTMLElement>(null);

  // Tracking de selfie. La SelfieCapture sube directo (POST /users/me/selfie),
  // pero necesitamos saber si ya está cargada para validar el último paso.
  // Combinamos lo que diga /auth/me (selfie_url existente) con un flag
  // local para reflejar uploads de esta sesión sin esperar a refetch.
  const meQ = useQuery<{ user: { selfie_url?: string | null } }>({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
    staleTime: 0,
  });
  const [selfieJustUploaded, setSelfieJustUploaded] = useState(false);
  const hasSelfie = !!meQ.data?.user?.selfie_url || selfieJustUploaded;

  /* Hydrate once from localStorage (preferencia) o initial server data. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Draft>;
        setDraft({ ...EMPTY_DRAFT, ...parsed });
        return;
      }
    } catch {
      /* ignore */
    }
    if (initial && typeof initial === 'object') {
      // Trust-but-verify: el server guarda este JSON sin estructura dura.
      setDraft({ ...EMPTY_DRAFT, ...(initial as Partial<Draft>) });
    }
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

  /* Cuando avanzamos de paso, scrolleamos al top de la página.
     Skip en el primer mount (paso 1 inicial) para no causar un
     salto innecesario al cargar la página.

     Antes usábamos scrollIntoView({behavior:'smooth'}) sobre el
     section ref, pero iOS Safari y varios Android truenan ese API
     silenciosamente — el usuario quedaba al fondo del paso anterior.
     window.scrollTo es universal. requestAnimationFrame asegura que
     React ya commiteó el nuevo DOM antes de scrollear. */
  const isFirstStepRender = useRef(true);
  useEffect(() => {
    if (isFirstStepRender.current) {
      isFirstStepRender.current = false;
      return;
    }
    if (typeof window === 'undefined') return;
    requestAnimationFrame(() => {
      // Detect smooth-scroll support; iOS 15.3 y anteriores no lo
      // tienen y silenciosamente ignoran el call entero.
      const supportsSmooth =
        'scrollBehavior' in document.documentElement.style;
      if (supportsSmooth) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo(0, 0);
      }
    });
  }, [step]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /* ── Per-step validity ───────────────────────────────────────
     Devolvemos TODOS los errores del paso, no solo el primero.
     Si al socio le faltan 3 campos quiere ver los 3, no que los
     vaya descubriendo de uno en uno. También exportamos la lista
     `fields` para poder marcar cada input mal con un ring rojo.
  */
  const stepValidation = useMemo<{
    ok: boolean;
    errors: string[];
    fields: Set<string>;
  }>(() => {
    const errors: string[] = [];
    const fields = new Set<string>();
    const fail = (msg: string, field?: string) => {
      errors.push(msg);
      if (field) fields.add(field);
    };

    switch (step) {
      case 1: {
        // Nombre completo — requerido para la membresía (recibo, INE).
        if (!draft.full_name || !draft.full_name.trim()) {
          fail('Escribe tu nombre completo (como aparece en tu INE).', 'full_name');
        } else if (draft.full_name.trim().length < 5) {
          fail('Tu nombre completo parece muy corto — incluye apellidos.', 'full_name');
        }

        // Fecha de nacimiento — requerida para la membresía y de paso
        // calcula la edad para el AI.
        if (!draft.birth_date) {
          fail('Selecciona tu fecha de nacimiento.', 'birth_date');
        }

        // Edad (derivada de birth_date) — debe quedar en rango 6-99.
        if (draft.age === '' || draft.age == null) {
          // Si birth_date está pero age vacía, la fecha cae fuera del
          // rango 6-99 → mensaje útil.
          if (draft.birth_date) {
            fail('La edad calculada no es válida — revisa tu fecha de nacimiento (entre 6 y 99 años).', 'birth_date');
          }
        } else {
          const n = Number(draft.age);
          if (!Number.isFinite(n) || n < 6 || n > 99) {
            fail('Edad inválida — debe ser un número entre 6 y 99.', 'birth_date');
          }
        }

        // Género
        if (!draft.gender) fail('Selecciona tu género.', 'gender');

        // Altura — mínimo 80cm para acomodar niños chicos. Si está
        // en metros (entre 1 y 3) la auto-conversión del input ya la
        // pasó a cm cuando el campo perdió foco.
        if (draft.height_cm === '' || draft.height_cm == null) {
          fail('Escribe tu altura en cm (ej: 165).', 'height_cm');
        } else {
          const h = Number(draft.height_cm);
          if (!Number.isFinite(h)) {
            fail('Altura inválida.', 'height_cm');
          } else if (h < 80 || h > 250) {
            fail(
              `La altura debe ser un número en centímetros entre 80 y 250 (ej: 165). Tu valor: ${h}.`,
              'height_cm',
            );
          }
        }

        // Peso
        if (draft.weight_kg === '' || draft.weight_kg == null) {
          fail('Escribe tu peso en kg (ej: 65).', 'weight_kg');
        } else {
          const w = Number(draft.weight_kg);
          if (!Number.isFinite(w)) {
            fail('Peso inválido.', 'weight_kg');
          } else if (w < 20 || w > 300) {
            fail(
              `El peso debe ser entre 20 y 300 kg. Tu valor: ${w}.`,
              'weight_kg',
            );
          }
        }

        // Actividad
        if (!draft.activity_level) {
          fail('Selecciona tu nivel de actividad.', 'activity_level');
        }
        break;
      }
      case 2:
        if (!draft.user_type) fail('Selecciona tu tipo de entrenamiento.', 'user_type');
        if (draft.user_type === 'ATHLETE' && !draft.discipline) {
          fail('Selecciona tu disciplina deportiva.', 'discipline');
        }
        if (!draft.level) fail('Selecciona tu nivel (principiante, intermedio o avanzado).', 'level');
        break;
      case 3:
        if (!draft.objective) fail('Selecciona tu objetivo principal.', 'objective');
        break;
      case 4:
        if (!draft.location) fail('Selecciona dónde entrenas (gym, casa o ambos).', 'location');
        if (draft.days_per_week < 2 || draft.days_per_week > 6) {
          fail('Días por semana entre 2 y 6.', 'days_per_week');
        }
        if (draft.session_duration_min < 20 || draft.session_duration_min > 180) {
          fail('Duración por sesión entre 20 y 180 min.', 'session_duration_min');
        }
        break;
      case 5:
        break;
      case 6:
        if (draft.notes.length > 800) fail('Las notas son muy largas (máx 800 caracteres).', 'notes');
        if (!hasSelfie) {
          fail('Toma una selfie para que el staff te identifique al entrar al gym.', 'selfie');
        }
        break;
    }
    return { ok: errors.length === 0, errors, fields };
  }, [step, draft, hasSelfie]);

  /* ── Save mutation ───────────────────────────────────────── */
  const save = useMutation({
    mutationFn: async () => {
      // Build routine + nutrition payloads. Filtramos llaves vacías
      // para no mandar `"": ""` o arrays huecos al backend.
      const cleanArr = (arr: string[], exclusive?: string) => {
        if (arr.length === 1 && exclusive && arr[0] === exclusive) return [];
        return arr.filter((x) => x !== exclusive);
      };

      const shared: Record<string, unknown> = {};
      if (draft.age !== '')        shared.age = Number(draft.age);
      if (draft.gender)            shared.gender = draft.gender;
      if (draft.height_cm !== '')  shared.height_cm = Number(draft.height_cm);
      if (draft.weight_kg !== '')  shared.weight_kg = Number(draft.weight_kg);
      if (draft.activity_level)    shared.activity_level = draft.activity_level;

      const routinePayload: Record<string, unknown> = {
        ...shared,
        ...(draft.user_type ? { user_type: draft.user_type } : {}),
        ...(draft.user_type === 'ATHLETE' && draft.discipline ? { discipline: draft.discipline } : {}),
        ...(draft.objective ? { objective: draft.objective } : {}),
        ...(draft.level ? { level: draft.level } : {}),
        ...(draft.years_training ? { years_training: draft.years_training } : {}),
        ...(draft.training_style ? { training_style: draft.training_style } : {}),
        ...(draft.priority_muscles.length ? { priority_muscles: draft.priority_muscles } : {}),
        ...(draft.deprioritized_muscles.length ? { deprioritized_muscles: draft.deprioritized_muscles } : {}),
        ...(draft.likes.length ? { likes: draft.likes } : {}),
        ...(draft.dislikes.length ? { dislikes: draft.dislikes } : {}),
        days_per_week: draft.days_per_week,
        session_duration_min: draft.session_duration_min,
        ...(draft.time_of_day ? { time_of_day: draft.time_of_day } : {}),
        ...(draft.location ? { location: draft.location } : {}),
        ...(draft.available_equipment.length ? { available_equipment: draft.available_equipment } : {}),
        ...(cleanArr(draft.injuries, 'none').length ? { injuries: cleanArr(draft.injuries, 'none') } : {}),
        ...(cleanArr(draft.mobility_limitations, 'Sin limitación').length
          ? { mobility_limitations: cleanArr(draft.mobility_limitations, 'Sin limitación') } : {}),
        ...(draft.motivation.trim() ? { motivation: draft.motivation.trim() } : {}),
        ...(draft.goal_type ? { goal_type: draft.goal_type } : {}),
        ...(draft.goal_deadline.trim() ? { goal_deadline: draft.goal_deadline.trim() } : {}),
        ...(draft.past_experience.trim() ? { past_experience: draft.past_experience.trim() } : {}),
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      };

      const nutritionPayload: Record<string, unknown> = {
        ...shared,
        ...(draft.nutrition_objective || draft.objective
          ? { objective: draft.nutrition_objective || draft.objective }
          : {}),
        meals_per_day: draft.meals_per_day,
        ...(draft.cooker ? { cooker: draft.cooker } : {}),
        ...(draft.cooking_time ? { cooking_time: draft.cooking_time } : {}),
        ...(draft.budget ? { budget: draft.budget } : {}),
        ...(draft.country ? { country: draft.country } : {}),
        ...(cleanArr(draft.dietary, 'Ninguna').length
          ? { dietary_restrictions: cleanArr(draft.dietary, 'Ninguna') } : {}),
        ...(cleanArr(draft.allergies, 'Ninguna').length
          ? { allergies: cleanArr(draft.allergies, 'Ninguna') } : {}),
        ...(draft.disliked_foods.length ? { disliked_foods: draft.disliked_foods } : {}),
        ...(draft.supplements.length ? { supplements: draft.supplements } : {}),
        ...(draft.water_liters_per_day !== ''
          ? { water_liters_per_day: Number(draft.water_liters_per_day) } : {}),
        ...(draft.coffee !== null ? { coffee: draft.coffee } : {}),
        ...(draft.alcohol ? { alcohol: draft.alcohol } : {}),
        ...(typeof draft.free_meals_per_week === 'number'
          ? { free_meals_per_week: draft.free_meals_per_week } : {}),
        ...(draft.food_relationship ? { food_relationship: draft.food_relationship } : {}),
        ...(draft.nutrition_motivation.trim() ? { motivation: draft.nutrition_motivation.trim() } : {}),
      };

      // PATCH /auth/me con datos de membresía (nombre completo + fecha
      // de nacimiento). Lo hacemos PRIMERO en serie porque si falla
      // algún campo (ej. birth_date inválida) queremos detenernos
      // antes de tocar el perfil de fitness.
      const meUpdates: Record<string, unknown> = {};
      if (draft.full_name && draft.full_name.trim()) {
        meUpdates.full_name = draft.full_name.trim();
      }
      if (draft.birth_date) {
        meUpdates.birth_date = draft.birth_date;
      }
      if (Object.keys(meUpdates).length > 0) {
        try {
          await api.patch('/auth/me', meUpdates);
        } catch (e) {
          // Si /auth/me no acepta full_name/birth_date (versión vieja
          // del API), no bloqueamos — el banner de requisitos lo
          // captará después.
          const norm = normalizeError(e) as ApiError;
          if (norm.status !== 400 && norm.status !== 422) throw e;
        }
      }

      // Mandamos los dos PATCH de perfil en paralelo. Si uno falla, el
      // otro queda escrito — al usuario le dejamos volver a guardar.
      try {
        await Promise.all([
          api.patch('/users/me/routine-profile', routinePayload),
          api.patch('/users/me/nutrition-profile', nutritionPayload),
        ]);
      } catch (err) {
        // Si los endpoints nuevos no están desplegados (404), caemos
        // al legacy unificado para no bloquear al socio.
        const norm = normalizeError(err) as ApiError;
        if (norm.status === 404) {
          await api.patch('/users/me/fitness-profile', { ...routinePayload, ...nutritionPayload });
          return;
        }
        throw err;
      }
    },
    onSuccess: async () => {
      toast.success('Perfil guardado. Tu rutina ya está lista.');
      try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      try { await refreshMe(); } catch { /* navegamos igual */ }
      // Aterrizamos en el inicio (dashboard) en lugar de /portal/rutinas
      // — el socio quiere ver su home con todo listo, no que lo
      // empujemos directo a la rutina.
      router.push('/portal/dashboard');
    },
    onError: (err) => {
      const norm = normalizeError(err) as ApiError;
      toast.error(norm.message || 'No pudimos guardar tu perfil.');
    },
  });

  const stepValid = stepValidation.ok;
  const goNext = () => {
    if (!stepValid) return;
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
    else save.mutate();
  };
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const progressPct = (step / TOTAL_STEPS) * 100;

  return (
    <section
      ref={sectionRef}
      className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-5 sm:p-6 space-y-6 scroll-mt-20"
    >
      {/* Header & progress */}
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg font-semibold text-slate-900">Tu perfil</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {step === 1 && 'Sobre ti — datos básicos.'}
              {step === 2 && 'Tu tipo de entrenamiento.'}
              {step === 3 && 'Tu meta — el "para qué" de todo.'}
              {step === 4 && 'Cómo te gusta entrenar.'}
              {step === 5 && 'Cómo comes (alimentación).'}
              {step === 6 && 'Restricciones y hábitos.'}
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

      {/* Step body */}
      <div className="min-h-[320px]">
        {step === 1 && <Step1Basics draft={draft} update={update} />}
        {step === 2 && <Step2Type draft={draft} update={update} />}
        {step === 3 && <Step3Goal draft={draft} update={update} />}
        {step === 4 && <Step4Style draft={draft} update={update} />}
        {step === 5 && <Step5Food draft={draft} update={update} />}
        {step === 6 && (
          <Step6Habits
            draft={draft}
            update={update}
            hasSelfie={hasSelfie}
            onSelfieUploaded={() => {
              setSelfieJustUploaded(true);
              qc.invalidateQueries({ queryKey: ['auth', 'me'] });
            }}
          />
        )}
      </div>

      {/* Lista TODOS los errores del paso para que el socio pueda
          arreglarlos de una vez sin descubrirlos uno por uno. */}
      {!stepValid && stepValidation.errors.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <div className="font-semibold mb-1.5 flex items-center gap-2">
            <span>⚠</span>
            {stepValidation.errors.length === 1
              ? 'Falta un dato para continuar:'
              : `Faltan ${stepValidation.errors.length} datos para continuar:`}
          </div>
          <ul className="list-disc pl-5 space-y-0.5 leading-snug">
            {stepValidation.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Nav */}
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
 * Step components
 * ─────────────────────────────────────────────────────────────*/

interface StepProps {
  draft: Draft;
  update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}

function StepHeading({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="font-display text-xl font-semibold text-slate-900 flex items-center gap-2">
        {icon}{title}
      </h3>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

// ── Chip helpers ─────────────────────────────────────────────
function ChipRow({
  options, selected, onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={cn(CHIP_BASE, active ? CHIP_ACTIVE : CHIP_INACTIVE)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ChipRowEnum<T extends string>({
  options, selected, onToggle,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={cn(CHIP_BASE, active ? CHIP_ACTIVE : CHIP_INACTIVE)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SingleChoice<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string; sub?: string }[];
  value: T | '';
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-xl ring-1 p-3 text-left transition-colors',
              active
                ? 'ring-blue-500 bg-blue-50 shadow-sm'
                : 'ring-slate-200 bg-slate-50 hover:bg-white hover:ring-slate-300',
            )}
          >
            <span className={cn('text-sm font-semibold', active ? 'text-blue-900' : 'text-slate-900')}>
              {o.label}
            </span>
            {o.sub && (
              <span className={cn('text-[11px]', active ? 'text-blue-700' : 'text-slate-500')}>
                {o.sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Input numérico tolerante a formatos de entrada del usuario.
 *
 * Por qué este componente: con `<input type="number">` en mobile,
 * teclear "56,9" en un teléfono con teclado en español a veces se
 * descarta entero — el browser no lo acepta como número y devuelve "".
 * Con `<input type="text" inputMode="decimal">` el usuario puede
 * teclear cualquier carácter, normalizamos coma→punto, y devolvemos
 * un number al parent.
 *
 * Mantiene un STATE INTERNO con el texto literal tipeado para que
 * "56." (mid-typing) no se renderice como "56" haciendo perder el
 * punto al socio.
 */
function NumericInput({
  id,
  value,
  onChange,
  placeholder,
  decimal = false,
  maxLen = 6,
  onBlur,
  className,
}: {
  id?: string;
  value: number | '';
  onChange: (v: number | '') => void;
  placeholder?: string;
  decimal?: boolean;
  maxLen?: number;
  onBlur?: (raw: string) => void;
  className?: string;
}) {
  // text local = lo que el usuario está tipeando (puede tener "." al final)
  const [text, setText] = useState<string>(() =>
    value === '' || value == null ? '' : String(value),
  );
  // Sincronizar cuando el value externo cambia desde fuera (ej. auto-
  // conversión de altura). Solo si realmente difiere para no pisar
  // lo que el socio está escribiendo.
  useEffect(() => {
    const external = value === '' || value == null ? '' : String(value);
    const internalParsed = text === '' ? '' : Number(text.replace(',', '.'));
    if (external !== text && internalParsed !== value) {
      setText(external);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      id={id}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      className={className ?? INPUT_CLS}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        let raw = e.target.value.replace(',', '.');
        if (decimal) {
          // sólo dígitos y un único punto
          raw = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
        } else {
          raw = raw.replace(/\D/g, '');
        }
        if (raw.length > maxLen) raw = raw.slice(0, maxLen);
        setText(raw);
        if (raw === '' || raw === '.') {
          onChange('');
        } else {
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }
      }}
      onBlur={(e) => {
        if (onBlur) onBlur(e.target.value.replace(',', '.'));
      }}
    />
  );
}

// ── Step 1: Basics ───────────────────────────────────────────
function Step1Basics({ draft, update }: StepProps) {
  // Cuando cambia birth_date, recalculamos age en el draft. La edad
  // sigue siendo lo que el AI consume, pero el usuario teclea su
  // fecha (que también guardamos en /auth/me como dato de membresía).
  const onBirthDateChange = (yyyymmdd: string) => {
    update('birth_date', yyyymmdd);
    if (!yyyymmdd) {
      update('age', '');
      return;
    }
    const dob = new Date(yyyymmdd);
    if (Number.isNaN(dob.getTime())) {
      update('age', '');
      return;
    }
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const beforeBirthday =
      today.getMonth() < dob.getMonth() ||
      (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
    if (beforeBirthday) age -= 1;
    if (age >= 6 && age <= 99) update('age', age);
    else update('age', '');
  };

  return (
    <div className="space-y-5">
      <StepHeading
        title="Sobre ti"
        subtitle="Datos básicos para calcular tu plan calórico y dejar lista tu membresía."
      />

      <LightField
        id="fp_full_name"
        label="Nombre completo"
        hint="Como aparece en tu INE — lo usamos en tu recibo."
      >
        <input
          id="fp_full_name"
          type="text"
          value={draft.full_name}
          onChange={(e) => update('full_name', e.target.value)}
          placeholder="María Fernanda López García"
          autoComplete="name"
          className={INPUT_CLS}
        />
      </LightField>

      <LightField
        id="fp_birth_date"
        label="Fecha de nacimiento"
        hint="Obligatoria por política del gym; también la usamos para felicitarte en tu cumpleaños."
      >
        <input
          id="fp_birth_date"
          type="date"
          value={draft.birth_date}
          onChange={(e) => onBirthDateChange(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className={INPUT_CLS}
        />
      </LightField>

      <div className="grid gap-4 sm:grid-cols-2">
        <LightField id="fp_age" label="Edad" hint="Calculada de tu fecha de nacimiento.">
          <input
            id="fp_age"
            type="text"
            value={draft.age === '' ? '' : String(draft.age)}
            readOnly
            className={cn(INPUT_CLS, 'bg-slate-50 text-slate-600')}
            placeholder="—"
          />
        </LightField>
        <LightField label="Género">
          <div className="flex flex-wrap gap-2">
            {GENDERS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => update('gender', g.value)}
                className={cn(
                  'h-11 flex-1 min-w-[90px] rounded-xl border px-3 text-sm font-medium transition-colors',
                  draft.gender === g.value
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </LightField>
        <LightField
          id="fp_height"
          label="Altura (cm)"
          hint="Ej: 165, 170, 178 — en centímetros, no metros."
        >
          <NumericInput
            id="fp_height"
            value={draft.height_cm}
            onChange={(v) => update('height_cm', v)}
            placeholder="175"
            decimal
            maxLen={6}
            // Auto-conversión SOLO al perder foco. Si la persona
            // escribe 1.65 (en metros) lo pasamos a 165 cm.
            onBlur={(raw) => {
              if (raw === '') return;
              const n = Number(raw);
              if (Number.isFinite(n) && n > 0 && n < 3) {
                update('height_cm', Math.round(n * 100));
              }
            }}
          />
        </LightField>
        <LightField id="fp_weight" label="Peso (kg)" hint="Ej: 65, 70.5, 56.9">
          <NumericInput
            id="fp_weight"
            value={draft.weight_kg}
            onChange={(v) => update('weight_kg', v)}
            placeholder="72"
            decimal
            maxLen={6}
          />
        </LightField>
        <LightField id="fp_activity" label="Nivel de actividad fuera del gym">
          <select
            id="fp_activity"
            value={draft.activity_level}
            onChange={(e) => update('activity_level', e.target.value as ActivityLevel)}
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
          >
            <option value="">Elige…</option>
            {ACTIVITY_LEVELS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </LightField>
        <LightField id="fp_years" label="Años entrenando">
          <select
            id="fp_years"
            value={draft.years_training}
            onChange={(e) => update('years_training', e.target.value as YearsTraining)}
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
          >
            <option value="">Elige…</option>
            {YEARS_TRAINING.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </LightField>
      </div>
    </div>
  );
}

// Discipline picker — chips destacados arriba (los 7 deportes que el
// coach trabaja con más socios), acordeón "Otros deportes y disciplinas"
// abajo para los que ya están en perfiles legacy o no son del catálogo
// principal.
function DisciplinePicker({
  value,
  onChange,
}: {
  value: Discipline | '';
  onChange: (v: Discipline | '') => void;
}) {
  // Si el valor seleccionado vive en "Otros", abrimos el acordeón por
  // defecto — el usuario debe ver lo que ya tenía marcado.
  const initiallyOpen = useMemo(
    () => OTHER_DISCIPLINES.some((d) => d.value === value),
    [value],
  );
  const [open, setOpen] = useState(initiallyOpen);

  const renderChip = (
    d: { value: Discipline; label: string; emoji: string },
  ) => {
    const active = value === d.value;
    return (
      <button
        key={d.value}
        type="button"
        onClick={() => onChange(active ? '' : d.value)}
        className={cn(
          'flex items-center gap-2 rounded-2xl ring-1 px-3 py-2.5 text-left transition-colors',
          active
            ? 'ring-blue-500 bg-blue-50 shadow-sm'
            : 'ring-slate-200 bg-white hover:bg-slate-50 hover:ring-slate-300',
        )}
        aria-pressed={active}
      >
        <span className="text-xl leading-none" aria-hidden>
          {d.emoji}
        </span>
        <span
          className={cn(
            'text-sm font-semibold',
            active ? 'text-blue-900' : 'text-slate-800',
          )}
        >
          {d.label}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div className={LABEL_CLS}>Tu deporte / disciplina</div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {PRIMARY_DISCIPLINES.map(renderChip)}
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white hover:border-slate-400"
        aria-expanded={open}
      >
        <span>Otros deportes y disciplinas</span>
        <ChevronDown
          size={16}
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {OTHER_DISCIPLINES.map(renderChip)}
        </div>
      )}
    </div>
  );
}

// ── Step 2: Type / Level / Injuries ──────────────────────────
function Step2Type({ draft, update }: StepProps) {
  return (
    <div className="space-y-6">
      <StepHeading
        title="Tu tipo de entrenamiento"
        subtitle="Esto define la estructura base y la seguridad de tu rutina."
        icon={<Dumbbell size={20} className="text-blue-600" />}
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
                active ? 'ring-blue-500 bg-blue-50 shadow-sm' : 'ring-slate-200 bg-slate-50 hover:bg-white hover:ring-slate-300',
              )}
            >
              <span className={cn(
                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                active ? 'bg-blue-100 text-blue-700' : 'bg-white ring-1 ring-slate-200 text-slate-500',
              )}>
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
        <DisciplinePicker
          value={(draft.discipline as Discipline) || ''}
          onChange={(v) => update('discipline', v)}
        />
      )}

      <div>
        <div className={LABEL_CLS}>Nivel</div>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => {
            const active = draft.level === l.value;
            return (
              <button
                key={l.value}
                type="button"
                onClick={() => update('level', l.value)}
                className={cn('h-10 rounded-full ring-1 px-4 text-sm font-semibold transition-colors',
                  active ? CHIP_ACTIVE : CHIP_INACTIVE)}
              >
                {l.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className={LABEL_CLS}>Lesiones / molestias (evitamos los ejercicios que las comprometen)</div>
        <ChipRow
          options={INJURIES_LIST}
          selected={draft.injuries}
          onToggle={(v) => update('injuries', toggleString(draft.injuries, v, 'none'))}
        />
      </div>

      <div>
        <div className={LABEL_CLS}>Limitaciones de movilidad</div>
        <ChipRow
          options={MOBILITY_OPTIONS.map((m) => ({ value: m, label: m }))}
          selected={draft.mobility_limitations}
          onToggle={(v) => update('mobility_limitations', toggleString(draft.mobility_limitations, v, 'Sin limitación'))}
        />
      </div>
    </div>
  );
}

// ── Step 3: Goal / Motivation ────────────────────────────────
function Step3Goal({ draft, update }: StepProps) {
  return (
    <div className="space-y-6">
      <StepHeading
        title="Tu meta"
        subtitle="El para qué — esto guía a la IA para que la rutina se sienta hecha para ti."
        icon={<Target size={20} className="text-blue-600" />}
      />

      <div>
        <div className={LABEL_CLS}>Objetivo principal</div>
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
                  active ? 'ring-blue-500 bg-blue-50 shadow-sm' : 'ring-slate-200 bg-slate-50 hover:bg-white hover:ring-slate-300',
                )}
              >
                <span className="text-xl">{o.emoji}</span>
                <span className={cn('text-sm font-semibold', active ? 'text-blue-900' : 'text-slate-900')}>{o.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      <LightField
        id="fp_motivation"
        label="¿Para qué quieres entrenar?"
        hint='Cuéntanos en tus palabras. Ej: "verme bien sin camisa para mi boda en julio", "llegar a 100 kg en sentadilla", "recuperar energía después del bebé".'
      >
        <textarea
          id="fp_motivation"
          className={TEXTAREA_CLS}
          value={draft.motivation}
          onChange={(e) => update('motivation', e.target.value.slice(0, 500))}
          rows={3}
          placeholder="Tu motivación con tus palabras…"
          maxLength={500}
        />
      </LightField>

      <div>
        <div className={LABEL_CLS}>Tipo de meta</div>
        <p className="text-[11px] text-slate-400 mb-2">
          ¿Qué describe mejor tu objetivo? Mientras más concreto, mejor te entiende la IA.
        </p>
        <div className="space-y-3">
          {GOAL_TYPE_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                {group.title}
              </div>
              <ChipRow
                options={group.items}
                selected={draft.goal_type ? [draft.goal_type] : []}
                onToggle={(v) => update('goal_type', draft.goal_type === v ? '' : v as GoalType)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <LightField id="fp_deadline" label="Fecha objetivo (opcional)" hint="Si hay un evento concreto, ponla.">
          <input
            id="fp_deadline" type="date"
            className={INPUT_CLS}
            value={draft.goal_deadline}
            onChange={(e) => update('goal_deadline', e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
          />
        </LightField>
      </div>

      <LightField
        id="fp_past"
        label="¿Qué has probado antes? ¿Qué te funcionó? ¿Qué no?"
        hint="Opcional, pero ayuda mucho. Replicamos lo que funcionó y evitamos lo que no."
      >
        <textarea
          id="fp_past"
          className={TEXTAREA_CLS}
          value={draft.past_experience}
          onChange={(e) => update('past_experience', e.target.value.slice(0, 500))}
          rows={3}
          placeholder='Ej: "hice CrossFit un año, me lastimé la rodilla. Solo pesas no me motivó".'
          maxLength={500}
        />
      </LightField>
    </div>
  );
}

// ── Step 4: Training Style + Availability ────────────────────
function Step4Style({ draft, update }: StepProps) {
  return (
    <div className="space-y-6">
      <StepHeading
        title="Cómo te gusta entrenar"
        subtitle="Disponibilidad, estilo, gustos y disgustos."
        icon={<Heart size={20} className="text-blue-600" />}
      />

      <div>
        <div className={LABEL_CLS}>Estilo preferido</div>
        <SingleChoice
          options={TRAINING_STYLES}
          value={draft.training_style}
          onChange={(v) => update('training_style', v)}
        />
      </div>

      <div>
        <div className={LABEL_CLS}>Te gusta hacer</div>
        <ChipRow
          options={COMMON_LIKES.map((l) => ({ value: l, label: l }))}
          selected={draft.likes}
          onToggle={(v) => update('likes', toggleString(draft.likes, v))}
        />
      </div>

      <div>
        <div className={LABEL_CLS}>NO te gusta (lo respetamos siempre)</div>
        <ChipRow
          options={COMMON_DISLIKES.map((l) => ({ value: l, label: l }))}
          selected={draft.dislikes}
          onToggle={(v) => update('dislikes', toggleString(draft.dislikes, v))}
        />
      </div>

      <div>
        <div className={LABEL_CLS}>Grupos prioritarios (más volumen — máx 5)</div>
        <ChipRowEnum<MuscleGroup>
          options={MUSCLES}
          selected={draft.priority_muscles}
          onToggle={(v) => update('priority_muscles', toggleEnum<MuscleGroup>(draft.priority_muscles, v, 5))}
        />
      </div>

      <div>
        <div className={LABEL_CLS}>Grupos a desenfatizar (mantenimiento — máx 5)</div>
        <ChipRowEnum<MuscleGroup>
          options={MUSCLES}
          selected={draft.deprioritized_muscles}
          onToggle={(v) => update('deprioritized_muscles', toggleEnum<MuscleGroup>(draft.deprioritized_muscles, v, 5))}
        />
      </div>

      <SliderRow
        label="Días por semana"
        min={2} max={6}
        value={draft.days_per_week}
        onChange={(v) => update('days_per_week', v)}
        renderValue={(v) => `${v} día${v === 1 ? '' : 's'}`}
      />

      <SliderRow
        label="Duración por sesión"
        min={20} max={150} step={5}
        value={draft.session_duration_min}
        onChange={(v) => update('session_duration_min', v)}
        renderValue={(v) => `${v} min`}
      />

      <div>
        <div className={LABEL_CLS}>Hora del día</div>
        <ChipRow
          options={TIME_OF_DAYS}
          selected={draft.time_of_day ? [draft.time_of_day] : []}
          onToggle={(v) => update('time_of_day', draft.time_of_day === v ? '' : v as TimeOfDay)}
        />
      </div>

      <div>
        <div className={LABEL_CLS}>Ubicación</div>
        <ChipRow
          options={LOCATIONS}
          selected={draft.location ? [draft.location] : []}
          onToggle={(v) => update('location', draft.location === v ? '' : v as Location)}
        />
      </div>

      {(draft.location === 'HOME' || draft.location === 'BOTH') && (
        <div>
          <div className={LABEL_CLS}>Equipo disponible en casa</div>
          <ChipRow
            options={COMMON_EQUIPMENT.map((e) => ({ value: e, label: e }))}
            selected={draft.available_equipment}
            onToggle={(v) => update('available_equipment', toggleString(draft.available_equipment, v))}
          />
        </div>
      )}
    </div>
  );
}

// ── Step 5: Food / Nutrition profile ─────────────────────────
function Step5Food({ draft, update }: StepProps) {
  return (
    <div className="space-y-6">
      <StepHeading
        title="Cómo comes"
        subtitle="Nos ayuda a que el plan alimenticio se ajuste a tu vida."
        icon={<Utensils size={20} className="text-blue-600" />}
      />

      <div>
        <div className={LABEL_CLS}>Objetivo nutricional</div>
        <p className="text-[11px] text-slate-400 mb-2">
          Puede diferir de tu objetivo de rutina (ej. ganar fuerza con déficit calórico).
          Si no eliges, usamos el mismo objetivo de tu rutina.
        </p>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
          {OBJECTIVES.map((o) => {
            const active = draft.nutrition_objective === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => update('nutrition_objective', draft.nutrition_objective === o.value ? '' : o.value)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-xl ring-1 p-3 text-left transition-colors',
                  active ? 'ring-blue-500 bg-blue-50 shadow-sm' : 'ring-slate-200 bg-slate-50 hover:bg-white hover:ring-slate-300',
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
        <div className={LABEL_CLS}>Comidas por día</div>
        <div className="flex gap-2">
          {[3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => update('meals_per_day', n as 3 | 4 | 5)}
              className={cn(
                'h-11 flex-1 rounded-xl border text-sm font-semibold transition-colors',
                draft.meals_per_day === n
                  ? 'border-blue-500 bg-blue-50 text-blue-900'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className={LABEL_CLS}>¿Quién cocina?</div>
          <ChipRow
            options={COOKERS}
            selected={draft.cooker ? [draft.cooker] : []}
            onToggle={(v) => update('cooker', draft.cooker === v ? '' : v as Cooker)}
          />
        </div>
        <div>
          <div className={LABEL_CLS}>Tiempo para cocinar</div>
          <ChipRow
            options={COOKING_TIMES}
            selected={draft.cooking_time ? [draft.cooking_time] : []}
            onToggle={(v) => update('cooking_time', draft.cooking_time === v ? '' : v as CookingTime)}
          />
        </div>
      </div>

      <div>
        <div className={LABEL_CLS}>Presupuesto</div>
        <SingleChoice
          options={BUDGETS}
          value={draft.budget}
          onChange={(v) => update('budget', v)}
        />
      </div>

      <div>
        <div className={LABEL_CLS}>Relación con la comida</div>
        <ChipRow
          options={FOOD_RELATIONSHIPS}
          selected={draft.food_relationship ? [draft.food_relationship] : []}
          onToggle={(v) => update('food_relationship', draft.food_relationship === v ? '' : v as FoodRelationship)}
        />
      </div>

      <LightField
        id="fp_nutmotivation"
        label="¿Por qué quieres mejorar tu alimentación?"
        hint='Opcional. Ej: "siempre tengo hambre por la tarde", "quiero tener energía constante", "cero ansiedad por comer".'
      >
        <textarea
          id="fp_nutmotivation"
          className={TEXTAREA_CLS}
          value={draft.nutrition_motivation}
          onChange={(e) => update('nutrition_motivation', e.target.value.slice(0, 500))}
          rows={3}
          placeholder="Tu motivación con tus palabras…"
          maxLength={500}
        />
      </LightField>
    </div>
  );
}

// ── Step 6: Restrictions + habits + selfie ───────────────────
function Step6Habits({
  draft,
  update,
  hasSelfie,
  onSelfieUploaded,
}: StepProps & {
  hasSelfie: boolean;
  onSelfieUploaded: () => void;
}) {
  return (
    <div className="space-y-6">
      <StepHeading
        title="Restricciones y hábitos"
        subtitle="Restricciones alimenticias, hábitos y tu selfie de identificación."
      />

      <div>
        <div className={LABEL_CLS}>Preferencia alimenticia</div>
        <ChipRow
          options={DIETARY.map((t) => ({ value: t, label: t }))}
          selected={draft.dietary}
          onToggle={(v) => update('dietary', toggleString(draft.dietary, v, 'Ninguna'))}
        />
      </div>

      <div>
        <div className={LABEL_CLS}>Alergias</div>
        <ChipRow
          options={ALLERGIES.map((a) => ({ value: a, label: a }))}
          selected={draft.allergies}
          onToggle={(v) => update('allergies', toggleString(draft.allergies, v, 'Ninguna'))}
        />
      </div>

      <div>
        <div className={LABEL_CLS}>Alimentos que NO te gustan</div>
        <p className="text-[11px] text-slate-400 mb-2">Nunca aparecen en tu plan.</p>
        <ChipRow
          options={COMMON_DISLIKED_FOODS.map((f) => ({ value: f, label: f }))}
          selected={draft.disliked_foods}
          onToggle={(v) => update('disliked_foods', toggleString(draft.disliked_foods, v))}
        />
      </div>

      <div>
        <div className={LABEL_CLS}>Suplementación que tomas</div>
        <ChipRow
          options={COMMON_SUPPLEMENTS.map((s) => ({ value: s, label: s }))}
          selected={draft.supplements}
          onToggle={(v) => update('supplements', toggleString(draft.supplements, v))}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <LightField id="fp_water" label="Agua al día (litros)">
          <input
            id="fp_water" type="number" min={0} max={10} step="0.5" inputMode="decimal"
            className={INPUT_CLS}
            value={draft.water_liters_per_day === '' ? '' : String(draft.water_liters_per_day)}
            onChange={(e) => update('water_liters_per_day', e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="2.5"
          />
        </LightField>
        <LightField label="¿Tomas café?">
          <div className="flex gap-2">
            {[
              { v: true, l: 'Sí' },
              { v: false, l: 'No' },
            ].map((o) => (
              <button
                key={String(o.v)}
                type="button"
                onClick={() => update('coffee', draft.coffee === o.v ? null : o.v)}
                className={cn(
                  'h-11 flex-1 rounded-xl border text-sm font-semibold transition-colors',
                  draft.coffee === o.v
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {o.l}
              </button>
            ))}
          </div>
        </LightField>
      </div>

      <div>
        <div className={LABEL_CLS}>Alcohol</div>
        <ChipRow
          options={ALCOHOLS}
          selected={draft.alcohol ? [draft.alcohol] : []}
          onToggle={(v) => update('alcohol', draft.alcohol === v ? '' : v as Alcohol)}
        />
      </div>

      <SliderRow
        label="Comidas libres por semana"
        min={0} max={4}
        value={draft.free_meals_per_week}
        onChange={(v) => update('free_meals_per_week', v)}
        renderValue={(v) => `${v} comida${v === 1 ? '' : 's'}`}
      />

      <LightField
        id="fp_notes"
        label="Notas adicionales (opcional)"
        hint={`${draft.notes.length}/800`}
      >
        <textarea
          id="fp_notes"
          className={TEXTAREA_CLS}
          value={draft.notes}
          onChange={(e) => update('notes', e.target.value.slice(0, 800))}
          rows={3}
          placeholder="Cualquier cosa relevante: cirugías recientes, preferencias específicas, etc."
          maxLength={800}
        />
      </LightField>

      {/* Selfie de identificación — requisito para entrar al gym */}
      <div className="space-y-2 pt-3 border-t border-slate-200">
        <div className={LABEL_CLS}>Selfie de identificación</div>
        <p className="text-[11px] text-slate-500 mb-2">
          La usa el staff para reconocerte en recepción. Sin selfie no
          puedes usar tu QR de acceso.
        </p>
        {hasSelfie ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              ✓
            </span>
            Selfie cargada. Puedes continuar.
          </div>
        ) : (
          <SelfieCapture onSuccess={onSelfieUploaded} />
        )}
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 p-3 text-xs text-blue-900">
        <Dumbbell size={14} className="text-blue-600" />
        Al guardar, generaremos tu primera rutina personalizada usando tu perfil.
      </div>
    </div>
  );
}

function SliderRow({
  label, min, max, step = 1, value, onChange, renderValue,
}: {
  label: string;
  min: number; max: number; step?: number;
  value: number;
  onChange: (v: number) => void;
  renderValue: (v: number) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className={LABEL_CLS}>{label}</span>
        <span className="font-display text-2xl font-semibold text-blue-600 tabular-nums">
          {renderValue(value)}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
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
