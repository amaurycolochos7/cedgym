// ─────────────────────────────────────────────────────────────────
// Stripe addon routes — meal-plan add-on (one-shot $630 MXN).
//
// POST /addons/meal-plan/purchase-stripe
//   Body: { promo_code? }
//
// Differs from /memberships/subscribe-stripe in that this is a
// ONE-TIME charge, not a Subscription. We create a PaymentIntent
// directly (no Subscription, no Invoice) and the frontend confirms
// it via the Payment Element.
//
// POST /addons/meal-plan/sync-stripe-payment
//   Body: { payment_id }
//
// Same idempotent sync path as memberships, but activates the addon
// instead of the membership.
//
// Security:
//   - JWT required (athlete/recep/admin/superadmin).
//   - Membership gate (must have ACTIVE/TRIAL gym membership).
//   - Anti-stacking: refuses if user already has an ACTIVE addon.
//   - Server-side price (resolveAddonPrice) — frontend cannot spoof.
//   - One-shot single-redemption Stripe Coupons for promos.
//   - Rate-limited.
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';
import { fireEvent } from '../lib/events.js';
import { applyPromoToAmount } from '../lib/memberships.js';
import { SETTING_KEYS, getWorkspaceSetting } from '../lib/settings.js';
import {
    getStripe,
    getOrCreateStripeCustomer,
} from '../lib/stripe.js';
import { activateMealPlanAddonFromPayment } from '../lib/payment-activation.js';

const MEAL_PLAN_ADDON_DEFAULT_PRICE_MXN = 630;
const ACTIVE_MEMBERSHIP_STATUSES = new Set(['ACTIVE', 'TRIAL']);

const purchaseStripeBody = z.object({
    promo_code: z.string().trim().min(1).max(64).optional(),
});

const syncBody = z.object({
    payment_id: z.string().min(1),
});

// ── Helpers (mirrors addons.js so each route file is self-contained) ──

async function resolveAddonPrice(prisma, workspaceId) {
    if (!workspaceId) return MEAL_PLAN_ADDON_DEFAULT_PRICE_MXN;
    try {
        const v = await getWorkspaceSetting(
            prisma,
            workspaceId,
            SETTING_KEYS.MEAL_PLAN_ADDON_PRICE,
            null,
        );
        if (typeof v === 'number' && v >= 0) return v;
        return MEAL_PLAN_ADDON_DEFAULT_PRICE_MXN;
    } catch {
        return MEAL_PLAN_ADDON_DEFAULT_PRICE_MXN;
    }
}

async function resolvePromo(prisma, promoCode, basePrice, appliesTo) {
    if (!promoCode) {
        return { amount: basePrice, discount: 0, promo: null };
    }
    const found = await prisma.promoCode.findUnique({ where: { code: promoCode } });
    const res = applyPromoToAmount(found, basePrice, appliesTo);
    if (!res.valid) {
        throw err('PROMO_INVALID', `Promo inválido: ${res.reason}`, 400);
    }
    return {
        amount: res.final_amount,
        discount: res.discount_mxn,
        promo: res.promo,
    };
}

async function hasActiveMembership(prisma, userId) {
    const m = await prisma.membership.findUnique({
        where: { user_id: userId },
        select: { status: true, expires_at: true },
    });
    if (!m) return false;
    if (!ACTIVE_MEMBERSHIP_STATUSES.has(m.status)) return false;
    if (m.expires_at && new Date(m.expires_at).getTime() < Date.now()) return false;
    return true;
}

const welcomeCopy = {
    title: '¡Add-on activado!',
    benefits: ['1 plan alimenticio personalizado con IA'],
};

function pesosToCentavos(mxn) {
    return Math.round(Number(mxn) * 100);
}

// ─────────────────────────────────────────────────────────────────
export default async function addonsStripeRoutes(fastify) {
    const { prisma } = fastify;

    fastify.post(
        '/addons/meal-plan/purchase-stripe',
        {
            config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
            preHandler: [
                fastify.authenticate,
                fastify.requireRole('ATHLETE', 'RECEPTIONIST', 'ADMIN', 'SUPERADMIN'),
            ],
        },
        async (req) => {
            const parsed = purchaseStripeBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const { promo_code } = parsed.data;

            const userId = req.user.sub || req.user.id;
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw err('USER_NOT_FOUND', 'Usuario inexistente', 404);

            // Membership gate.
            if (!(await hasActiveMembership(prisma, user.id))) {
                throw err(
                    'MEMBERSHIP_REQUIRED',
                    'Necesitas una membresía activa para comprar el add-on.',
                    403,
                );
            }

            // Anti-stacking — one ACTIVE addon at a time.
            const alreadyActive = await prisma.mealPlanAddon.findFirst({
                where: { user_id: user.id, status: 'ACTIVE' },
                select: { id: true },
            });
            if (alreadyActive) {
                throw err(
                    'ADDON_ALREADY_ACTIVE',
                    'Ya tienes un add-on de plan alimenticio activo sin usar.',
                    409,
                );
            }

            const basePrice = await resolveAddonPrice(prisma, user.workspace_id);
            const { amount, discount, promo } = await resolvePromo(
                prisma,
                promo_code,
                basePrice,
                'MEAL_PLAN_ADDON',
            );

            const description = 'Add-on plan alimenticio IA';

            // 1) Local PENDING Payment + MealPlanAddon rows so the
            //    webhook can find them by payment_id.
            const payment = await prisma.payment.create({
                data: {
                    workspace_id: user.workspace_id,
                    user_id: user.id,
                    amount,
                    type: 'MEAL_PLAN_ADDON',
                    reference: 'MEAL_PLAN_ADDON',
                    description,
                    status: 'PENDING',
                    metadata: {
                        addon_kind: 'MEAL_PLAN_ADDON',
                        base_price: basePrice,
                        discount_mxn: discount,
                        promo_code: promo?.code || null,
                        promo_id: promo?.id || null,
                        flow: 'stripe_payment_element',
                        gateway: 'stripe',
                    },
                },
            });

            const addon = await prisma.mealPlanAddon.create({
                data: {
                    workspace_id: user.workspace_id,
                    user_id: user.id,
                    payment_id: payment.id,
                    price_mxn: basePrice,
                    paid_mxn: amount,
                    promo_code_id: promo?.id || null,
                    status: 'PENDING',
                },
            });

            // 1.5) 100% off bypass — same as MP path.
            if (amount === 0) {
                const approvedPayment = await prisma.payment.update({
                    where: { id: payment.id },
                    data: {
                        status: 'APPROVED',
                        paid_at: new Date(),
                        metadata: {
                            ...(payment.metadata || {}),
                            bypass: 'promo_100',
                            promo_code: promo?.code || null,
                            payment_method: 'COMPLIMENTARY',
                        },
                    },
                });

                try {
                    await activateMealPlanAddonFromPayment(fastify, approvedPayment);
                } catch (e) {
                    req.log.error(
                        { err: e, paymentId: approvedPayment.id },
                        '[addons/stripe] promo_100 activation failed',
                    );
                }

                try {
                    await fireEvent('payment.approved', {
                        workspaceId: approvedPayment.workspace_id,
                        paymentId: approvedPayment.id,
                        userId: approvedPayment.user_id,
                        type: approvedPayment.type,
                        amount: approvedPayment.amount,
                    });
                } catch (e) {
                    req.log.warn(
                        { err: e, paymentId: approvedPayment.id },
                        '[addons/stripe] payment.approved event failed',
                    );
                }

                const refreshed = await prisma.mealPlanAddon.findUnique({
                    where: { id: addon.id },
                });

                return {
                    success: true,
                    bypass: true,
                    payment: {
                        id: approvedPayment.id,
                        amount: approvedPayment.amount,
                        status: approvedPayment.status,
                        discount_mxn: discount,
                    },
                    addon: { id: refreshed.id, status: refreshed.status },
                    welcome: welcomeCopy,
                };
            }

            // 2) Stripe path — get-or-create Customer.
            const stripe = getStripe();
            let stripeCustomerId;
            try {
                stripeCustomerId = await getOrCreateStripeCustomer({ prisma, user });
            } catch (e) {
                req.log.error(
                    { err: e, paymentId: payment.id },
                    '[addons/stripe] customer create failed',
                );
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: 'REJECTED' },
                });
                await prisma.mealPlanAddon.update({
                    where: { id: addon.id },
                    data: { status: 'EXPIRED' },
                });
                throw err('STRIPE_ERROR', 'No se pudo iniciar el pago. Intenta de nuevo.', 502);
            }

            // 3) PaymentIntent. We charge the discounted amount
            //    directly — no coupons needed since it's one-shot
            //    (Stripe PaymentIntent doesn't take coupons; subscriptions do).
            let pi;
            try {
                pi = await stripe.paymentIntents.create({
                    amount: pesosToCentavos(amount),
                    currency: 'mxn',
                    customer: stripeCustomerId,
                    description,
                    payment_method_types: ['card'],
                    setup_future_usage: 'off_session',
                    metadata: {
                        cedgym_payment_id: payment.id,
                        cedgym_addon_id: addon.id,
                        cedgym_user_id: user.id,
                        cedgym_workspace_id: user.workspace_id,
                        cedgym_kind: 'MEAL_PLAN_ADDON',
                        cedgym_promo_code: promo?.code || '',
                        cedgym_discount_mxn: String(discount),
                    },
                });
            } catch (e) {
                req.log.error(
                    { err: e, paymentId: payment.id, customerId: stripeCustomerId },
                    '[addons/stripe] PaymentIntent create failed',
                );
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: {
                        status: 'REJECTED',
                        metadata: {
                            ...(payment.metadata || {}),
                            stripe_error: e?.message || 'unknown',
                        },
                    },
                });
                await prisma.mealPlanAddon.update({
                    where: { id: addon.id },
                    data: { status: 'EXPIRED' },
                });
                throw err('STRIPE_ERROR', 'No pudimos preparar el pago. Intenta de nuevo.', 502);
            }

            // 4) Persist Stripe identifiers.
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    stripe_payment_intent_id: pi.id,
                    metadata: {
                        ...(payment.metadata || {}),
                        stripe_customer_id: stripeCustomerId,
                    },
                },
            });

            return {
                success: true,
                client_secret: pi.client_secret,
                payment_id: payment.id,
                addon_id: addon.id,
                amount,
                discount_mxn: discount,
            };
        },
    );

    fastify.post(
        '/addons/meal-plan/sync-stripe-payment',
        {
            config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
            preHandler: [fastify.authenticate],
        },
        async (req) => {
            const parsed = syncBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const userId = req.user.sub || req.user.id;

            const payment = await prisma.payment.findUnique({
                where: { id: parsed.data.payment_id },
            });
            if (!payment) throw err('PAYMENT_NOT_FOUND', 'Pago no encontrado', 404);
            if (payment.user_id !== userId) {
                throw err('PAYMENT_NOT_FOUND', 'Pago no encontrado', 404);
            }
            if (!payment.stripe_payment_intent_id) {
                throw err('PAYMENT_NOT_STRIPE', 'Este pago no es de Stripe', 400);
            }

            const addon = await prisma.mealPlanAddon.findUnique({
                where: { payment_id: payment.id },
            });

            if (payment.status === 'APPROVED') {
                return { payment, addon, source: 'already_approved' };
            }

            const stripe = getStripe();
            let pi;
            try {
                pi = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id);
            } catch (e) {
                req.log.error(
                    { err: e, paymentId: payment.id },
                    '[addons/sync-stripe] PI retrieve failed',
                );
                throw err('STRIPE_ERROR', 'No pudimos verificar el pago en Stripe', 502);
            }

            if (pi.status !== 'succeeded') {
                return {
                    payment,
                    addon,
                    source: 'stripe_status',
                    stripe_status: pi.status,
                };
            }

            const charge = pi.latest_charge
                ? await stripe.charges.retrieve(pi.latest_charge)
                : null;

            const updated = await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'APPROVED',
                    paid_at: new Date(pi.created ? pi.created * 1000 : Date.now()),
                    stripe_charge_id: charge?.id || null,
                    metadata: {
                        ...(payment.metadata || {}),
                        stripe_status: pi.status,
                        stripe_payment_method: charge?.payment_method_details?.card?.brand
                            ? `${charge.payment_method_details.card.brand} ····${charge.payment_method_details.card.last4}`
                            : null,
                        sync_source: 'frontend_after_confirm',
                    },
                },
            });

            try {
                await activateMealPlanAddonFromPayment(fastify, updated);
            } catch (e) {
                req.log.error(
                    { err: e, paymentId: updated.id },
                    '[addons/sync-stripe] activation failed',
                );
            }

            try {
                await fireEvent('payment.approved', {
                    workspaceId: updated.workspace_id,
                    paymentId: updated.id,
                    userId: updated.user_id,
                    type: updated.type,
                    amount: updated.amount,
                });
            } catch (e) {
                req.log.warn(
                    { err: e, paymentId: updated.id },
                    '[addons/sync-stripe] payment.approved event failed',
                );
            }

            const refreshedAddon = await prisma.mealPlanAddon.findUnique({
                where: { payment_id: payment.id },
            });

            return {
                payment: updated,
                addon: refreshedAddon,
                source: 'sync_activated',
            };
        },
    );
}
