// ─────────────────────────────────────────────────────────────────
// Stripe SDK wrapper (lazy singleton).
//
// Same pattern as `openai.js`: instantiating `new Stripe()` with a
// missing key would crash boot for environments where Stripe isn't
// configured (CI, local dev without secrets). Defer to first use.
//
// Helpers:
//   getStripe()                       → returns the singleton client
//   getOrCreateStripeCustomer(...)    → 1:1 user ↔ customer
//   constructWebhookEvent(...)        → signature-verified parse
//   priceIdFor({ plan, cycle })       → STARTER_MONTHLY → price_xxx
//   describePaymentMethod(charge)     → "Visa •••• 4242" — for WA notifications
// ─────────────────────────────────────────────────────────────────

import Stripe from 'stripe';
import { err } from './errors.js';

// Pin the Stripe API version explicitly so a Stripe-side default
// change can't break our payloads silently. Bump this deliberately
// alongside any feature work that touches the API surface.
const STRIPE_API_VERSION = '2024-11-20.acacia';

let _stripe = null;

export function getStripe() {
    if (_stripe) return _stripe;
    if (!process.env.STRIPE_SECRET_KEY) {
        throw err('PAYMENTS_MISCONFIGURED', 'STRIPE_SECRET_KEY is not set', 500);
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: STRIPE_API_VERSION,
        // Emit telemetry-style logs so we can correlate Stripe latency
        // with our own logs when something is slow.
        appInfo: {
            name: 'cedgym',
            version: '1.0.0',
        },
        // Fail-fast on transient network errors instead of hanging
        // request workers. Stripe's defaults (~80s) are way too long.
        timeout: 20_000,
        maxNetworkRetries: 2,
    });
    return _stripe;
}

/**
 * Stripe webhook signature verification — wraps the SDK call so the
 * webhook route stays slim. Throws a 401-tagged error on mismatch so
 * the route can return 401 directly.
 */
export function constructWebhookEvent(rawBody, sigHeader) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
        throw err('PAYMENTS_MISCONFIGURED', 'STRIPE_WEBHOOK_SECRET is not set', 500);
    }
    if (!sigHeader) {
        throw err('STRIPE_BAD_SIGNATURE', 'Missing stripe-signature header', 401);
    }
    const stripe = getStripe();
    try {
        return stripe.webhooks.constructEvent(rawBody, sigHeader, secret);
    } catch (e) {
        // Stripe's error message includes whether the signature was
        // bad vs. the timestamp was outside the tolerance window.
        // Surface it verbatim in the log; never to the client.
        const reason = e?.message || 'verification failed';
        const out = err('STRIPE_BAD_SIGNATURE', `Stripe signature: ${reason}`, 401);
        out.cause = e;
        throw out;
    }
}

/**
 * Idempotent get-or-create of a Stripe Customer for a given local user.
 * Stores `stripe_customer_id` on the User row so subsequent checkouts
 * reuse the same customer (saved cards, history, etc.).
 *
 * @param {object} params
 * @param {import('@prisma/client').PrismaClient} params.prisma
 * @param {object} params.user      Must have id, email|phone|name|workspace_id
 * @returns {Promise<string>}       The Stripe Customer ID (cus_xxx)
 */
export async function getOrCreateStripeCustomer({ prisma, user }) {
    if (!user) throw err('USER_REQUIRED', 'user is required', 500);
    if (user.stripe_customer_id) return user.stripe_customer_id;

    const stripe = getStripe();
    const customer = await stripe.customers.create({
        email: user.email || undefined,
        phone: user.phone || undefined,
        name: user.full_name || user.name || undefined,
        metadata: {
            user_id: user.id,
            workspace_id: user.workspace_id || '',
        },
    });

    await prisma.user.update({
        where: { id: user.id },
        data: { stripe_customer_id: customer.id },
    });
    return customer.id;
}

// ── Price ID resolution ──────────────────────────────────────────
// Membership plan → Stripe Price ID. Cycle is always MONTHLY today
// (BillingCycle enum was reduced to MONTHLY-only on 2026-04-25).
// Pulled from env so we can change prices without a code deploy:
//   STRIPE_PRICE_STARTER_MONTHLY=price_xxx
//   STRIPE_PRICE_PRO_MONTHLY=price_xxx
//   STRIPE_PRICE_ELITE_MONTHLY=price_xxx
//   STRIPE_PRICE_INSCRIPTION=price_xxx   (one-time $100 line item)
// Addon (one-shot) uses STRIPE_PRICE_MEAL_PLAN_ADDON.

const VALID_PLANS = ['STARTER', 'PRO', 'ELITE'];

export function priceIdFor({ plan, cycle = 'MONTHLY' }) {
    if (!VALID_PLANS.includes(plan)) {
        throw err('BAD_PLAN', `Unknown plan: ${plan}`, 400);
    }
    if (cycle !== 'MONTHLY') {
        throw err('BAD_CYCLE', `Only MONTHLY billing is supported, got ${cycle}`, 400);
    }
    const envKey = `STRIPE_PRICE_${plan}_MONTHLY`;
    const priceId = process.env[envKey];
    if (!priceId) {
        throw err(
            'PAYMENTS_MISCONFIGURED',
            `${envKey} is not set — create the Price in Stripe Dashboard and configure the env var`,
            500,
        );
    }
    return priceId;
}

export function mealPlanAddonPriceId() {
    const priceId = process.env.STRIPE_PRICE_MEAL_PLAN_ADDON;
    if (!priceId) {
        throw err(
            'PAYMENTS_MISCONFIGURED',
            'STRIPE_PRICE_MEAL_PLAN_ADDON is not set',
            500,
        );
    }
    return priceId;
}

// One-time $100 MXN line item charged on the FIRST invoice of a
// PRO/ELITE subscription. Stripe's `add_invoice_items[].price_data`
// no acepta `product_data` — exige un Price preexistente. Por eso
// vive aquí y no inline en memberships-stripe.js.
export function inscriptionPriceId() {
    const priceId = process.env.STRIPE_PRICE_INSCRIPTION;
    if (!priceId) {
        throw err(
            'PAYMENTS_MISCONFIGURED',
            'STRIPE_PRICE_INSCRIPTION is not set — create a one-time Price ($100 MXN) in Stripe Dashboard and configure the env var',
            500,
        );
    }
    return priceId;
}

/**
 * Pretty-print a charge's payment method for WhatsApp notifications.
 * Returns "Visa •••• 4242" or "MasterCard •••• 0006", or "Tarjeta"
 * when the brand/last4 are unavailable (e.g. promo-bypass charges).
 */
export function describePaymentMethod(charge) {
    const brand = charge?.payment_method_details?.card?.brand;
    const last4 = charge?.payment_method_details?.card?.last4;
    if (!brand || !last4) return 'Tarjeta';
    const pretty = brand.charAt(0).toUpperCase() + brand.slice(1);
    return `${pretty} •••• ${last4}`;
}

export default { getStripe, constructWebhookEvent, getOrCreateStripeCustomer, priceIdFor, mealPlanAddonPriceId, inscriptionPriceId, describePaymentMethod };
