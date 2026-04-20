// ─────────────────────────────────────────────────────────────────
// Membership helpers — pricing catalog + date math + promo discount
// application. Keeps the route handlers thin.
//
// Prices are in MXN pesos (integers, NOT centavos) to match the
// Prisma field `price_mxn Int`. The UI shows pesos too.
// ─────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';

// ────────────────────────────────────────────────────────────────
// Catalog. Keep in sync with the /plans endpoint contract.
// ────────────────────────────────────────────────────────────────
export const PLAN_CATALOG = [
    {
        code: 'STARTER',
        name: 'Starter',
        monthly: 690,
        quarterly: 1890,
        annual: 6890,
    },
    {
        code: 'PRO',
        name: 'Pro',
        monthly: 1290,
        quarterly: 3590,
        annual: 13290,
    },
    {
        code: 'ELITE',
        name: 'Élite',
        monthly: 2290,
        quarterly: 6390,
        annual: 23590,
    },
];

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
    getPlanByCode,
    computeExpiresAt,
    daysRemaining,
    earlyRenewalDiscount,
    applyPromoToAmount,
};
