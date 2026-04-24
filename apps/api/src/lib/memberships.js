// ─────────────────────────────────────────────────────────────────
// Membership helpers — pricing catalog + date math + promo discount
// application. Keeps the route handlers thin.
//
// Prices are in MXN pesos (integers, NOT centavos) to match the
// Prisma field `price_mxn Int`. The UI shows pesos too.
// ─────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import { SETTING_KEYS, getWorkspaceSettings } from './settings.js';

// ────────────────────────────────────────────────────────────────
// Catalog. Keep in sync with the /plans endpoint contract.
//
// This is the canonical source of truth for plans, prices and
// feature bullets. The landing page and portal MUST fetch this
// via GET /memberships/plans instead of hardcoding copy.
//
// NOTE: `monthly`/`quarterly`/`annual` are legacy short keys kept
// for back-compat with getPlanPrice(). The richer public contract
// (what /memberships/plans returns) also exposes the same values
// under explicit `monthly_price_mxn` / `quarterly_price_mxn` /
// `annual_price_mxn` keys, plus `duration_days_monthly` and
// `features[]` — these are the fields the frontend consumes.
// ────────────────────────────────────────────────────────────────
// AI quotas are enforced per 30-day sub-period anchored to
// `membership.starts_at` (see lib/ai-quota.js). `null` = unlimited,
// `0` = feature not included in the plan.
export const PLAN_CATALOG = [
    {
        code: 'STARTER',
        id: 'STARTER',
        name: 'Básico',
        tagline: 'Para empezar',
        monthly: 599,
        quarterly: 1617,
        annual: 5750,
        monthly_price_mxn: 599,
        quarterly_price_mxn: 1617,
        annual_price_mxn: 5750,
        duration_days_monthly: 30,
        ai_routines_per_month: 1,
        ai_meal_plans_per_month: 0,
        features: [
            '1 visita al día al gym',
            '1 rutina gratis generada en la app',
            'Panel del atleta + progreso',
        ],
        popular: false,
    },
    {
        code: 'PRO',
        id: 'PRO',
        name: 'Pro',
        tagline: 'Atleta regular',
        monthly: 999,
        quarterly: 2697,
        annual: 9590,
        monthly_price_mxn: 999,
        quarterly_price_mxn: 2697,
        annual_price_mxn: 9590,
        duration_days_monthly: 30,
        ai_routines_per_month: null,
        ai_meal_plans_per_month: 1,
        features: [
            'Entradas ilimitadas al día (AM + PM)',
            'Genera rutinas ilimitadas desde la app',
            'Plan de comidas básico en la app',
            'Precio de socio en tienda',
            '2 congelamientos al año',
            '1 pase de invitado al mes',
        ],
        popular: true,
    },
    {
        code: 'ELITE',
        id: 'ELITE',
        name: 'Élite',
        tagline: 'Preparación deportiva',
        monthly: 1590,
        quarterly: 4293,
        annual: 15264,
        monthly_price_mxn: 1590,
        quarterly_price_mxn: 4293,
        annual_price_mxn: 15264,
        duration_days_monthly: 30,
        ai_routines_per_month: null,
        ai_meal_plans_per_month: null,
        features: [
            'Todo lo del plan Pro',
            'Rutina específica por deporte (football, powerlifting, HYROX, etc.)',
            'Nutrición personalizada con bioimpedancia cada 2 meses',
            'Feedback de video cada 2 semanas',
            'WhatsApp directo (1 consulta por semana)',
            'Precio de socio preferente en tienda',
        ],
        popular: false,
    },
];

// Public-contract shape for GET /memberships/plans — strips the
// internal `monthly`/`quarterly`/`annual` aliases so the external
// API is clean, and projects only the fields the landing/portal
// actually need.
//
// NOTE: this is the non-DB variant. Use `getMergedPublicPlanCatalog`
// from routes that have a prisma + workspace handy so admin-editable
// overrides get applied. This one is kept for sync call sites that
// predate the override table (e.g. legacy callers that never mutated
// prices anyway).
export function getPublicPlanCatalog() {
    return PLAN_CATALOG.map((p) => ({
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        monthly_price_mxn: p.monthly_price_mxn,
        quarterly_price_mxn: p.quarterly_price_mxn,
        annual_price_mxn: p.annual_price_mxn,
        duration_days_monthly: p.duration_days_monthly,
        ai_routines_per_month: p.ai_routines_per_month ?? null,
        ai_meal_plans_per_month: p.ai_meal_plans_per_month ?? null,
        features: [...p.features],
        popular: p.popular,
        enabled: true,
    }));
}

// DB-aware variant. Reads the `plan.overrides` setting for the
// workspace and overlays any non-null fields on top of the in-code
// catalog. Returns the same shape as `getPublicPlanCatalog()` plus
// an explicit `enabled` flag.
//
// Contract for overrides:
//   { STARTER: { monthly_price_mxn?, quarterly_price_mxn?,
//                annual_price_mxn?, enabled? }, PRO: {...}, ELITE: {...} }
//
// Any individual field left undefined/null falls back to the catalog
// default — so admins can override just one cycle without having to
// restate the others.
export async function getMergedPublicPlanCatalog(prisma, workspaceId) {
    const base = getPublicPlanCatalog();
    if (!prisma || !workspaceId) return base;

    let overrides = {};
    try {
        const settings = await getWorkspaceSettings(prisma, workspaceId, [
            SETTING_KEYS.PLAN_OVERRIDES,
        ]);
        overrides = settings[SETTING_KEYS.PLAN_OVERRIDES] || {};
    } catch {
        // If the settings table is missing (pre-migration deploy)
        // we degrade gracefully to the hardcoded catalog rather
        // than 500 the public /plans endpoint.
        return base;
    }

    return base.map((p) => {
        const o = overrides[p.id] || {};
        return {
            ...p,
            monthly_price_mxn:
                typeof o.monthly_price_mxn === 'number'
                    ? o.monthly_price_mxn
                    : p.monthly_price_mxn,
            quarterly_price_mxn:
                typeof o.quarterly_price_mxn === 'number'
                    ? o.quarterly_price_mxn
                    : p.quarterly_price_mxn,
            annual_price_mxn:
                typeof o.annual_price_mxn === 'number'
                    ? o.annual_price_mxn
                    : p.annual_price_mxn,
            enabled: typeof o.enabled === 'boolean' ? o.enabled : true,
        };
    });
}

// Price lookup that respects admin overrides. Used by the subscribe
// flows so a member pays what the admin configured, not what's
// hardcoded. Falls back to the catalog default if no override exists
// (or the lookup fails), matching `getPlanPrice` semantics.
export async function getEffectivePlanPrice(prisma, workspaceId, planCode, billingCycle) {
    const catalogPrice = getPlanPrice(planCode, billingCycle);
    if (!prisma || !workspaceId) return catalogPrice;

    let overrides = {};
    try {
        const settings = await getWorkspaceSettings(prisma, workspaceId, [
            SETTING_KEYS.PLAN_OVERRIDES,
        ]);
        overrides = settings[SETTING_KEYS.PLAN_OVERRIDES] || {};
    } catch {
        return catalogPrice;
    }

    const o = overrides[planCode] || {};
    const key =
        billingCycle === 'MONTHLY'
            ? 'monthly_price_mxn'
            : billingCycle === 'QUARTERLY'
                ? 'quarterly_price_mxn'
                : billingCycle === 'ANNUAL'
                    ? 'annual_price_mxn'
                    : null;
    if (!key) return catalogPrice;
    return typeof o[key] === 'number' ? o[key] : catalogPrice;
}

export const VALID_PLANS = PLAN_CATALOG.map((p) => p.code);
export const VALID_CYCLES = ['MONTHLY', 'QUARTERLY', 'ANNUAL'];

// Plan rank for "≥ PRO" comparisons (freeze auto-approval etc.).
export const PLAN_RANK = { STARTER: 1, PRO: 2, ELITE: 3 };

// ────────────────────────────────────────────────────────────────
// Pricing lookup.
// ────────────────────────────────────────────────────────────────
export function getPlanPrice(planCode, billingCycle) {
    const plan = PLAN_CATALOG.find((p) => p.code === planCode);
    if (!plan) return null;
    switch (billingCycle) {
        case 'MONTHLY':
            return plan.monthly;
        case 'QUARTERLY':
            return plan.quarterly;
        case 'ANNUAL':
            return plan.annual;
        default:
            return null;
    }
}

export function getPlanByCode(planCode) {
    return PLAN_CATALOG.find((p) => p.code === planCode) || null;
}

// ────────────────────────────────────────────────────────────────
// Expires-at math.
//
// When the webhook flips a payment to APPROVED we extend (or
// start) the membership. If the user still has days left we add
// the new cycle on top of `expires_at`, otherwise on top of
// `now` (paused / expired memberships shouldn't get retro credit).
// ────────────────────────────────────────────────────────────────
export function computeExpiresAt(billingCycle, from = new Date()) {
    const base = dayjs(from);
    switch (billingCycle) {
        case 'MONTHLY':
            return base.add(1, 'month').toDate();
        case 'QUARTERLY':
            return base.add(3, 'month').toDate();
        case 'ANNUAL':
            return base.add(12, 'month').toDate();
        default:
            return base.add(1, 'month').toDate();
    }
}

// Days remaining until `expires_at`. Floor so "0.9 days left" reads as 0.
export function daysRemaining(expiresAt) {
    if (!expiresAt) return 0;
    const diff = dayjs(expiresAt).diff(dayjs(), 'day');
    return diff > 0 ? diff : 0;
}

// Early renewal discount: if we're within 8 days of expiry (or
// already expired), apply 20 % off.
export function earlyRenewalDiscount(expiresAt, priceMxn) {
    const remaining = dayjs(expiresAt).diff(dayjs(), 'day');
    if (remaining <= 8) {
        return Math.round(priceMxn * 0.8);
    }
    return priceMxn;
}

// ────────────────────────────────────────────────────────────────
// Promo-code validation + application.
//
// Returns { valid, reason?, discount_mxn, final_amount, promo? }.
// The caller is responsible for persisting `used_count` bumps
// once the payment actually lands (avoid double-counting on
// pending checkouts).
// ────────────────────────────────────────────────────────────────
export function applyPromoToAmount(promo, amountMxn, appliesTo) {
    if (!promo) {
        return { valid: false, reason: 'NOT_FOUND', discount_mxn: 0, final_amount: amountMxn };
    }
    if (!promo.enabled) {
        return { valid: false, reason: 'DISABLED', discount_mxn: 0, final_amount: amountMxn };
    }
    if (promo.expires_at && dayjs(promo.expires_at).isBefore(dayjs())) {
        return { valid: false, reason: 'EXPIRED', discount_mxn: 0, final_amount: amountMxn };
    }
    if (promo.max_uses != null && promo.used_count >= promo.max_uses) {
        return { valid: false, reason: 'EXHAUSTED', discount_mxn: 0, final_amount: amountMxn };
    }
    if (promo.min_amount_mxn != null && amountMxn < promo.min_amount_mxn) {
        return { valid: false, reason: 'MIN_AMOUNT', discount_mxn: 0, final_amount: amountMxn };
    }
    if (
        appliesTo &&
        Array.isArray(promo.applies_to) &&
        promo.applies_to.length &&
        !promo.applies_to.includes(appliesTo)
    ) {
        return { valid: false, reason: 'NOT_APPLICABLE', discount_mxn: 0, final_amount: amountMxn };
    }

    let discount = 0;
    if (promo.type === 'PERCENTAGE') {
        discount = Math.round((amountMxn * promo.value) / 100);
    } else if (promo.type === 'FIXED_AMOUNT') {
        discount = promo.value;
    }
    if (discount > amountMxn) discount = amountMxn;

    return {
        valid: true,
        discount_mxn: discount,
        final_amount: amountMxn - discount,
        promo,
    };
}

export default {
    PLAN_CATALOG,
    VALID_PLANS,
    VALID_CYCLES,
    PLAN_RANK,
    getPlanPrice,
    getEffectivePlanPrice,
    getPlanByCode,
    getPublicPlanCatalog,
    getMergedPublicPlanCatalog,
    computeExpiresAt,
    daysRemaining,
    earlyRenewalDiscount,
    applyPromoToAmount,
};
