'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Apple, Flame, Dumbbell, Wheat, Droplet, Download,
  RefreshCw, ChevronDown, ChevronUp, AlertCircle, Clock, Lock,
  ShoppingCart, Utensils, CheckCircle2, ArrowRight, Plus,
} from 'lucide-react';
import { api } from '@/lib/api';
import { planDisplayName } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { AIGenerationOverlay } from '@/components/portal/ai-generation-overlay';
import { MealPlanAddonModal } from '@/components/portal/meal-plan-addon-modal';
import { PlansModal } from '@/components/portal/plans-modal';

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
  // New (optional) backend signal: when true, the current availability
  // is being served by the meal-plan add-on (not the membership).
  from_addon?: boolean;
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
  { value: 'low', label: 'Económico', hint: 'Ingredientes básicos' },
  { value: 'medium', label: 'Balanceado', hint: 'Calidad / precio óptima' },
  { value: 'high', label: 'Premium', hint: 'Ingredientes selectos' },
];

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1490818387583-1baba5e638af?q=80&w=1600';

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
    return (
      <div className="space-y-4">
        <div className="h-48 sm:h-64 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
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
 * Editorial hero — used by both the no-plan and active-plan states
 * =========================================================================*/

function EditorialHero({
  eyebrow,
  title,
  subtitle,
  variant = 'full',
  chips,
  statusChip,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  variant?: 'full' | 'compact';
  chips?: string[];
  statusChip?: { label: string; tone?: 'emerald' | 'blue' };
}) {
  if (variant === 'compact') {
    return (
      <section className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 via-blue-500 to-transparent" />
        <div className="absolute -top-24 -right-20 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative px-5 sm:px-7 py-5 sm:py-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            {eyebrow}
          </div>
          <h1 className="font-display mt-1 text-3xl sm:text-4xl leading-[1.05] text-slate-900">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 max-w-2xl text-sm text-slate-600">{subtitle}</p>
          )}
        </div>
      </section>
    );
  }

  const statusToneCls =
    statusChip?.tone === 'blue'
      ? 'bg-blue-500/95 text-white ring-1 ring-blue-400/60'
      : 'bg-emerald-500/95 text-white ring-1 ring-emerald-400/60';

  return (
    <section className="relative overflow-hidden rounded-2xl ring-1 ring-slate-200 shadow-sm">
      <div className="grid md:grid-cols-2">
        {/* Image side — full-bleed mobile (h-56), contained on desktop */}
        <div className="relative h-56 md:h-auto md:order-2">
          <img
            src={HERO_IMAGE}
            alt="Plato saludable con vegetales y proteína"
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
          />
          {/* Brand-tinted gradient — emerald → blue → dark — only on mobile */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/30 to-transparent md:hidden" />

          {/* Mobile status chip — top-right of hero so it's visible at a glance */}
          {statusChip && (
            <div className="absolute top-3 right-3 md:hidden">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] shadow-sm backdrop-blur ${statusToneCls}`}
              >
                <CheckCircle2 className="h-3 w-3" />
                {statusChip.label}
              </span>
            </div>
          )}

          {/* Mobile title overlay */}
          <div className="absolute inset-x-0 bottom-0 p-5 md:hidden">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">
              {eyebrow}
            </div>
            <h1 className="font-display mt-1 text-3xl leading-[1.05] text-white">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 max-w-md text-sm text-white/85">
                {subtitle}
              </p>
            )}
            {chips && chips.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {chips.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white ring-1 ring-white/25 backdrop-blur"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Text side — desktop only */}
        <div className="hidden md:flex md:order-1 md:flex-col md:justify-center bg-white p-8 lg:p-10">
          <div className="flex items-center gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
              {eyebrow}
            </div>
            {statusChip && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
                  statusChip.tone === 'blue'
                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                    : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                }`}
              >
                <CheckCircle2 className="h-3 w-3" />
                {statusChip.label}
              </span>
            )}
          </div>
          <h1 className="font-display mt-2 text-4xl lg:text-5xl leading-[1.05] text-slate-900">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 max-w-md text-base text-slate-600">{subtitle}</p>
          )}
          {chips && chips.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
 * No plan state — handles paywall (STARTER), exhausted quota, addon-active,
 * and the redesigned generate form.
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
  const [customAllergies, setCustomAllergies] = useState<string>('');
  const [disliked, setDisliked] = useState<string>('');
  const [addonOpen, setAddonOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);

  const generate = useMutation({
    mutationFn: async () => {
      // Las alergias del checklist + las que el usuario tipeó como "otras",
      // dedupeadas y limpiadas. El backend acepta máx 20 strings de 40 chars
      // c/u (ai-meal-plans.js z.array(...).max(20)) — recortamos por si acaso.
      const extraAllergies = customAllergies
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.slice(0, 40));
      const allAllergies = Array.from(
        new Set([...allergies, ...extraAllergies]),
      ).slice(0, 20);

      const body: Record<string, unknown> = {
        meals_per_day: mealsPerDay,
        budget,
        country: 'MX',
        restrictions,
        allergies: allAllergies,
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
  // Three layered states for the no-plan view:
  //   1. featureBlocked  → STARTER, can't use the form. Show paywall + addon CTA.
  //   2. quotaExhausted  → has the feature but used it. Show countdown + buy-another addon CTA.
  //   3. canGenerate     → form, optionally with "addon active" banner.
  const featureBlocked = mp?.limit === 0 && !mp?.from_addon;
  const quotaExhausted = mp && !featureBlocked && mp.allowed === false;
  const fromAddon = !!mp?.from_addon;
  const disableGenerate = !!mp && !mp.allowed;

  function toggle(list: string[], setList: (v: string[]) => void, v: string) {
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  /* ── 1) STARTER paywall — no form, sell the add-on ─────────────── */
  if (featureBlocked) {
    return (
      <div className="space-y-6">
        <MealPlanAddonModal
          open={addonOpen}
          onClose={() => setAddonOpen(false)}
          onSuccess={() => {
            // Quota refresh will flip featureBlocked off → form appears.
            onCreated();
          }}
        />
        <PlansModal
          open={plansOpen}
          onClose={() => setPlansOpen(false)}
          highlightPlan="PRO"
        />

        <EditorialHero
          eyebrow="Nutrición a tu medida"
          title="Tu plan alimenticio a tu medida"
          subtitle="Comidas mexicanas, macros calibrados a tu objetivo, lista de compras lista. Sin pensar."
        />

        <PaywallSection
          plan={quota?.plan}
          onBuyAddon={() => setAddonOpen(true)}
          onUpgradePlan={() => setPlansOpen(true)}
        />
      </div>
    );
  }

  /* ── 2) Quota exhausted — countdown + offer another addon ──────── */
  if (quotaExhausted && quota) {
    return (
      <div className="space-y-6">
        <MealPlanAddonModal
          open={addonOpen}
          onClose={() => setAddonOpen(false)}
          onSuccess={onCreated}
        />

        <EditorialHero
          variant="compact"
          eyebrow="Ya generaste tu plan"
          title="Próximo plan en camino"
          subtitle="Esperamos al renovar tu periodo o puedes comprar un plan extra."
        />

        <ExhaustedCountdown quota={quota} onBuyAddon={() => setAddonOpen(true)} />
      </div>
    );
  }

  /* ── 3) Form — quota available (or unlimited / addon active) ──── */
  return (
    <div className="space-y-4 sm:space-y-6">
      <AIGenerationOverlay open={generate.isPending} kind="meal_plan" />
      <MealPlanAddonModal
        open={addonOpen}
        onClose={() => setAddonOpen(false)}
        onSuccess={onCreated}
      />

      <EditorialHero
        eyebrow="Tu nutrición a medida"
        title="Diseña tu plan en 1 minuto"
        subtitle="Ajustamos calorías y macros a tu objetivo. Tú solo cocinas."
        chips={['6 comidas/día', 'Ingredientes mexicanos', 'Lista de compras']}
        statusChip={fromAddon ? { label: 'Plan extra activo', tone: 'emerald' } : undefined}
      />

      {/* Generate form — vertical sections with iconed headers.
          Profile-incomplete notice and addon-active note live INSIDE the form
          card so the no-plan view reads as one cohesive block on mobile. */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm divide-y divide-slate-100">
        {!profileCompleted && (
          <div className="flex items-start gap-3 bg-amber-50/70 border-b border-amber-200 px-5 py-3 text-sm">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-amber-900 font-semibold leading-tight">
                Completa tu perfil primero
              </p>
              <p className="text-amber-800/80 mt-0.5 text-xs leading-snug">
                Edad, peso y altura para calcular calorías óptimas.
              </p>
            </div>
            <Link
              href="/portal/perfil"
              className="shrink-0 text-amber-700 hover:text-amber-800 font-semibold text-xs self-center inline-flex items-center gap-1"
            >
              Completar
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        <FormSection
          icon={<Flame className="h-4 w-4" />}
          title="Calorías objetivo"
          hint="Déjalo vacío y lo calculamos desde tu perfil"
        >
          <input
            type="number"
            inputMode="numeric"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            placeholder="Ej: 2400"
            className="w-full sm:w-60 bg-white border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 outline-none transition"
          />
        </FormSection>

        <FormSection
          icon={<Utensils className="h-4 w-4" />}
          title="Comidas al día"
        >
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {[3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMealsPerDay(n as 3 | 4 | 5)}
                className={`px-6 py-2 rounded-lg text-sm font-semibold transition ${
                  mealsPerDay === n
                    ? 'bg-white shadow-sm ring-1 ring-slate-200 text-slate-900'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </FormSection>

        <FormSection
          icon={<ShoppingCart className="h-4 w-4" />}
          title="Presupuesto"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {BUDGETS.map((b) => (
              <label
                key={b.value}
                className={`cursor-pointer rounded-xl ring-1 px-4 py-3 text-sm transition ${
                  budget === b.value
                    ? 'ring-blue-600 bg-blue-50 text-blue-900 shadow-sm'
                    : 'ring-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:ring-slate-300'
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
                <div
                  className={`text-xs mt-0.5 ${
                    budget === b.value ? 'text-blue-700' : 'text-slate-500'
                  }`}
                >
                  {b.hint}
                </div>
              </label>
            ))}
          </div>
        </FormSection>

        <FormSection
          icon={<CheckCircle2 className="h-4 w-4" />}
          title="Tipo de dieta"
          hint="Marca si sigues alguna. Si comes de todo, déjalo en blanco."
        >
          <CheckGrid
            options={RESTRICTIONS}
            value={restrictions}
            onToggle={(v) => toggle(restrictions, setRestrictions, v)}
          />
        </FormSection>

        <FormSection
          icon={<AlertCircle className="h-4 w-4" />}
          title="Alergias"
          hint="Marca lo que NO puedes comer por alergia."
        >
          <CheckGrid
            options={ALLERGIES}
            value={allergies}
            onToggle={(v) => toggle(allergies, setAllergies, v)}
          />
          <div className="mt-3">
            <label
              htmlFor="other-allergies"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
            >
              ¿Otra alergia?
            </label>
            <input
              id="other-allergies"
              type="text"
              value={customAllergies}
              onChange={(e) => setCustomAllergies(e.target.value)}
              placeholder="Ej: kiwi, fresa, ajonjolí"
              className="w-full bg-white border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 outline-none transition"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Sepáralas con comas. La IA las evitará en todo el plan.
            </p>
          </div>
        </FormSection>

        <FormSection
          icon={<Apple className="h-4 w-4" />}
          title="Alimentos que no te gustan"
          hint="Separa con comas"
        >
          <textarea
            rows={2}
            value={disliked}
            onChange={(e) => setDisliked(e.target.value)}
            placeholder="brócoli, hígado, atún…"
            className="w-full bg-white border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 outline-none transition"
          />
        </FormSection>

        <div className="p-5 sm:p-6 space-y-3">
          {generate.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {(generate.error as { message?: string })?.message ??
                'No se pudo generar el plan.'}
            </div>
          )}

          {fromAddon && (
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                <strong className="font-semibold">Plan extra listo.</strong>{' '}
                Lo aplicamos al generar tu plan.
              </span>
            </div>
          )}

          <QuotaStatus quota={quota} />

          <button
            type="button"
            onClick={() => generate.mutate()}
            disabled={generate.isPending || disableGenerate}
            className="w-full sm:w-auto inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-base px-6 py-3.5 rounded-xl shadow-sm shadow-blue-600/15 transition"
          >
            {generate.isPending
              ? 'Generando…'
              : quotaExhausted
                ? 'Sin planes disponibles este periodo'
                : 'Generar mi plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
 * Paywall — shown to STARTER users (feature not in plan)
 * =========================================================================*/

function PaywallSection({
  plan,
  onBuyAddon,
  onUpgradePlan,
}: {
  plan?: AiQuota['plan'];
  onBuyAddon: () => void;
  onUpgradePlan: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 sm:p-6">
      {/* Header: small meta label */}
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        <Lock className="h-3.5 w-3.5" />
        Función bloqueada
      </div>

      {/* Title + one-line pitch */}
      <h2 className="font-display mt-2 text-2xl sm:text-[1.75rem] leading-tight text-slate-900">
        Desbloquea tu plan alimenticio
      </h2>
      <p className="mt-1.5 text-sm text-slate-600">
        {plan === 'STARTER' ? 'Tu membresía Básico no lo incluye. ' : ''}
        Plan personalizado · ingredientes mexicanos · lista de compras.
      </p>

      {/* Primary — solid brand blue, price inline */}
      <button
        type="button"
        onClick={onBuyAddon}
        className="group mt-5 flex w-full items-center justify-center gap-3 rounded-xl bg-blue-600 px-5 py-3.5 font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 hover:shadow-md"
      >
        <span>Quiero mi plan</span>
        <span className="inline-flex items-baseline gap-1 rounded-lg bg-white/15 px-2.5 py-0.5 tabular-nums">
          <span className="text-sm font-bold">$499</span>
          <span className="text-[10px] font-semibold opacity-80">MXN</span>
        </span>
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </button>

      {/* Secondary — outlined full-width button, opens PlansModal in-place */}
      <button
        type="button"
        onClick={onUpgradePlan}
        className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
      >
        Ver planes PRO y Élite
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/* =========================================================================
 * Quota exhausted countdown — circular indicator + addon CTA
 * =========================================================================*/

function ExhaustedCountdown({
  quota,
  onBuyAddon,
}: {
  quota: AiQuota;
  onBuyAddon: () => void;
}) {
  const quotaDays = quota.days_until_renewal;
  const memberDays = quota.membership_days_remaining ?? Number.POSITIVE_INFINITY;
  const membershipEndsFirst = memberDays < quotaDays;
  const days = membershipEndsFirst ? memberDays : quotaDays;

  // Progress: assume a 30-day base window, clamp to [0, 1].
  const pct = Math.max(0, Math.min(1, 1 - days / 30));
  const circumference = 2 * Math.PI * 38;
  const dash = circumference * pct;

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-6">
        {/* Circular countdown */}
        <div className="shrink-0 mx-auto sm:mx-0">
          <div className="relative h-24 w-24">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r="38" stroke="#e2e8f0" strokeWidth="8" fill="none" />
              <circle
                cx="50"
                cy="50"
                r="38"
                stroke="#2563eb"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${dash} ${circumference}`}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-display text-2xl font-bold text-slate-900 tabular-nums leading-none">
                {Number.isFinite(days) ? days : '—'}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mt-0.5">
                día{days === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0 text-center sm:text-left">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
            {membershipEndsFirst ? 'Membresía' : 'Renovación'}
          </div>
          <h3 className="font-display text-xl sm:text-2xl text-slate-900 mt-1">
            {membershipEndsFirst
              ? `Tu membresía vence en ${days} día${days === 1 ? '' : 's'}`
              : `Tu próximo plan llega en ${days} día${days === 1 ? '' : 's'}`}
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            {membershipEndsFirst
              ? 'Renueva tu membresía o compra un plan suelto sin esperar.'
              : 'Si no quieres esperar, compra un plan extra por una sola vez.'}
          </p>

          <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
            <button
              type="button"
              onClick={onBuyAddon}
              className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase tracking-[0.12em] text-xs px-5 py-3 rounded-xl shadow-sm shadow-blue-600/25 transition"
            >
              <Plus className="h-4 w-4" />
              Comprar otro plan · $499
            </button>
            {membershipEndsFirst && (
              <Link
                href="/portal/membership"
                className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-2"
              >
                Renovar membresía
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
 * Quota status (inline) — for the form view
 * =========================================================================*/

function QuotaStatus({ quota }: { quota?: AiQuota }) {
  if (!quota) return null;
  const mp = quota.meal_plan;

  if (mp.unlimited) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Apple className="w-4 h-4 text-blue-500" />
        Planes alimenticios ilimitados con tu plan {quota.plan ? planDisplayName(quota.plan) : 'actual'}.
      </div>
    );
  }

  if (mp.from_addon) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2 className="w-4 h-4" />
        Plan extra activo — listo para generar tu plan.
      </div>
    );
  }

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

/* =========================================================================
 * Form helpers
 * =========================================================================*/

function FormSection({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
          {icon}
        </span>
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.12em] text-slate-900">
          {title}
        </h3>
      </div>
      {children}
      {hint && <p className="text-xs text-slate-500 mt-2">{hint}</p>}
    </section>
  );
}

function CheckGrid({
  options,
  value,
  onToggle,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={`rounded-xl ring-1 px-3 py-2.5 text-sm text-left transition ${
              on
                ? 'ring-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                : 'ring-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span
              className={`inline-block w-3.5 h-3.5 rounded-sm mr-2 align-middle ring-1 ${
                on ? 'ring-white' : 'ring-slate-400'
              }`}
            >
              {on && <span className="block w-full h-full bg-white rounded-sm" />}
            </span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================================
 * Active plan view — redesigned
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
  const [addonOpen, setAddonOpen] = useState(false);

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
      const r = await api.post(
        '/ai/meal-plans/generate',
        { country: 'MX' },
        { timeout: 90_000 },
      );
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
  // Allow buying-another only when the user is not unlimited (ELITE) and
  // the membership is active (otherwise backend will reject anyway).
  const canBuyAnother = !!quota && !mp?.unlimited && !!quota.has_active_membership;

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

  // Per-day totals (used as a tiny calorie indicator on the day pills).
  const dayCalorieTotals = useMemo(() => {
    const map = new Map<number, number>();
    for (const [d, ms] of byDay.entries()) {
      const sum = ms.reduce((acc, m) => acc + (m.calories ?? 0), 0);
      map.set(d, sum);
    }
    return map;
  }, [byDay]);

  return (
    <div className="space-y-6 pb-24 sm:pb-6">
      <AIGenerationOverlay open={regenerate.isPending} kind="meal_plan" />
      <MealPlanAddonModal
        open={addonOpen}
        onClose={() => setAddonOpen(false)}
        onSuccess={onRegenerated}
      />

      {/* Compact hero with name/goal + desktop toolbar */}
      <section className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-emerald-400 to-transparent" />
        <div className="absolute -top-24 -right-20 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative px-5 sm:px-7 py-6 sm:py-7">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                <Apple className="h-3.5 w-3.5" />
                Plan activo
              </div>
              <h1 className="font-display mt-1 text-3xl sm:text-4xl leading-tight text-slate-900">
                {plan.name}
              </h1>
              {plan.goal && (
                <p className="text-slate-500 mt-1 text-sm">{plan.goal}</p>
              )}
            </div>

            {/* Desktop toolbar */}
            <div className="hidden md:flex md:flex-wrap md:gap-2">
              <ToolbarButton
                onClick={() => regenerate.mutate()}
                disabled={regenerate.isPending || regenerateDisabled}
                title={regenerateDisabled ? 'Quota agotada este periodo' : undefined}
                icon={<RefreshCw className={`h-4 w-4 ${regenerate.isPending ? 'animate-spin' : ''}`} />}
                label={regenerate.isPending ? 'Regenerando…' : 'Regenerar'}
              />
              <ToolbarButton
                onClick={downloadShoppingList}
                disabled={downloading}
                icon={<Download className="h-4 w-4" />}
                label={downloading ? 'Generando…' : 'Lista de compras'}
              />
              {canBuyAnother && (
                <ToolbarButton
                  onClick={() => setAddonOpen(true)}
                  icon={<Plus className="h-4 w-4" />}
                  label="Comprar otro (+$499)"
                  primary
                />
              )}
            </div>
          </div>

          {/* Macro stats — bar chart row */}
          <MacroBars
            calories={plan.calories_target}
            protein={plan.protein_g}
            carbs={plan.carbs_g}
            fats={plan.fats_g}
          />
        </div>
      </section>

      {/* Day tabs */}
      <div className="-mx-4 sm:mx-0 overflow-x-auto scrollbar-none">
        <div className="flex gap-2 px-4 sm:px-0 py-2 min-w-max sm:justify-center snap-x snap-mandatory">
          {availableDays.map((d) => {
            const active = d === activeDay;
            const cals = dayCalorieTotals.get(d) ?? 0;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setActiveDay(d)}
                className={`snap-start shrink-0 relative flex items-center gap-2 pl-2.5 pr-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  active
                    ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-md shadow-blue-600/25 ring-1 ring-blue-500'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300 hover:text-slate-900'
                }`}
              >
                <span
                  className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {d}
                </span>
                <span>{DAYS_ES[d] ?? `D${d}`}</span>
                {cals > 0 && (
                  <span
                    className={`text-[10px] tabular-nums ${
                      active ? 'text-white/80' : 'text-slate-400'
                    }`}
                  >
                    {cals}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Meals */}
      <div className="space-y-4">
        {meals.length === 0 ? (
          <div className="text-slate-500 text-sm">No hay comidas para este día.</div>
        ) : (
          meals.map((m, i) => <MealCard key={`${m.meal_type}-${i}`} meal={m} />)
        )}
      </div>

      {/* Mobile sticky toolbar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 bg-gradient-to-t from-white via-white/95 to-transparent">
        <div className="flex gap-2 rounded-2xl bg-white ring-1 ring-slate-200 shadow-lg p-2">
          <ToolbarButton
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending || regenerateDisabled}
            icon={<RefreshCw className={`h-4 w-4 ${regenerate.isPending ? 'animate-spin' : ''}`} />}
            label="Regenerar"
            compact
          />
          <ToolbarButton
            onClick={downloadShoppingList}
            disabled={downloading}
            icon={<Download className="h-4 w-4" />}
            label="Lista"
            compact
          />
          {canBuyAnother && (
            <ToolbarButton
              onClick={() => setAddonOpen(true)}
              icon={<Plus className="h-4 w-4" />}
              label="+$499"
              compact
              primary
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  disabled,
  icon,
  label,
  primary,
  compact,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  compact?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed ${
        primary
          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20'
          : 'bg-white ring-1 ring-slate-300 hover:bg-slate-50 text-slate-700'
      } ${compact ? 'flex-1 px-3 py-2.5 text-xs' : 'px-4 py-2'}`}
    >
      {icon}
      {label}
    </button>
  );
}

function MacroBars({
  calories,
  protein,
  carbs,
  fats,
}: {
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
}) {
  // Normalize the bars against the largest macro-gram value so the
  // visual relationship between them is honest. Calories live in their
  // own column with a different unit so we don't normalize against it.
  const macroMax = Math.max(protein ?? 0, carbs ?? 0, fats ?? 0, 1);
  const macros: { key: string; label: string; value?: number; color: string; icon: React.ReactNode }[] = [
    {
      key: 'protein',
      label: 'Proteína',
      value: protein,
      color: 'bg-blue-500',
      icon: <Dumbbell className="h-3.5 w-3.5" />,
    },
    {
      key: 'carbs',
      label: 'Carbos',
      value: carbs,
      color: 'bg-amber-500',
      icon: <Wheat className="h-3.5 w-3.5" />,
    },
    {
      key: 'fats',
      label: 'Grasas',
      value: fats,
      color: 'bg-emerald-500',
      icon: <Droplet className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-3">
      {/* Calorie hero stat */}
      <div className="rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 p-4 text-white">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/85">
          <Flame className="h-3.5 w-3.5" />
          Calorías día
        </div>
        <div className="mt-1.5 flex items-baseline gap-1">
          <span className="font-display text-3xl font-bold tabular-nums">
            {calories ?? '—'}
          </span>
          <span className="text-xs text-white/80">kcal</span>
        </div>
      </div>
      {/* Macro bars */}
      <div className="sm:col-span-3 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4 space-y-3">
        {macros.map((m) => {
          const pct = m.value ? Math.max(4, Math.round((m.value / macroMax) * 100)) : 0;
          return (
            <div key={m.key}>
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                  <span className="text-slate-500">{m.icon}</span>
                  {m.label}
                </span>
                <span className="tabular-nums text-slate-900">
                  <strong>{m.value ?? '—'}</strong>
                  <span className="text-slate-500 ml-0.5">g</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full ${m.color} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
 * Meal card — image full-width, content below, ingredient pills, expand toggle
 * =========================================================================*/

function MealCard({ meal }: { meal: Meal }) {
  const [open, setOpen] = useState(false);
  const img = MEAL_IMAGES[meal.meal_type];
  const badge = MEAL_TYPE_ES[meal.meal_type] ?? meal.meal_type;

  // Show ingredients as pills only when the list is short enough to look
  // tidy (more than ~10 turns into a wall). Beyond that we fall back to
  // a list inside the expanded body.
  const fewIngredients =
    !!meal.ingredients && meal.ingredients.length > 0 && meal.ingredients.length <= 10;
  const manyIngredients =
    !!meal.ingredients && meal.ingredients.length > 10;

  return (
    <article className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl overflow-hidden">
      {/* Image hero — full width */}
      <div className="relative aspect-[16/9] bg-slate-200 overflow-hidden">
        <img
          src={img}
          alt={meal.name}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 via-transparent to-transparent" />
        <span className="absolute top-3 left-3 inline-flex items-center text-[10px] uppercase tracking-[0.18em] font-bold px-2.5 py-1 rounded-full bg-white/95 text-blue-700 ring-1 ring-blue-200 shadow-sm backdrop-blur">
          {badge}
        </span>
      </div>

      {/* Body */}
      <div className="p-5 sm:p-6">
        <h3 className="font-display text-xl sm:text-2xl text-slate-900 leading-tight">
          {meal.name}
        </h3>
        {meal.description && (
          <p className="italic text-slate-500 text-sm mt-1.5">{meal.description}</p>
        )}

        {/* Ingredient pills (when short) */}
        {fewIngredients && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {meal.ingredients!.map((ing, i) => (
              <span
                key={i}
                className="inline-block text-xs text-slate-700 bg-slate-100 ring-1 ring-slate-200 rounded-full px-3 py-1"
              >
                {ing}
              </span>
            ))}
          </div>
        )}

        {/* Stat pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          {typeof meal.calories === 'number' && (
            <StatPill
              icon={<Flame className="h-3.5 w-3.5 text-amber-500" />}
              value={`${meal.calories}`}
              unit="kcal"
            />
          )}
          {typeof meal.protein_g === 'number' && (
            <StatPill
              icon={<Dumbbell className="h-3.5 w-3.5 text-blue-600" />}
              value={`${meal.protein_g}g`}
              unit="prot"
            />
          )}
          {typeof meal.carbs_g === 'number' && (
            <StatPill
              icon={<Wheat className="h-3.5 w-3.5 text-amber-500" />}
              value={`${meal.carbs_g}g`}
              unit="carb"
            />
          )}
          {typeof meal.fats_g === 'number' && (
            <StatPill
              icon={<Droplet className="h-3.5 w-3.5 text-emerald-500" />}
              value={`${meal.fats_g}g`}
              unit="grasa"
            />
          )}
          {typeof meal.prep_time_min === 'number' && (
            <StatPill
              icon={<Clock className="h-3.5 w-3.5 text-slate-400" />}
              value={`${meal.prep_time_min}`}
              unit="min"
            />
          )}
        </div>

        {/* Expand toggle — only when there's something interesting hidden */}
        {(manyIngredients || (fewIngredients && meal.description)) && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-blue-700 hover:text-blue-800"
          >
            {open ? 'Ocultar receta' : 'Ver receta completa'}
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}

        {open && manyIngredients && (
          <ul className="mt-3 list-disc list-inside text-sm text-slate-700 space-y-0.5 bg-slate-50 rounded-xl p-4 ring-1 ring-slate-200">
            {meal.ingredients!.map((ing, i) => (
              <li key={i}>{ing}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function StatPill({
  icon,
  value,
  unit,
}: {
  icon: React.ReactNode;
  value: string;
  unit: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-50 ring-1 ring-slate-200 rounded-full px-2.5 py-1">
      {icon}
      <strong className="text-slate-900 tabular-nums">{value}</strong>
      <span className="text-slate-500">{unit}</span>
    </span>
  );
}
