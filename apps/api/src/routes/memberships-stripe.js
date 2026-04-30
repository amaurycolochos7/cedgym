// ─────────────────────────────────────────────────────────────────
// Stripe membership routes — embedded Payment Element flow.
//
// POST /memberships/subscribe-stripe
//
// The frontend mounts <Elements stripe={publishableKey}> and uses the
// <PaymentElement> primitive. PCI scope stays inside Stripe — we
// never see card data.
//
// Flow:
//   1) FE collects card via PaymentElement (no charge yet, no token).
//   2) FE POSTs here with { plan, promo_code? }.
//   3) BE creates (or reuses) a Stripe Customer for the user.
//   4) BE creates a Stripe Subscription with:
//        - items: [{ price: priceIdFor(plan) }]
//        - add_invoice_items: inscription (if applies, $109 MXN once)
//        - discounts: [{ coupon: <created on the fly> }] if promo
//        - payment_behavior: 'default_incomplete'  ← key: forces the
//          first invoice into a PaymentIntent we control.
//      Stripe responds with the latest invoice + its PaymentIntent.
//   5) BE persists a local Payment(PENDING) row with stripe_*
//      identifiers + the same metadata shape /subscribe-card uses.
//   6) BE returns { client_secret, payment_id, ... }.
//   7) FE calls stripe.confirmPayment({ clientSecret }) — this draws
//      the 3DS challenge inline if the issuer asks for one.
//   8) On confirmation success, Stripe fires invoice.payment_succeeded
//      → our /webhooks/stripe handler activates the membership.
//
// 100%-off bypass:
//   When totalAmount === 0 (promo wipes plan AND no inscription, OR
//   promo wipes both), we DO NOT involve Stripe — we activate the
//   membership synchronously and fire payment.approved so the WA
//   automations run, mirroring the MP path.
//
// Idempotency:
//   - Creating two PaymentIntents for the same Payment row is bad.
//     We create the Payment row FIRST, then the Subscription, then
//     write back the Stripe IDs. If the Stripe call fails, we mark
//     the Payment REJECTED so the admin UI doesn't carry a ghost.
//   - The webhook handler is idempotent on event.id (Redis 24h TTL).
//
// Security:
//   - JWT required (athlete/recep/admin/superadmin only).
//   - Selfie gate (member must have uploaded a selfie before paying).
//   - Server-side price resolution — frontend cannot spoof an amount.
//     The plan code maps to a Price ID configured in env, and the
//     Subscription is billed by Stripe at whatever price is on file.
//   - Promo math runs server-side via shared `applyPromoToAmount()`.
//   - Stripe Coupons created here are scoped per-checkout: each
//     promo redemption gets a fresh single-use Coupon with `max_redemptions: 1`.
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';
import { fireEvent } from '../lib/events.js';
import {
    INSCRIPTION_PRICE_MXN,
    planRequiresInscription,
    getEffectivePlanPrice,
    getPlanByCode,
    applyPromoToAmount,
} from '../lib/memberships.js';
import {
    getStripe,
    getOrCreateStripeCustomer,
    priceIdFor,
} from '../lib/stripe.js';
import { activateMembershipFromPayment } from './webhooks.js';

// ─────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────

const subscribeStripeBody = z.object({
    plan: z.enum(['STARTER', 'PRO', 'ELITE']),
    promo_code: z.string().trim().min(1).max(64).optional(),
});

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

// Promo resolver — same shape and semantics as memberships.js's
// `resolvePromo`. Duplicated here (instead of imported) because that
// file's helper is module-private and refactoring it for export is
// out of scope for the migration.
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

function welcomeCopyFor(plan) {
    const meta = getPlanByCode(plan);
    return {
        title: `¡Bienvenid@ al plan ${meta?.name || plan}!`,
        benefits: meta?.features ? [...meta.features] : [],
    };
}

// MXN integer pesos → Stripe smallest unit (centavos). 1 MXN = 100.
function pesosToCentavos(mxn) {
    return Math.round(Number(mxn) * 100);
}

// Single-use Stripe Coupon for a per-checkout promo. We create one
// per redemption with `max_redemptions: 1` so the same coupon can't
// leak/be replayed. `duration: 'once'` applies only to the first
// invoice (the one we're about to charge).
async function createOneShotCoupon({ stripe, discountMxn, promoCode, paymentId }) {
    return stripe.coupons.create({
        amount_off: pesosToCentavos(discountMxn),
        currency: 'mxn',
        duration: 'once',
        max_redemptions: 1,
        name: `cedgym_${promoCode}_${paymentId}`.slice(0, 40),
        metadata: {
            promo_code: promoCode,
            payment_id: paymentId,
            source: 'cedgym',
        },
    });
}

// ─────────────────────────────────────────────────────────────────
export default async function membershipsStripeRoutes(fastify) {
    const { prisma } = fastify;

    fastify.post(
        '/memberships/subscribe-stripe',
        {
            // Tighter rate limit on payment endpoints than the global
            // 120/min. Six attempts per minute is plenty for a real
            // user; bots get cut off fast.
            config: {
                rateLimit: { max: 6, timeWindow: '1 minute' },
            },
            preHandler: [
                fastify.authenticate,
                fastify.requireRole('ATHLETE', 'RECEPTIONIST', 'ADMIN', 'SUPERADMIN'),
            ],
        },
        async (req, reply) => {
            const parsed = subscribeStripeBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const { plan, promo_code } = parsed.data;
            const billingCycle = 'MONTHLY';

            const userId = req.user.sub || req.user.id;
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw err('USER_NOT_FOUND', 'Usuario inexistente', 404);

            // Server-side price resolution. Frontend cannot influence
            // the amount — the price comes from PLAN_CATALOG (with
            // workspace overrides) and the Stripe Price ID on file.
            const basePrice = await getEffectivePlanPrice(
                prisma,
                user.workspace_id,
                plan,
                billingCycle,
            );
            if (basePrice == null) {
                throw err('PLAN_INVALID', 'Plan o ciclo inválido', 400);
            }

            // Selfie gate — same rule as the MP path. Staff IDs the
            // member at check-in by the selfie.
            if (!user.selfie_url) {
                throw err(
                    'SELFIE_REQUIRED',
                    'Debes subir una selfie antes de comprar tu membresía.',
                    400,
                );
            }

            const { amount, discount, promo } = await resolvePromo(
                prisma,
                promo_code,
                basePrice,
                'MEMBERSHIP',
            );

            // Inscription: charged once on first PRO/ELITE subscription.
            // Promo discounts the plan only; the inscription line is
            // never reduced by promo codes.
            const inscriptionAmount =
                planRequiresInscription(plan) && !user.inscription_paid_at
                    ? INSCRIPTION_PRICE_MXN
                    : 0;
            const totalAmount = amount + inscriptionAmount;

            const planMeta = getPlanByCode(plan);
            const description = inscriptionAmount > 0
                ? `Membresía ${planMeta?.name || plan} — ${billingCycle} + Inscripción`
                : `Membresía ${planMeta?.name || plan} — ${billingCycle}`;

            // 1) Local PENDING Payment row first — gives us a stable id
            //    we can stamp into Stripe metadata and later look up
            //    from the webhook.
            const payment = await prisma.payment.create({
                data: {
                    workspace_id: user.workspace_id,
                    user_id: user.id,
                    amount: totalAmount,
                    type: 'MEMBERSHIP',
                    reference: `${plan}:${billingCycle}`,
                    description,
                    status: 'PENDING',
                    metadata: {
                        plan,
                        billing_cycle: billingCycle,
                        base_price: basePrice,
                        plan_amount_mxn: amount,
                        discount_mxn: discount,
                        promo_code: promo?.code || null,
                        promo_id: promo?.id || null,
                        includes_inscription: inscriptionAmount > 0,
                        inscription_amount_mxn: inscriptionAmount,
                        flow: 'stripe_payment_element',
                        gateway: 'stripe',
                    },
                },
            });

            // 1.5) Promo 100% bypass — only when the *total* is zero.
            //      Mirrors the MP path so existing automations run.
            if (totalAmount === 0) {
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
                    await activateMembershipFromPayment(fastify, approvedPayment);
                } catch (e) {
                    req.log.error(
                        { err: e, paymentId: approvedPayment.id },
                        '[memberships/subscribe-stripe] promo_100 activation failed',
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
                        '[memberships/subscribe-stripe] payment.approved event failed',
                    );
                }

                const membership = await prisma.membership.findUnique({
                    where: { user_id: user.id },
                });

                return {
                    success: true,
                    bypass: true,
                    payment: {
                        id: approvedPayment.id,
                        amount: approvedPayment.amount,
                        plan_amount_mxn: amount,
                        inscription_amount_mxn: inscriptionAmount,
                        status: approvedPayment.status,
                        discount_mxn: discount,
                    },
                    membership,
                    welcome: welcomeCopyFor(plan),
                };
            }

            // 2) Stripe path. Get-or-create the Customer first.
            const stripe = getStripe();
            let stripeCustomerId;
            try {
                stripeCustomerId = await getOrCreateStripeCustomer({ prisma, user });
            } catch (e) {
                req.log.error(
                    { err: e, paymentId: payment.id },
                    '[memberships/subscribe-stripe] customer create failed',
                );
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: 'REJECTED' },
                });
                throw err('STRIPE_ERROR', 'No se pudo iniciar el pago. Intenta de nuevo.', 502);
            }

            // 3) Promo coupon (if any). One-shot, single-redemption,
            //    so leaking it would do nothing — Stripe rejects on
            //    second use.
            let couponId = null;
            if (promo && discount > 0) {
                try {
                    const coupon = await createOneShotCoupon({
                        stripe,
                        discountMxn: discount,
                        promoCode: promo.code,
                        paymentId: payment.id,
                    });
                    couponId = coupon.id;
                } catch (e) {
                    req.log.error(
                        { err: e, paymentId: payment.id, promoId: promo.id },
                        '[memberships/subscribe-stripe] coupon create failed',
                    );
                    await prisma.payment.update({
                        where: { id: payment.id },
                        data: { status: 'REJECTED' },
                    });
                    throw err('STRIPE_ERROR', 'No se pudo aplicar el promo. Intenta de nuevo.', 502);
                }
            }

            // 4) Build the Subscription. payment_behavior:
            //    'default_incomplete' is critical — without it, Stripe
            //    tries to bill immediately with whatever default
            //    payment method the customer has (none in our case)
            //    and the subscription comes back `incomplete` without
            //    a usable PaymentIntent.
            const subParams = {
                customer: stripeCustomerId,
                items: [{ price: priceIdFor({ plan, cycle: billingCycle }) }],
                payment_behavior: 'default_incomplete',
                payment_settings: {
                    save_default_payment_method: 'on_subscription',
                    payment_method_types: ['card'],
                },
                expand: ['latest_invoice.payment_intent'],
                metadata: {
                    cedgym_payment_id: payment.id,
                    cedgym_user_id: user.id,
                    cedgym_workspace_id: user.workspace_id,
                    cedgym_plan: plan,
                    cedgym_billing_cycle: billingCycle,
                    cedgym_includes_inscription: String(inscriptionAmount > 0),
                },
            };
            if (inscriptionAmount > 0) {
                subParams.add_invoice_items = [
                    {
                        price_data: {
                            currency: 'mxn',
                            product_data: {
                                name: 'Inscripción única CED·GYM',
                            },
                            unit_amount: pesosToCentavos(INSCRIPTION_PRICE_MXN),
                        },
                        quantity: 1,
                    },
                ];
            }
            if (couponId) {
                subParams.discounts = [{ coupon: couponId }];
            }

            let subscription;
            try {
                subscription = await stripe.subscriptions.create(subParams);
            } catch (e) {
                req.log.error(
                    { err: e, paymentId: payment.id, customerId: stripeCustomerId },
                    '[memberships/subscribe-stripe] subscription create failed',
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
                throw err('STRIPE_ERROR', 'No se pudo crear la suscripción. Intenta de nuevo.', 502);
            }

            const invoice = subscription.latest_invoice;
            const paymentIntent = invoice?.payment_intent;
            if (!paymentIntent || !paymentIntent.client_secret) {
                req.log.error(
                    { paymentId: payment.id, subscriptionId: subscription.id },
                    '[memberships/subscribe-stripe] subscription returned no payment_intent',
                );
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: 'REJECTED' },
                });
                throw err(
                    'STRIPE_ERROR',
                    'Stripe no devolvió un PaymentIntent — intenta de nuevo.',
                    502,
                );
            }

            // 5) Persist Stripe identifiers on the Payment + Membership.
            //    Membership stays inactive until the webhook fires
            //    invoice.payment_succeeded.
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    stripe_payment_intent_id: paymentIntent.id,
                    stripe_invoice_id: invoice.id,
                    metadata: {
                        ...(payment.metadata || {}),
                        stripe_customer_id: stripeCustomerId,
                        stripe_subscription_id: subscription.id,
                        stripe_coupon_id: couponId,
                    },
                },
            });

            // Membership row: upsert with the new subscription id but
            // keep status PENDING-ish until the webhook activates. We
            // model "pending" as the existing TRIAL status so the user
            // doesn't see a half-baked ACTIVE.
            await prisma.membership.upsert({
                where: { user_id: user.id },
                update: {
                    stripe_subscription_id: subscription.id,
                    stripe_price_id: priceIdFor({ plan, cycle: billingCycle }),
                },
                create: {
                    workspace_id: user.workspace_id,
                    user_id: user.id,
                    plan,
                    status: 'TRIAL',
                    starts_at: new Date(),
                    expires_at: new Date(),
                    price_mxn: amount,
                    billing_cycle: billingCycle,
                    stripe_subscription_id: subscription.id,
                    stripe_price_id: priceIdFor({ plan, cycle: billingCycle }),
                    auto_renew: true,
                },
            });

            return {
                success: true,
                client_secret: paymentIntent.client_secret,
                payment_id: payment.id,
                subscription_id: subscription.id,
                amount: totalAmount,
                plan_amount_mxn: amount,
                inscription_amount_mxn: inscriptionAmount,
                discount_mxn: discount,
                publishable_key_hint: 'use NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
            };
        },
    );

    // ─────────────────────────────────────────────────────────────────
    // POST /memberships/sync-stripe-payment
    //
    // After the frontend's stripe.confirmPayment() resolves, we don't
    // want the user staring at a "Activando..." spinner waiting for
    // the webhook to land (it usually does within 1-2s, but it might
    // not). This endpoint pulls authoritative status from Stripe and
    // performs the same activation the webhook would — idempotent
    // with the webhook so racing them is safe.
    //
    // Authorization: the caller must be the owner of the Payment.
    // ─────────────────────────────────────────────────────────────────

    const syncBody = z.object({
        payment_id: z.string().min(1),
    });

    fastify.post(
        '/memberships/sync-stripe-payment',
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
                // Don't leak existence — same shape as 404.
                throw err('PAYMENT_NOT_FOUND', 'Pago no encontrado', 404);
            }
            if (!payment.stripe_payment_intent_id) {
                throw err('PAYMENT_NOT_STRIPE', 'Este pago no es de Stripe', 400);
            }

            // Fast path: webhook already activated.
            if (payment.status === 'APPROVED') {
                const membership = await prisma.membership.findUnique({
                    where: { user_id: userId },
                });
                return { payment, membership, source: 'already_approved' };
            }

            const stripe = getStripe();
            let pi;
            try {
                pi = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id);
            } catch (e) {
                req.log.error(
                    { err: e, paymentId: payment.id },
                    '[memberships/sync-stripe-payment] PI retrieve failed',
                );
                throw err('STRIPE_ERROR', 'No pudimos verificar el pago en Stripe', 502);
            }

            if (pi.status !== 'succeeded') {
                // Common pending states: requires_action (3DS),
                // requires_payment_method (card declined). Surface
                // gently — frontend will keep polling.
                return {
                    payment,
                    membership: null,
                    source: 'stripe_status',
                    stripe_status: pi.status,
                };
            }

            // Promote Payment → APPROVED + activate.
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
                await activateMembershipFromPayment(fastify, updated);
            } catch (e) {
                req.log.error(
                    { err: e, paymentId: updated.id },
                    '[memberships/sync-stripe-payment] activation failed',
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
                    '[memberships/sync-stripe-payment] payment.approved event failed',
                );
            }

            const membership = await prisma.membership.findUnique({
                where: { user_id: userId },
            });

            return { payment: updated, membership, source: 'sync_activated' };
        },
    );
}
