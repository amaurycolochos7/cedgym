// ─────────────────────────────────────────────────────────────────
// Stripe webhook handler.
//
// POST /webhooks/stripe
//
// Architecture:
//   - Raw body parser registered ONLY in this encapsulated plugin
//     (Fastify scopes content-type parsers per-register call), so
//     stripe.webhooks.constructEvent gets the unparsed Buffer it
//     needs to compute the HMAC.
//   - Signature verification + 5min timestamp tolerance is handled
//     by stripe.webhooks.constructEvent (Stripe SDK).
//   - Idempotent via Redis: stripe:webhook:{event.id} 24h TTL.
//   - Handlers are idempotent at the DB level too (same payment can
//     get the "succeeded" event twice; we no-op the second time).
//   - Always 200 on non-auth failure so Stripe stops retrying once
//     we've logged the problem.
//
// Events handled:
//   payment_intent.succeeded        addon one-shot charge
//   payment_intent.payment_failed   addon failure (logs, marks REJECTED)
//   invoice.payment_succeeded       subscription invoice (initial OR renewal)
//   invoice.payment_failed          subscription invoice failed
//   customer.subscription.deleted   stop auto-renewal
//   customer.subscription.updated   plan/price drift (logged)
//   charge.refunded                 refund on a past charge
// ─────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import { fireEvent } from '../lib/events.js';
import { constructWebhookEvent, getStripe } from '../lib/stripe.js';
import {
    activateMembershipFromPayment,
    activateMealPlanAddonFromPayment,
} from '../lib/payment-activation.js';
import { humanMembershipDescription } from '../lib/memberships.js';

const HANDLED_EVENTS = new Set([
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'customer.subscription.deleted',
    'customer.subscription.updated',
    'charge.refunded',
]);

// Pretty-print "Visa ····4242" from a charge's payment_method_details.
function describeChargePaymentMethod(charge) {
    const card = charge?.payment_method_details?.card;
    if (!card?.brand || !card?.last4) return null;
    const brand = card.brand.charAt(0).toUpperCase() + card.brand.slice(1);
    return `${brand} ····${card.last4}`;
}

export default async function stripeWebhookRoutes(fastify) {
    const { redis } = fastify;

    // Override JSON parser ONLY in this encapsulation context. The
    // raw Buffer reaches our handler; everywhere else routes still
    // see auto-parsed JSON.
    fastify.addContentTypeParser(
        'application/json',
        { parseAs: 'buffer' },
        (_req, body, done) => done(null, body),
    );

    fastify.post('/webhooks/stripe', async (req, reply) => {
        const rawBody = req.body;
        const sigHeader = req.headers['stripe-signature'];

        let event;
        try {
            event = constructWebhookEvent(rawBody, sigHeader);
        } catch (e) {
            req.log.warn(
                { err: e?.message },
                '[stripe-webhook] signature verification failed',
            );
            return reply.code(401).send({ error: 'invalid_signature' });
        }

        // Idempotency on event.id. Stripe retries up to 3 days; 24h
        // covers the practical retry window.
        const idempKey = `stripe:webhook:${event.id}`;
        if (redis) {
            try {
                const claimed = await redis.set(idempKey, '1', 'EX', 86400, 'NX');
                if (claimed !== 'OK') {
                    req.log.info(
                        { eventId: event.id, type: event.type },
                        '[stripe-webhook] duplicate — already processed',
                    );
                    return reply.send({ received: true, duplicate: true });
                }
            } catch (e) {
                req.log.error(
                    { err: e },
                    '[stripe-webhook] redis idempotency failed — continuing',
                );
            }
        }

        if (!HANDLED_EVENTS.has(event.type)) {
            req.log.info(
                { eventId: event.id, type: event.type },
                '[stripe-webhook] event type not handled',
            );
            return reply.send({ received: true, handled: false });
        }

        try {
            await processStripeEvent(fastify, event);
        } catch (e) {
            req.log.error(
                { err: e, eventId: event.id, type: event.type },
                '[stripe-webhook] processing failed',
            );
            // Roll back the idempotency claim so Stripe's retry has a
            // chance to succeed.
            if (redis) {
                try { await redis.del(idempKey); } catch {}
            }
            return reply.send({ received: true, handled: false, error: e.message });
        }

        return reply.send({ received: true, handled: true });
    });
}

// ═════════════════════════════════════════════════════════════════
// Event dispatch
// ═════════════════════════════════════════════════════════════════

async function processStripeEvent(fastify, event) {
    switch (event.type) {
        case 'payment_intent.succeeded':
            return handlePaymentIntentSucceeded(fastify, event);
        case 'payment_intent.payment_failed':
            return handlePaymentIntentFailed(fastify, event);
        case 'invoice.payment_succeeded':
            return handleInvoicePaymentSucceeded(fastify, event);
        case 'invoice.payment_failed':
            return handleInvoicePaymentFailed(fastify, event);
        case 'customer.subscription.deleted':
            return handleSubscriptionDeleted(fastify, event);
        case 'customer.subscription.updated':
            return handleSubscriptionUpdated(fastify, event);
        case 'charge.refunded':
            return handleChargeRefunded(fastify, event);
        default:
            // Defensive — should be filtered by HANDLED_EVENTS already.
            return;
    }
}

// ─────────────────────────────────────────────────────────────────
// payment_intent.succeeded
//
// Fires for both:
//   - Standalone PaymentIntents (addons) — we own the activation here.
//   - Subscription invoice PIs — also fire `invoice.payment_succeeded`,
//     which is the event we use for membership activation. We skip
//     here when `pi.invoice` is set to avoid double-activation.
// ─────────────────────────────────────────────────────────────────
async function handlePaymentIntentSucceeded(fastify, event) {
    const { prisma } = fastify;
    const pi = event.data.object;

    if (pi.invoice) {
        fastify.log.info(
            { eventId: event.id, paymentIntentId: pi.id, invoice: pi.invoice },
            '[stripe-webhook] PI is on a subscription invoice — handled by invoice.payment_succeeded',
        );
        return;
    }

    const payment = await prisma.payment.findUnique({
        where: { stripe_payment_intent_id: pi.id },
    });
    if (!payment) {
        fastify.log.warn(
            { eventId: event.id, paymentIntentId: pi.id },
            '[stripe-webhook] PI succeeded but no local Payment row',
        );
        return;
    }
    if (payment.status === 'APPROVED') {
        fastify.log.info(
            { paymentId: payment.id, paymentIntentId: pi.id },
            '[stripe-webhook] payment already APPROVED — skipping (idempotent)',
        );
        return;
    }

    // Pull the charge for last4/brand metadata.
    const stripe = getStripe();
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
                stripe_payment_method: describeChargePaymentMethod(charge),
                stripe_receipt_url: charge?.receipt_url || null,
                webhook_processed_at: new Date().toISOString(),
            },
        },
    });

    // Activation depends on Payment.type. The two paths we care about
    // are MEMBERSHIP (shouldn't happen via standalone PI today, but
    // defensive) and MEAL_PLAN_ADDON (the actual addon flow).
    if (updated.type === 'MEAL_PLAN_ADDON') {
        try {
            await activateMealPlanAddonFromPayment(fastify, updated);
        } catch (e) {
            fastify.log.error(
                { err: e, paymentId: updated.id },
                '[stripe-webhook] addon activation failed',
            );
        }
    } else if (updated.type === 'MEMBERSHIP') {
        try {
            await activateMembershipFromPayment(fastify, updated);
        } catch (e) {
            fastify.log.error(
                { err: e, paymentId: updated.id },
                '[stripe-webhook] membership activation failed (standalone PI path)',
            );
        }
    }

    try {
        await fireEvent('payment.approved', {
            workspaceId: updated.workspace_id,
            paymentId: updated.id,
            userId: updated.user_id,
            type: updated.type,
            amount: updated.amount,
            // Extra Stripe context for the WA notification handler (Phase 6).
            stripe: {
                payment_intent_id: pi.id,
                charge_id: charge?.id || null,
                payment_method: describeChargePaymentMethod(charge),
                receipt_url: charge?.receipt_url || null,
                paid_at: pi.created ? pi.created * 1000 : Date.now(),
            },
        });
    } catch (e) {
        fastify.log.warn(
            { err: e, paymentId: updated.id },
            '[stripe-webhook] payment.approved event failed',
        );
    }
}

// ─────────────────────────────────────────────────────────────────
// payment_intent.payment_failed — log + mark Payment REJECTED.
// ─────────────────────────────────────────────────────────────────
async function handlePaymentIntentFailed(fastify, event) {
    const { prisma } = fastify;
    const pi = event.data.object;

    if (pi.invoice) {
        // Subscription PI failures are handled by invoice.payment_failed.
        return;
    }

    const payment = await prisma.payment.findUnique({
        where: { stripe_payment_intent_id: pi.id },
    });
    if (!payment) return;

    if (payment.status === 'REJECTED' || payment.status === 'APPROVED') return;

    await prisma.payment.update({
        where: { id: payment.id },
        data: {
            status: 'REJECTED',
            metadata: {
                ...(payment.metadata || {}),
                stripe_status: pi.status,
                stripe_last_error: pi.last_payment_error?.message || null,
                stripe_decline_code: pi.last_payment_error?.decline_code || null,
                webhook_processed_at: new Date().toISOString(),
            },
        },
    });

    // For addons, also kill the linked MealPlanAddon so the user can
    // retry without the anti-stacking guard tripping.
    if (payment.type === 'MEAL_PLAN_ADDON') {
        try {
            await prisma.mealPlanAddon.updateMany({
                where: { payment_id: payment.id, status: 'PENDING' },
                data: { status: 'EXPIRED' },
            });
        } catch (e) {
            fastify.log.warn(
                { err: e, paymentId: payment.id },
                '[stripe-webhook] failed to expire addon on PI fail',
            );
        }
    }
}

// ─────────────────────────────────────────────────────────────────
// invoice.payment_succeeded
//
// Two cases:
//   A. Initial subscription invoice — local Payment exists with
//      matching stripe_invoice_id. Mark APPROVED + activate.
//   B. Renewal invoice — no local Payment yet; create one, then
//      activate to extend expires_at.
// ─────────────────────────────────────────────────────────────────
async function handleInvoicePaymentSucceeded(fastify, event) {
    const { prisma } = fastify;
    const invoice = event.data.object;
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) {
        fastify.log.info(
            { eventId: event.id, invoiceId: invoice.id },
            '[stripe-webhook] invoice has no subscription — skipping',
        );
        return;
    }

    // Existing Payment row for this invoice?
    let payment = await prisma.payment.findUnique({
        where: { stripe_invoice_id: invoice.id },
    });

    if (payment && payment.status === 'APPROVED') {
        fastify.log.info(
            { paymentId: payment.id, invoiceId: invoice.id },
            '[stripe-webhook] invoice already processed — skipping',
        );
        return;
    }

    // Find the Membership this subscription belongs to.
    const membership = await prisma.membership.findUnique({
        where: { stripe_subscription_id: subscriptionId },
    });
    if (!membership) {
        fastify.log.warn(
            { eventId: event.id, subscriptionId },
            '[stripe-webhook] no membership for subscription — orphan',
        );
        return;
    }

    // Pull the charge for last4/brand metadata.
    const stripe = getStripe();
    const chargeId = invoice.charge;
    const charge = chargeId ? await stripe.charges.retrieve(chargeId) : null;
    const piId = invoice.payment_intent || null;

    if (!payment) {
        // Renewal invoice — synthesize a Payment row from Membership.
        payment = await prisma.payment.create({
            data: {
                workspace_id: membership.workspace_id,
                user_id: membership.user_id,
                amount: Math.round((invoice.amount_paid || 0) / 100),
                type: 'MEMBERSHIP',
                reference: `${membership.plan}:${membership.billing_cycle}`,
                description: humanMembershipDescription(membership.plan, membership.billing_cycle, 'online_renew'),
                status: 'APPROVED',
                stripe_invoice_id: invoice.id,
                stripe_payment_intent_id: piId,
                stripe_charge_id: charge?.id || null,
                paid_at: new Date(invoice.status_transitions?.paid_at
                    ? invoice.status_transitions.paid_at * 1000
                    : Date.now()),
                metadata: {
                    plan: membership.plan,
                    billing_cycle: membership.billing_cycle,
                    gateway: 'stripe',
                    auto_renewal: true,
                    stripe_status: 'succeeded',
                    stripe_payment_method: describeChargePaymentMethod(charge),
                    stripe_hosted_invoice_url: invoice.hosted_invoice_url || null,
                    stripe_receipt_url: charge?.receipt_url || null,
                    webhook_processed_at: new Date().toISOString(),
                },
            },
        });
    } else {
        // Initial invoice — promote existing Payment.
        payment = await prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: 'APPROVED',
                paid_at: new Date(invoice.status_transitions?.paid_at
                    ? invoice.status_transitions.paid_at * 1000
                    : Date.now()),
                stripe_charge_id: charge?.id || null,
                metadata: {
                    ...(payment.metadata || {}),
                    stripe_status: 'succeeded',
                    stripe_payment_method: describeChargePaymentMethod(charge),
                    stripe_hosted_invoice_url: invoice.hosted_invoice_url || null,
                    stripe_receipt_url: charge?.receipt_url || null,
                    webhook_processed_at: new Date().toISOString(),
                },
            },
        });
    }

    // Activate / extend the membership. Idempotent.
    try {
        await activateMembershipFromPayment(fastify, payment);
    } catch (e) {
        fastify.log.error(
            { err: e, paymentId: payment.id, membershipId: membership.id },
            '[stripe-webhook] membership activation failed',
        );
    }

    try {
        await fireEvent('payment.approved', {
            workspaceId: payment.workspace_id,
            paymentId: payment.id,
            userId: payment.user_id,
            type: payment.type,
            amount: payment.amount,
            stripe: {
                payment_intent_id: piId,
                charge_id: charge?.id || null,
                invoice_id: invoice.id,
                payment_method: describeChargePaymentMethod(charge),
                receipt_url: charge?.receipt_url || null,
                hosted_invoice_url: invoice.hosted_invoice_url || null,
                paid_at: invoice.status_transitions?.paid_at
                    ? invoice.status_transitions.paid_at * 1000
                    : Date.now(),
            },
        });
    } catch (e) {
        fastify.log.warn(
            { err: e, paymentId: payment.id },
            '[stripe-webhook] payment.approved event failed',
        );
    }
}

// ─────────────────────────────────────────────────────────────────
// invoice.payment_failed — Stripe Smart Retries handle the actual
// retry cadence + dunning emails; we just log + flag.
// ─────────────────────────────────────────────────────────────────
async function handleInvoicePaymentFailed(fastify, event) {
    const invoice = event.data.object;
    fastify.log.warn(
        {
            eventId: event.id,
            invoiceId: invoice.id,
            subscriptionId: invoice.subscription,
            attempt: invoice.attempt_count,
            nextAttempt: invoice.next_payment_attempt,
        },
        '[stripe-webhook] invoice payment failed — Stripe Smart Retries will handle',
    );
    // Future: Phase 6 could send a "tu pago falló, actualiza la
    // tarjeta" WhatsApp here. For now we rely on Stripe's emails.
}

// ─────────────────────────────────────────────────────────────────
// customer.subscription.deleted — Stripe gave up retrying or the
// user cancelled in the customer portal. Membership stays active
// through the period they paid for; we just kill auto_renew + flag
// status so the dashboard reflects the truth at next refresh.
// ─────────────────────────────────────────────────────────────────
async function handleSubscriptionDeleted(fastify, event) {
    const { prisma } = fastify;
    const sub = event.data.object;
    const membership = await prisma.membership.findUnique({
        where: { stripe_subscription_id: sub.id },
    });
    if (!membership) {
        fastify.log.info(
            { eventId: event.id, subscriptionId: sub.id },
            '[stripe-webhook] subscription deleted — no local membership',
        );
        return;
    }

    // If the membership is still inside its paid period, don't
    // CANCEL — leave it ACTIVE until expires_at, just disable
    // auto_renew. Once it lapses naturally the daily expiry job
    // (or a future status sync) marks it EXPIRED.
    const stillValid = membership.expires_at
        && dayjs(membership.expires_at).isAfter(dayjs());

    await prisma.membership.update({
        where: { id: membership.id },
        data: {
            auto_renew: false,
            status: stillValid ? membership.status : 'CANCELED',
        },
    });

    try {
        await fireEvent('membership.canceled', {
            workspaceId: membership.workspace_id,
            userId: membership.user_id,
            membershipId: membership.id,
            stripeSubscriptionId: sub.id,
            stillValidThrough: stillValid ? membership.expires_at : null,
        });
    } catch (e) {
        fastify.log.warn(
            { err: e, membershipId: membership.id },
            '[stripe-webhook] membership.canceled event failed',
        );
    }
}

// ─────────────────────────────────────────────────────────────────
// customer.subscription.updated — drift detection. Logs when the
// Stripe-side state (price, quantity, status) diverges from our
// Membership row, useful when an admin makes changes in the Stripe
// dashboard. We don't mutate anything automatically; the next
// invoice.payment_succeeded will reconcile via priceMxn lookup.
// ─────────────────────────────────────────────────────────────────
async function handleSubscriptionUpdated(fastify, event) {
    const sub = event.data.object;
    fastify.log.info(
        {
            eventId: event.id,
            subscriptionId: sub.id,
            status: sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            priceId: sub.items?.data?.[0]?.price?.id,
        },
        '[stripe-webhook] subscription updated',
    );

    // Mirror cancel_at_period_end into auto_renew so the user-facing
    // toggle stays in sync if a customer cancels via the Stripe
    // customer portal.
    if (sub.cancel_at_period_end !== undefined) {
        const { prisma } = fastify;
        try {
            await prisma.membership.updateMany({
                where: { stripe_subscription_id: sub.id },
                data: { auto_renew: !sub.cancel_at_period_end },
            });
        } catch (e) {
            fastify.log.warn(
                { err: e, subscriptionId: sub.id },
                '[stripe-webhook] sub-updated auto_renew sync failed',
            );
        }
    }
}

// ─────────────────────────────────────────────────────────────────
// charge.refunded — flag the local Payment as REFUNDED. We don't
// auto-revert the underlying membership/addon; admin operations
// take it from there (cancel manually if appropriate).
// ─────────────────────────────────────────────────────────────────
async function handleChargeRefunded(fastify, event) {
    const { prisma } = fastify;
    const charge = event.data.object;

    const payment = await prisma.payment.findFirst({
        where: { stripe_charge_id: charge.id },
    });
    if (!payment) {
        fastify.log.info(
            { eventId: event.id, chargeId: charge.id },
            '[stripe-webhook] charge refunded — no local payment',
        );
        return;
    }

    const totalRefunded = Math.round((charge.amount_refunded || 0) / 100);
    const fullRefund = totalRefunded >= payment.amount;

    await prisma.payment.update({
        where: { id: payment.id },
        data: {
            status: fullRefund ? 'REFUNDED' : payment.status,
            metadata: {
                ...(payment.metadata || {}),
                stripe_refunded_amount_mxn: totalRefunded,
                stripe_refund_full: fullRefund,
                stripe_refunded_at: new Date().toISOString(),
            },
        },
    });

    try {
        await fireEvent('payment.refunded', {
            workspaceId: payment.workspace_id,
            paymentId: payment.id,
            userId: payment.user_id,
            type: payment.type,
            amount: totalRefunded,
            full: fullRefund,
            stripe: {
                charge_id: charge.id,
                payment_intent_id: charge.payment_intent || null,
            },
        });
    } catch (e) {
        fastify.log.warn(
            { err: e, paymentId: payment.id },
            '[stripe-webhook] payment.refunded event failed',
        );
    }
}
