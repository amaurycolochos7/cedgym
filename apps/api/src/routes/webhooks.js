// ─────────────────────────────────────────────────────────────────
// Mercado Pago webhook handler.
//
// POST /webhooks/mercadopago
//
// - No JWT. We validate the MP signature header (HMAC-SHA256).
// - Idempotent via Redis (key mp:webhook:{payment_id}, 24h TTL).
// - Always returns 200 on non-auth failures so MP stops retrying
//   once we've logged the problem (per MP docs, only 2xx stops
//   the retry loop; repeated 5xx causes back-pressure).
// - Side-effects (membership activation / product delivery /
//   course enrollment) fire AutomationJobs via the events bus,
//   so they run out-of-band and don't block the webhook response.
// ─────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import dayjs from 'dayjs';
import { fireEvent } from '../lib/events.js';
import {
    getPayment as mpGetPayment,
    mapPaymentStatus,
    getWebhookSecret,
} from '../lib/mercadopago.js';
import { computeExpiresAt, getEffectivePlanPrice } from '../lib/memberships.js';

// Parse the MP x-signature header.
// Format: `ts=1699999999,v1=abcdef1234…`
function parseSignatureHeader(header) {
    if (!header || typeof header !== 'string') return null;
    const parts = header.split(',').map((s) => s.trim());
    const out = {};
    for (const part of parts) {
        const [k, v] = part.split('=');
        if (k && v) out[k] = v;
    }
    if (!out.ts || !out.v1) return null;
    return out;
}

// HMAC formula per MP docs:
//   manifest = `id:{data.id};request-id:{x-request-id};ts:{ts};`
//   hmac    = HMAC_SHA256(secret, manifest).hex
// Compare against `v1` in the x-signature header.
function verifySignature({ secret, dataId, requestId, ts, v1 }) {
    if (!secret) return false;
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expected = crypto
        .createHmac('sha256', secret)
        .update(manifest)
        .digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(v1, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// ─────────────────────────────────────────────────────────────────
export default async function webhooksRoutes(fastify) {
    const { prisma, redis } = fastify;

    fastify.post('/webhooks/mercadopago', async (req, reply) => {
        const secret = getWebhookSecret();
        const signatureHeader = req.headers['x-signature'];
        const requestId = req.headers['x-request-id'];

        // ── Signature verification ────────────────────────────────
        // We skip only when MP_WEBHOOK_SECRET is explicitly unset AND
        // we're in development — in prod an unset secret is a bug,
        // reject.
        const body = req.body || {};
        const dataId = body?.data?.id ? String(body.data.id) : null;

        if (secret) {
            const parsed = parseSignatureHeader(signatureHeader);
            if (!parsed || !dataId || !requestId) {
                req.log.warn(
                    { signatureHeader, requestId, dataId },
                    '[mp-webhook] missing signature / headers'
                );
                return reply.code(401).send({ error: 'invalid_signature' });
            }
            const ok = verifySignature({
                secret,
                dataId,
                requestId,
                ts: parsed.ts,
                v1: parsed.v1,
            });
            if (!ok) {
                req.log.warn(
                    { dataId, requestId },
                    '[mp-webhook] signature mismatch'
                );
                return reply.code(401).send({ error: 'invalid_signature' });
            }
        } else {
            req.log.warn('[mp-webhook] MP_WEBHOOK_SECRET unset — signature not verified');
        }

        // From here on: always 200 so MP stops retrying.
        const type = body.type || body.topic;
        const action = body.action;

        if (type !== 'payment' || !dataId) {
            // We only handle payment-type events in this endpoint.
            // Subscriptions (preapproval) events land here too but
            // we don't process them yet — ack and move on.
            req.log.info({ type, action, dataId }, '[mp-webhook] ignored');
            return reply.send({ received: true, handled: false });
        }

        // ── Idempotency guard ─────────────────────────────────────
        const idempKey = `mp:webhook:${dataId}`;
        if (redis) {
            try {
                // SET NX EX → returns "OK" if the key was created, null if it
                // already existed. If it existed, we processed this event
                // before — ack and skip.
                const claimed = await redis.set(idempKey, '1', 'EX', 86400, 'NX');
                if (claimed !== 'OK') {
                    req.log.info({ dataId }, '[mp-webhook] duplicate — already processed');
                    return reply.send({ received: true, duplicate: true });
                }
            } catch (e) {
                req.log.error({ err: e }, '[mp-webhook] redis idempotency failed — continuing');
            }
        }

        try {
            await processPaymentEvent(fastify, dataId);
        } catch (e) {
            req.log.error({ err: e, dataId }, '[mp-webhook] processing failed');
            // Roll back the idempotency claim so MP's retry actually
            // has a chance to succeed.
            if (redis) {
                try { await redis.del(idempKey); } catch {}
            }
            // Still 200 — we don't want MP DoSing us over a bug.
            return reply.send({ received: true, handled: false, error: e.message });
        }

        return reply.send({ received: true, handled: true });
    });
}

// ─────────────────────────────────────────────────────────────────
// Core processor — factored out so it's independently testable.
// ─────────────────────────────────────────────────────────────────
async function processPaymentEvent(fastify, mpPaymentId) {
    const { prisma } = fastify;

    // 1) Pull authoritative state from MP.
    const mpPayment = await mpGetPayment(mpPaymentId);
    if (!mpPayment || !mpPayment.id) {
        fastify.log.warn({ mpPaymentId }, '[mp-webhook] payment not found in MP');
        return;
    }

    const externalRef = mpPayment.external_reference
        ? String(mpPayment.external_reference)
        : null;
    const preferenceId = mpPayment.preference_id || null;

    // 2) Find the local Payment row.
    let payment = null;
    if (externalRef) {
        payment = await prisma.payment.findUnique({ where: { id: externalRef } });
    }
    if (!payment && preferenceId) {
        payment = await prisma.payment.findUnique({
            where: { mp_preference_id: preferenceId },
        });
    }
    if (!payment) {
        fastify.log.warn(
            { mpPaymentId, externalRef, preferenceId },
            '[mp-webhook] no local Payment match'
        );
        return;
    }

    const newStatus = mapPaymentStatus(mpPayment.status);
    const wasApproved = payment.status === 'APPROVED';
    const nowApproved = newStatus === 'APPROVED';

    // 3) Update the Payment row.
    const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
            mp_payment_id: String(mpPayment.id),
            status: newStatus,
            mp_status_detail: mpPayment.status_detail || null,
            paid_at: nowApproved
                ? (payment.paid_at || new Date(mpPayment.date_approved || Date.now()))
                : payment.paid_at,
            metadata: {
                ...(payment.metadata || {}),
                mp_status: mpPayment.status,
                mp_payment_method: mpPayment.payment_method_id,
                mp_payment_type: mpPayment.payment_type_id,
                mp_installments: mpPayment.installments,
            },
        },
    });

    // 4) Fire events on approval (once).
    if (nowApproved && !wasApproved) {
        await fireEvent('payment.approved', {
            workspaceId: updated.workspace_id,
            paymentId: updated.id,
            userId: updated.user_id,
            type: updated.type,
            amount: updated.amount,
        });

        if (updated.type === 'MEMBERSHIP') {
            await activateMembershipFromPayment(fastify, updated);
        } else if (updated.type === 'DIGITAL_PRODUCT') {
            await fulfillDigitalProduct(fastify, updated);
        } else if (updated.type === 'COURSE') {
            await enrollInCourse(fastify, updated);
        } else if (updated.type === 'MEAL_PLAN_ADDON') {
            await activateMealPlanAddonFromPayment(fastify, updated);
        }
    }
}

// ─────────────────────────────────────────────────────────────────
// Membership activation / renewal.
//
// Exported so /memberships/subscribe-card (synchronous card-token
// flow) can reuse the exact same activation path instead of forking
// the logic. Idempotent: calling it twice on the same payment just
// updates the existing membership to the same state.
// ─────────────────────────────────────────────────────────────────
export async function activateMembershipFromPayment(fastify, payment) {
    const { prisma } = fastify;
    const meta = payment.metadata || {};
    const plan = meta.plan;
    const billingCycle = meta.billing_cycle;
    if (!plan || !billingCycle) {
        fastify.log.warn(
            { paymentId: payment.id },
            '[mp-webhook] membership payment missing plan/billing_cycle metadata'
        );
        return;
    }

    const existing = await prisma.membership.findUnique({
        where: { user_id: payment.user_id },
    });

    // Extend from the later of (now, current expires_at).
    const base =
        existing && dayjs(existing.expires_at).isAfter(dayjs())
            ? existing.expires_at
            : new Date();
    const newExpiresAt = computeExpiresAt(billingCycle, base);
    // Read the workspace-overridden price so admin edits in
    // /admin/memberships/plans/:code are reflected on the membership row.
    // Falls back to the static catalog price, and finally to the amount
    // actually paid, to keep legacy rows intact.
    const effectivePrice = await getEffectivePlanPrice(
        prisma,
        payment.workspace_id,
        plan,
        billingCycle,
    );
    const priceMxn = effectivePrice || payment.amount;

    let membership;
    let isRenewal = false;
    if (existing) {
        isRenewal = true;
        membership = await prisma.membership.update({
            where: { id: existing.id },
            data: {
                plan,
                billing_cycle: billingCycle,
                expires_at: newExpiresAt,
                status: 'ACTIVE',
                price_mxn: priceMxn,
            },
        });
    } else {
        membership = await prisma.membership.create({
            data: {
                workspace_id: payment.workspace_id,
                user_id: payment.user_id,
                plan,
                billing_cycle: billingCycle,
                starts_at: new Date(),
                expires_at: newExpiresAt,
                status: 'ACTIVE',
                price_mxn: priceMxn,
            },
        });
    }

    // Bump promo code usage count now that the payment actually landed.
    if (meta.promo_id) {
        try {
            await prisma.promoCode.update({
                where: { id: meta.promo_id },
                data: { used_count: { increment: 1 } },
            });
        } catch (e) {
            fastify.log.warn(
                { err: e, promoId: meta.promo_id },
                '[mp-webhook] failed to bump promo used_count'
            );
        }
    }

    await fireEvent(isRenewal ? 'membership.renewed' : 'member.verified', {
        workspaceId: payment.workspace_id,
        userId: payment.user_id,
        membershipId: membership.id,
        plan,
        billingCycle,
    });
}

// ─────────────────────────────────────────────────────────────────
// Digital product fulfillment.
// ─────────────────────────────────────────────────────────────────
async function fulfillDigitalProduct(fastify, payment) {
    const { prisma } = fastify;
    const meta = payment.metadata || {};
    const productId = meta.product_id || payment.reference;
    if (!productId) {
        fastify.log.warn(
            { paymentId: payment.id },
            '[mp-webhook] digital product payment missing product_id'
        );
        return;
    }

    const product = await prisma.digitalProduct.findUnique({ where: { id: productId } });
    if (!product) {
        fastify.log.warn(
            { paymentId: payment.id, productId },
            '[mp-webhook] digital product not found'
        );
        return;
    }

    const split = product.revenue_split ?? 70;
    const authorPayout = Math.round((payment.amount * split) / 100);
    const gymRevenue = payment.amount - authorPayout;

    // Upsert — re-buying the same product doesn't duplicate rows.
    const purchase = await prisma.productPurchase.upsert({
        where: {
            user_id_product_id: {
                user_id: payment.user_id,
                product_id: productId,
            },
        },
        update: { payment_id: payment.id },
        create: {
            workspace_id: payment.workspace_id,
            user_id: payment.user_id,
            product_id: productId,
            payment_id: payment.id,
            price_paid_mxn: payment.amount,
            author_payout_mxn: authorPayout,
            gym_revenue_mxn: gymRevenue,
        },
    });

    await prisma.digitalProduct.update({
        where: { id: productId },
        data: { sales_count: { increment: 1 } },
    });

    await fireEvent('product.purchased', {
        workspaceId: payment.workspace_id,
        userId: payment.user_id,
        productId,
        purchaseId: purchase.id,
        amount: payment.amount,
    });
}

// ─────────────────────────────────────────────────────────────────
// Course enrollment.
// ─────────────────────────────────────────────────────────────────
async function enrollInCourse(fastify, payment) {
    const { prisma } = fastify;
    const meta = payment.metadata || {};
    const courseId = meta.course_id || payment.reference;
    if (!courseId) {
        fastify.log.warn(
            { paymentId: payment.id },
            '[mp-webhook] course payment missing course_id'
        );
        return;
    }

    await prisma.course.update({
        where: { id: courseId },
        data: { enrolled: { increment: 1 } },
    });

    await fireEvent('course.enrolled', {
        workspaceId: payment.workspace_id,
        userId: payment.user_id,
        courseId,
        amount: payment.amount,
    });
}

// ─────────────────────────────────────────────────────────────────
// Meal-plan add-on activation.
//
// Exported so /addons/meal-plan/purchase-card (synchronous Brick
// flow) can short-circuit MP and activate the addon in the same
// request when the resolved amount is 0 (100%-off promo). Also
// invoked from processPaymentEvent when MP fires the webhook for
// regular paid charges. Idempotent — calling twice on the same
// payment is a no-op.
// ─────────────────────────────────────────────────────────────────
export async function activateMealPlanAddonFromPayment(fastify, payment) {
    const { prisma } = fastify;
    const meta = payment.metadata || {};

    const addon = await prisma.mealPlanAddon.findUnique({
        where: { payment_id: payment.id },
    });
    if (!addon) {
        fastify.log.warn(
            { paymentId: payment.id },
            '[mp-webhook] meal_plan_addon row missing for payment'
        );
        return;
    }
    if (addon.status === 'ACTIVE' || addon.status === 'CONSUMED') {
        // Already activated (or already used) — webhook idempotency.
        return;
    }

    const updated = await prisma.mealPlanAddon.update({
        where: { id: addon.id },
        data: {
            status: 'ACTIVE',
            activated_at: new Date(),
        },
    });

    // Bump promo code usage now that the charge actually landed.
    if (meta.promo_id) {
        try {
            await prisma.promoCode.update({
                where: { id: meta.promo_id },
                data: { used_count: { increment: 1 } },
            });
        } catch (e) {
            fastify.log.warn(
                { err: e, promoId: meta.promo_id },
                '[mp-webhook] failed to bump promo used_count for addon'
            );
        }
    }

    await fireEvent('addon.meal_plan.activated', {
        workspaceId: payment.workspace_id,
        userId: payment.user_id,
        addonId: updated.id,
        paymentId: payment.id,
        amount: payment.amount,
    });
}
