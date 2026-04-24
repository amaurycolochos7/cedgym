'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Apple, Flame, Dumbbell, Wheat, Droplet, Download,
  RefreshCw, ChevronDown, ChevronUp, AlertCircle, Clock, Lock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AIGenerationOverlay } from '@/components/portal/ai-generation-overlay';

/* =========================================================================
 * Types
 * =========================================================================*/

type MealType = 'BREAKFAST' | 'SNACK_AM' | 'LUNCH' | 'SNACK_PM' | 'DINNER';

interface Meal {
  day_of_week: number; // 1..7 (Mon..Sun)
  meal_type: MealType;
  name: string;
  description?: string;
  ingredients?: string[];
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  prep_time_min?: number;
  order_index?: number;
}

interface MealPlan {
  id: string;
  name: string;
  goal?: string;
  calories_target?: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  restrictions?: string[];
  meals: Meal[];
}

interface ShoppingListItem {
  name: string;
  total: string;
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

/* =========================================================================
 * Constants
 * =========================================================================*/

const MEAL_TYPE_ES: Record<MealType, string> = {
  BREAKFAST: 'Desayuno',
  SNACK_AM: 'Media mañana',
  LUNCH: 'Comida',
  SNACK_PM: 'Antes de entrenar',
  DINNER: 'Cena',
};

const MEAL_IMAGES: Record<MealType, string> = {
  BREAKFAST: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?q=80&w=800',
  SNACK_AM: 'https://images.unsplash.com/photo-1524350876685-274059332603?q=80&w=800',
  LUNCH: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=800',
  SNACK_PM: 'https://images.unsplash.com/photo-1502741338009-cac2772e18bc?q=80&w=800',
  DINNER: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?q=80&w=800',
};

const MEAL_ORDER: MealType[] = ['BREAKFAST', 'SNACK_AM', 'LUNCH', 'SNACK_PM', 'DINNER'];

const DAYS_ES = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const RESTRICTIONS = [
  { value: 'vegetarian', label: 'Vegetariano' },
  { value: 'vegan', label: 'Vegano' },
  { value: 'lactose_free', label: 'Sin lactosa' },
  { value: 'gluten_free', label: 'Sin gluten' },
  { value: 'pork_free', label: 'Sin cerdo' },
  { value: 'kosher', label: 'Kosher' },
  { value: 'halal', label: 'Halal' },
];

const ALLERGIES = [
  { value: 'nuts', label: 'Nueces' },
  { value: 'shellfish', label: 'Mariscos' },
  { value: 'eggs', label: 'Huevos' },
  { value: 'dairy', label: 'Lácteos' },
  { value: 'soy', label: 'Soja' },
];

const BUDGETS = [
  { value: 'low', label: 'Económico' },
  { value: 'medium', label: 'Balanceado' },
  { value: 'high', label: 'Premium' },
];

/* =========================================================================
 * Page
 * =========================================================================*/

export default function PlanAlimenticioPage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data, isLoading } = useQuery<{ plan: MealPlan | null }>({
    queryKey: ['ai', 'meal-plans', 'me'],
    queryFn: async () => {
      try {
        const r = await api.get('/ai/meal-plans/me');
        // Support both wrapped `{ plan }` and raw plan payloads
        const body = r.data;
        if (body && typeof body === 'object' && 'plan' in body) return body;
        if (body && typeof body === 'object' && 'id' in body) return { plan: body as MealPlan };
        return { plan: null };
      } catch (e: any) {
        if (e?.status === 404) return { plan: null };
        throw e;
      }
    },
  });

  const { data: quota } = useQuery<AiQuota>({
    queryKey: ['ai', 'quota', 'me'],
    queryFn: async () => {
      const r = await api.get('/ai/quota/me');
      return r.data as AiQuota;
    },
  });

  const plan = data?.plan ?? null;

  if (isLoading) {
    return <div className="text-slate-500">Cargando…</div>;
  }

  return (
    <div className="space-y-6">
      {!plan ? (
        <NoPlanView
          profileCompleted={!!user?.profile_completed}
          quota={quota}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['ai', 'meal-plans', 'me'] });
            qc.invalidateQueries({ queryKey: ['ai', 'quota', 'me'] });
          }}
        />
      ) : (
        <PlanView
          plan={plan}
          quota={quota}
          onRegenerated={() => {
            qc.invalidateQueries({ queryKey: ['ai', 'meal-plans', 'me'] });
            qc.invalidateQueries({ queryKey: ['ai', 'quota', 'me'] });
          }}
        />
      )}
    </div>
  );
}

/* =========================================================================
 * No plan — generate form
 * =========================================================================*/

function NoPlanView({
  profileCompleted,
  quota,
  onCreated,
}: {
  profileCompleted: boolean;
  quota?: AiQuota;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [calories, setCalories] = useState<string>('');
  const [mealsPerDay, setMealsPerDay] = useState<3 | 4 | 5>(5);
  const [budget, setBudget] = useState<'low' | 'medium' | 'high'>('medium');
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [disliked, setDisliked] = useState<string>('');

  const generate = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        meals_per_day: mealsPerDay,
        budget,
        country: 'MX',
        restrictions,
        allergies,
      };
      if (calories) body.calories_target = Number(calories);
      const disliked_foods = disliked
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (disliked_foods.length) body.disliked_foods = disliked_foods;
      const r = await api.post('/ai/meal-plans/generate', body, { timeout: 90_000 });
      return r.data;
    },
    onSuccess: () => onCreated(),
    onError: (err: { code?: string; message?: string }) => {
      const code = err?.code;
      const message = err?.message ?? 'No se pudo generar el plan.';
      toast.error(message);
      if (code === 'FEATURE_NOT_IN_PLAN') {
        router.push('/portal/membership');
      }
    },
  });

  const mp = quota?.meal_plan;
  const featureBlocked = mp?.limit === 0;
  const quotaExhausted = mp && !featureBlocked && mp.allowed === false;
  const disableGenerate = !!mp && !mp.allowed;

  function toggle(list: string[], setList: (v: string[]) => void, v: string) {
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  return (
    <div className="space-y-6">
      <AIGenerationOverlay open={generate.isPending} kind="meal_plan" />
      {!profileCompleted && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-amber-900 font-semibold">Completa tu perfil primero</p>
            <p className="text-amber-800/80 mt-0.5">
              Necesitamos tu edad, peso y altura para calcular calorías óptimas.
            </p>
          </div>
          <Link
            href="/portal/perfil"
            className="shrink-0 text-amber-700 hover:text-amber-800 font-semibold self-center"
          >
            Completar →
          </Link>
        </div>
      )}

      {/* Hero */}
      <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <Apple className="w-5 h-5" />
          </div>
          <span className="text-xs uppercase tracking-widest text-slate-500 font-semibold">
            Nutrición personalizada
          </span>
        </div>
        <h1 className="font-display text-4xl sm:text-5xl tracking-wide text-slate-900">
          TU PLAN ALIMENTICIO
        </h1>
        <p className="text-slate-600 mt-2 max-w-2xl">
          6 comidas al día, ingredientes mexicanos, adaptado a tu objetivo.
        </p>
      </div>

      {/* Form */}
      <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-6 space-y-6">
        {/* Calories */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Calorías objetivo
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            placeholder="Ej: 2400"
            className="w-full sm:w-60 bg-white border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none transition"
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Déjalo vacío y lo calculamos desde tu perfil
          </p>
        </div>

        {/* Meals per day */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Comidas al día
          </label>
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            {[3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMealsPerDay(n as 3 | 4 | 5)}
                className={`px-5 py-1.5 rounded-md text-sm font-medium transition ${
                  mealsPerDay === n
                    ? 'bg-white shadow-sm ring-1 ring-slate-200 text-slate-900'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Budget */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Presupuesto
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {BUDGETS.map((b) => (
              <label
                key={b.value}
                className={`cursor-pointer rounded-lg ring-1 px-4 py-3 text-sm transition ${
                  budget === b.value
                    ? 'ring-blue-500 bg-blue-50 text-blue-900 shadow-sm'
                    : 'ring-slate-200 bg-slate-50 text-slate-700 hover:bg-white hover:ring-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="budget"
                  value={b.value}
                  checked={budget === b.value}
                  onChange={() => setBudget(b.value as 'low' | 'medium' | 'high')}
                  className="sr-only"
                />
                <div className="font-semibold">{b.label}</div>
                <div className={`text-xs uppercase mt-0.5 ${budget === b.value ? 'text-blue-700' : 'text-slate-500'}`}>{b.value}</div>
              </label>
            ))}
          </div>
        </div>

        {/* Restrictions */}
        <CheckGrid
          label="Restricciones"
          options={RESTRICTIONS}
          value={restrictions}
          onToggle={(v) => toggle(restrictions, setRestrictions, v)}
        />

        {/* Allergies */}
        <CheckGrid
          label="Alergias"
          options={ALLERGIES}
          value={allergies}
          onToggle={(v) => toggle(allergies, setAllergies, v)}
        />

        {/* Disliked */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Alimentos que no te gustan
          </label>
          <textarea
            rows={2}
            value={disliked}
            onChange={(e) => setDisliked(e.target.value)}
            placeholder="brócoli, hígado, atún…"
            className="w-full bg-white border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none transition"
          />
          <p className="text-xs text-slate-500 mt-1.5">Separa con comas.</p>
        </div>

        {generate.isError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
            {(generate.error as { message?: string })?.message ?? 'No se pudo generar el plan.'}
          </div>
        )}

        <QuotaStatus quota={quota} />

        <div>
          {featureBlocked ? (
            <UpgradeCard plan={quota?.plan} />
          ) : (
            <button
              type="button"
              onClick={() => generate.mutate()}
              disabled={generate.isPending || disableGenerate}
              className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 rounded-xl text-sm shadow-sm transition"
            >
              {generate.isPending
                ? 'Generando…'
                : quotaExhausted
                  ? 'Sin planes disponibles este periodo'
                  : 'Generar mi plan'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
 * Quota status + upgrade card
 * =========================================================================*/

function QuotaStatus({ quota }: { quota?: AiQuota }) {
  if (!quota) return null;
  const mp = quota.meal_plan;

  // STARTER — feature not in plan. Rendered as the upgrade card instead of
  // a quiet status line so the whole section below can swap for the CTA.
  if (mp.limit === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm">
        <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-amber-900 font-semibold">
            Tu plan Básico no incluye plan alimenticio.
          </p>
          <p className="text-amber-800/90 font-bold mt-0.5">
            Mejora a PRO o Élite para desbloquearlo.
          </p>
        </div>
      </div>
    );
  }

  // Quota exhausted — show whichever countdown hits first: the 30-day
  // quota window or the membership's expiry date. A member whose plan
  // expires sooner needs to renew the membership, not wait for a
  // quota reset that won't come without it.
  if (!mp.allowed) {
    const quotaDays = quota.days_until_renewal;
    const memberDays = quota.membership_days_remaining ?? Number.POSITIVE_INFINITY;
    const membershipEndsFirst = memberDays < quotaDays;
    const days = membershipEndsFirst ? memberDays : quotaDays;
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm">
        <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-amber-900">
          {membershipEndsFirst ? (
            <>
              Tu membresía vence en{' '}
              <strong className="font-semibold">{days}</strong> día
              {days === 1 ? '' : 's'} — renuévala para generar otro plan.
            </>
          ) : (
            <>
              Ya usaste tu plan alimenticio de este periodo. Se renueva en{' '}
              <strong className="font-semibold">{days}</strong> día
              {days === 1 ? '' : 's'}.
            </>
          )}
        </p>
      </div>
    );
  }

  // Unlimited (ELITE typically)
  if (mp.unlimited) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Apple className="w-4 h-4 text-blue-500" />
        Planes alimenticios ilimitados con tu plan {quota.plan ?? 'actual'}.
      </div>
    );
  }

  // Allowed with a finite limit
  if (mp.limit != null && mp.limit > 0) {
    const remaining = Math.max(0, mp.limit - mp.used);
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Apple className="w-4 h-4 text-blue-500" />
        Te queda{remaining === 1 ? '' : 'n'}{' '}
        <strong className="text-slate-700 tabular-nums">{remaining}</strong>{' '}
        plan{remaining === 1 ? '' : 'es'} este periodo.
      </div>
    );
  }

  return null;
}

function UpgradeCard({ plan }: { plan?: AiQuota['plan'] }) {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-amber-50 border border-blue-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white ring-1 ring-blue-200 text-blue-700 shrink-0">
          <Lock className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-xl sm:text-2xl tracking-wide text-slate-900">
            Desbloquea tu plan alimenticio
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            {plan === 'STARTER'
              ? 'Tu plan Básico no incluye esta función. '
              : ''}
            Mejora a <strong className="text-slate-900">PRO</strong> o{' '}
            <strong className="text-slate-900">Élite</strong> para generar
            planes alimenticios personalizados.
          </p>
          <Link
            href="/portal/membership"
            className="mt-4 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-xl shadow-sm transition"
          >
            Ver planes
          </Link>
        </div>
      </div>
    </div>
  );
}

function CheckGrid({
  label,
  options,
  value,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              className={`rounded-lg ring-1 px-3 py-2 text-sm text-left transition ${
                on
                  ? 'ring-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                  : 'ring-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className={`inline-block w-3.5 h-3.5 rounded-sm mr-2 align-middle ring-1 ${on ? 'ring-white' : 'ring-slate-400'}`}>
                {on && <span className="block w-full h-full bg-white rounded-sm" />}
              </span>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
 * Active plan
 * =========================================================================*/

function PlanView({
  plan,
  quota,
  onRegenerated,
}: {
  plan: MealPlan;
  quota?: AiQuota;
  onRegenerated: () => void;
}) {
  const router = useRouter();
  // Group meals by day
  const byDay = useMemo(() => {
    const map = new Map<number, Meal[]>();
    for (const m of plan.meals ?? []) {
      const arr = map.get(m.day_of_week) ?? [];
      arr.push(m);
      map.set(m.day_of_week, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const oa = a.order_index ?? MEAL_ORDER.indexOf(a.meal_type);
        const ob = b.order_index ?? MEAL_ORDER.indexOf(b.meal_type);
        return oa - ob;
      });
    }
    return map;
  }, [plan.meals]);

  const availableDays = useMemo(
    () => Array.from(byDay.keys()).sort((a, b) => a - b),
    [byDay],
  );

  const [activeDay, setActiveDay] = useState<number>(availableDays[0] ?? 1);

  const regenerate = useMutation({
    mutationFn: async () => {
      const r = await api.post('/ai/meal-plans/generate', { country: 'MX' }, { timeout: 90_000 });
      return r.data;
    },
    onSuccess: () => onRegenerated(),
    onError: (err: { code?: string; message?: string }) => {
      const code = err?.code;
      const message = err?.message ?? 'No se pudo regenerar el plan.';
      toast.error(message);
      if (code === 'FEATURE_NOT_IN_PLAN') {
        router.push('/portal/membership');
      }
    },
  });

  const mp = quota?.meal_plan;
  const regenerateDisabled = !!mp && !mp.allowed;

  const [downloading, setDownloading] = useState(false);

  async function downloadShoppingList() {
    try {
      setDownloading(true);
      const r = await api.get(`/ai/meal-plans/${plan.id}/shopping-list`);
      const items: ShoppingListItem[] = r.data?.items ?? [];
      const lines = [
        `LISTA DE COMPRAS - ${plan.name}`,
        '',
        ...items.map((i) => `• ${i.total} ${i.name}`.trim()),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lista-compras-cedgym.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  const meals = byDay.get(activeDay) ?? [];

  return (
    <div className="space-y-6">
      <AIGenerationOverlay open={regenerate.isPending} kind="meal_plan" />
      {/* Header / stats */}
      <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-blue-700 font-semibold mb-2">
              <Apple className="w-3.5 h-3.5" />
              Plan activo
            </div>
            <h1 className="font-display text-3xl sm:text-4xl tracking-wide text-slate-900">
              {plan.name}
            </h1>
            {plan.goal && (
              <p className="text-slate-500 mt-1 text-sm">{plan.goal}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => regenerate.mutate()}
              disabled={regenerate.isPending || regenerateDisabled}
              title={regenerateDisabled ? 'Quota agotada este periodo' : undefined}
              className="inline-flex items-center gap-2 bg-white ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              <RefreshCw className={`w-4 h-4 ${regenerate.isPending ? 'animate-spin' : ''}`} />
              {regenerate.isPending ? 'Regenerando…' : 'Regenerar'}
            </button>
            <button
              onClick={downloadShoppingList}
              disabled={downloading}
              className="inline-flex items-center gap-2 bg-white ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Generando…' : 'Lista de compras'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <StatBig icon={<Flame className="w-4 h-4" />} label="Calorías" value={plan.calories_target} unit="kcal" />
          <StatBig icon={<Dumbbell className="w-4 h-4" />} label="Proteína" value={plan.protein_g} unit="g" />
          <StatBig icon={<Wheat className="w-4 h-4" />} label="Carbos" value={plan.carbs_g} unit="g" />
          <StatBig icon={<Droplet className="w-4 h-4" />} label="Grasas" value={plan.fats_g} unit="g" />
        </div>
      </div>

      <QuotaStatus quota={quota} />

      {/* Day tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 border-b border-slate-200">
        {availableDays.map((d) => (
          <button
            key={d}
            onClick={() => setActiveDay(d)}
            className={`shrink-0 px-4 py-2.5 text-sm font-semibold tracking-wide uppercase transition border-b-2 ${
              activeDay === d
                ? 'text-blue-700 border-blue-600'
                : 'text-slate-500 hover:text-slate-700 border-transparent'
            }`}
          >
            {DAYS_ES[d] ?? `D${d}`}
          </button>
        ))}
      </div>

      {/* Meals */}
      <div className="space-y-4">
        {meals.length === 0 ? (
          <div className="text-slate-500 text-sm">No hay comidas para este día.</div>
        ) : (
          meals.map((m, i) => <MealCard key={`${m.meal_type}-${i}`} meal={m} />)
        )}
      </div>
    </div>
  );
}

function StatBig({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
  unit: string;
}) {
  return (
    <div className="bg-white ring-1 ring-slate-200 rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-slate-500 font-medium">
        <span className="text-blue-600">{icon}</span>
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-bold text-slate-900 tabular-nums">
          {value ?? '—'}
        </span>
        <span className="text-xs text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

function MealCard({ meal }: { meal: Meal }) {
  const [open, setOpen] = useState(false); // mobile accordion
  const img = MEAL_IMAGES[meal.meal_type];
  const badge = MEAL_TYPE_ES[meal.meal_type] ?? meal.meal_type;

  return (
    <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl overflow-hidden">
      <div className="md:flex">
        <div
          className="h-40 md:h-auto md:w-56 shrink-0 bg-cover bg-center bg-slate-200"
          style={{ backgroundImage: `url(${img})` }}
          aria-hidden
        />
        <div className="flex-1 p-5">
          {/* Header: badge + accordion toggle on mobile */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <span className="inline-block text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-md bg-blue-50 text-blue-700 ring-1 ring-blue-200">
                {badge}
              </span>
              <h3 className="font-display text-2xl tracking-wide text-slate-900 mt-2">
                {meal.name}
              </h3>
            </div>
            <button
              className="md:hidden p-1.5 rounded-lg bg-slate-100 text-slate-600"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Colapsar' : 'Expandir'}
            >
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {/* Collapsible body on mobile, always open on md+ */}
          <div className={`${open ? 'block' : 'hidden'} md:block mt-3 space-y-3`}>
            {meal.description && (
              <p className="text-sm text-slate-600">{meal.description}</p>
            )}

            {meal.ingredients && meal.ingredients.length > 0 && (
              <ul className="list-disc list-inside text-sm text-slate-700 space-y-0.5">
                {meal.ingredients.map((ing, i) => (
                  <li key={i}>{ing}</li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-4 pt-2 text-xs text-slate-500">
              {typeof meal.calories === 'number' && (
                <span className="inline-flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  <strong className="text-slate-900 tabular-nums">{meal.calories}</strong> kcal
                </span>
              )}
              {typeof meal.protein_g === 'number' && (
                <span className="inline-flex items-center gap-1">
                  <Dumbbell className="w-3.5 h-3.5 text-blue-600" />
                  <strong className="text-slate-900 tabular-nums">{meal.protein_g}g</strong> prot
                </span>
              )}
              {typeof meal.prep_time_min === 'number' && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <strong className="text-slate-900 tabular-nums">{meal.prep_time_min}</strong> min
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
