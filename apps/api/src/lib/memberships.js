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
// NOTE: only monthly billing exists. The catalog still keeps both
// `monthly` (short alias for getPlanPrice) and `monthly_price_mxn`
// (explicit key in the public /memberships/plans contract).
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
        monthly: 630,
        monthly_price_mxn: 630,
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
        monthly: 1415,
        monthly_price_mxn: 1415,
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
        monthly: 1935,
        monthly_price_mxn: 1935,
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

// Public-contract shape for GET /memberships/plans — projects only the
// fields the landing/portal actually need. We only support MONTHLY now;
// quarterly/annual were dropped.
export function getPublicPlanCatalog() {
    return PLAN_CATALOG.map((p) => ({
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        monthly_price_mxn: p.monthly_price_mxn,
        duration_days_monthly: p.duration_days_monthly,
        ai_routines_per_month: p.ai_routines_per_month ?? null,
        ai_meal_plans_per_month: p.ai_meal_plans_per_month ?? null,
        features: [...p.features],
        popular: p.popular,
        enabled: true,
    }));
}

// DB-aware variant. Reads `plan.overrides` setting and overlays any
// non-null fields. Contract:
//   { STARTER: { monthly_price_mxn?, enabled? }, PRO: {...}, ELITE: {...} }
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
    if (billingCycle !== 'MONTHLY') return catalogPrice;
    return typeof o.monthly_price_mxn === 'number'
        ? o.monthly_price_mxn
        : catalogPrice;
}

export const VALID_PLANS = PLAN_CATALOG.map((p) => p.code);
export const VALID_CYCLES = ['MONTHLY'];

// Plan rank for "≥ PRO" comparisons (freeze auto-approval etc.).
export const PLAN_RANK = { STARTER: 1, PRO: 2, ELITE: 3 };

// One-time inscription fee charged on the first STARTER subscription
// per user. PRO/ELITE no la cobran porque su precio ya la absorbe.
// Once paid (User.inscription_paid_at != null) it is never charged
// again, even on plan changes, renewals, or re-subscribe after a
// cancellation. Stripe la mete como add_invoice_items en la primera
// factura, así que el socio ve un cargo único de (plan + 100) la
// primera vez y (plan) cada mes después automáticamente.
export const INSCRIPTION_PRICE_MXN = 100;
export const PLANS_WITH_INSCRIPTION = new Set(['STARTER']);

export function planRequiresInscription(planCode) {
    return PLANS_WITH_INSCRIPTION.has(planCode);
}

// ────────────────────────────────────────────────────────────────
// Pricing lookup.
// ────────────────────────────────────────────────────────────────
export function getPlanPrice(planCode, billingCycle = 'MONTHLY') {
    const plan = PLAN_CATALOG.find((p) => p.code === planCode);
    if (!plan) return null;
    return billingCycle === 'MONTHLY' ? plan.monthly : null;
}

export function getPlanByCode(planCode) {
    return PLAN_CATALOG.find((p) => p.code === planCode) || null;
}

// ────────────────────────────────────────────────────────────────
// Human-readable descripciones de pagos en español. El socio ve esto
// en su historial de pagos del portal — antes generábamos strings
// como "Alta walk-in STARTER MONTHLY" que no decían nada al usuario.
//
// kind:
//   'walkin_new'    — alta nueva en recepción (cash/terminal)
//   'walkin_renew'  — renovación en recepción
//   'online_new'    — primer cargo Stripe (suscripción nueva)
//   'online_renew'  — renovación recurrente Stripe
// ────────────────────────────────────────────────────────────────
const CYCLE_LABEL_ES = { MONTHLY: 'mensual' };

export function humanMembershipDescription(planCode, billingCycle, kind) {
    const planName = getPlanByCode(planCode)?.name || planCode;
    const cycleLabel = CYCLE_LABEL_ES[billingCycle] || billingCycle?.toLowerCase() || '';
    const planLine = `Plan ${planName}${cycleLabel ? ` (${cycleLabel})` : ''}`;
    switch (kind) {
        case 'walkin_new':
            return `Inscripción en recepción — ${planLine}`;
        case 'walkin_renew':
            return `Renovación en recepción — ${planLine}`;
        case 'online_new':
            return `Inscripción en línea — ${planLine}`;
        case 'online_renew':
            return `Renovación en línea — ${planLine}`;
        default:
            return planLine;
    }
}

// ────────────────────────────────────────────────────────────────
// Expires-at math.
//
// Suma 1 mes al `from`. Política del gym: cada activación
// (renovación o upgrade) llama a esto con `from = new Date()`, así
// `expires_at` se reinicia a 30 días desde HOY y el socio ve el
// contador volver a 30. Antes apilábamos sobre el expires_at viejo
// (Básico con 25 días + Élite = 55 días), pero confundía al socio
// que esperaba "30 frescos" al pagar el ciclo nuevo.
// ────────────────────────────────────────────────────────────────
export function computeExpiresAt(_billingCycle, from = new Date()) {
    return dayjs(from).add(1, 'month').toDate();
}

// Días restantes hasta `expires_at`.
//
// Semántica: días-CALENDARIO (ambas fechas ancladas a startOf('day')).
// El socio espera que el contador baje en 1 cada medianoche, sin
// importar a qué hora se aplicó la membresía. Antes hacíamos
// `dayjs(expiresAt).diff(now, 'day')` con floor, que cuenta bloques
// de 24 h desde el momento exacto de creación — eso producía la
// percepción de "atorado en 29" porque entre las 14:01 del día de
// creación y las 14:00 del día siguiente el número se mantenía igual,
// y solo saltaba a 28 al cruzar el aniversario horario, no a medianoche.
//
// Casos extremos:
//   - expires_at en el pasado → 0 (ya venció)
//   - expires_at hoy mismo a cualquier hora → 0 (vence hoy, no mañana)
//   - expires_at mañana a cualquier hora → 1
export function daysRemaining(expiresAt) {
    if (!expiresAt) return 0;
    const diff = dayjs(expiresAt)
        .startOf('day')
        .diff(dayjs().startOf('day'), 'day');
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
        !promo.applies_to.includes('ALL') &&
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
    INSCRIPTION_PRICE_MXN,
    PLANS_WITH_INSCRIPTION,
    planRequiresInscription,
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
