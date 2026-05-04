// ─────────────────────────────────────────────────────────────────
// Payment activation helpers — gateway-agnostic.
//
// Both helpers take an APPROVED Payment row and apply the
// downstream side-effects (extend membership expiry, flip addon
// to ACTIVE, etc.). They are idempotent: calling them twice on
// the same payment is a no-op past the first run.
//
// Exposed to /memberships/subscribe-stripe, /addons/meal-plan/purchase-stripe
// (sync activation) and /webhooks/stripe (async activation), so the
// activation pipeline never forks between the immediate-success path
// (frontend confirmPayment landed) and the eventually-consistent
// webhook path.
//
// Originally lived in routes/webhooks.js (when MP was the only
// gateway). Hoisted to lib/ during the MP → Stripe migration so the
// MP webhook route could be deleted without taking these with it.
// ─────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import { fireEvent } from './events.js';
import {
    computeExpiresAt,
    getEffectivePlanPrice,
} from './memberships.js';

// ─────────────────────────────────────────────────────────────────
// Membership activation.
// ─────────────────────────────────────────────────────────────────
export async function activateMembershipFromPayment(fastify, payment) {
    const { prisma, redis } = fastify;
    const meta = payment.metadata || {};
    const plan = meta.plan;
    const billingCycle = meta.billing_cycle;
    if (!plan || !billingCycle) {
        fastify.log.warn(
            { paymentId: payment.id },
            '[activate-membership] payment missing plan/billing_cycle metadata',
        );
        return;
    }

    // Per-payment idempotency. Without this, the sync-stripe-payment path
    // and the invoice.payment_succeeded webhook race and BOTH extend
    // expires_at — a monthly plan ends up with 60 days because the second
    // call sees a future expires_at and adds another month on top.
    //
    // Two-layer guard:
    //   1. Persistent stamp on payment.metadata.activated_at — survives
    //      restarts and Redis flushes; covers the "second caller after the
    //      first has already finished" case.
    //   2. Redis SETNX lock on activate:membership:{id} (24 h TTL) —
    //      atomic at the Redis layer; covers the concurrent-callers race
    //      where neither has stamped yet.
    if (meta.activated_at) {
        return;
    }
    if (redis) {
        const lockKey = `activate:membership:${payment.id}`;
        const got = await redis.set(lockKey, '1', 'EX', 24 * 60 * 60, 'NX');
        if (!got) {
            return;
        }
    }

    // Re-read the payment in case the lock winner above had already
    // stamped activated_at before we took the lock (unlikely but cheap).
    const fresh = await prisma.payment.findUnique({
        where: { id: payment.id },
        select: { metadata: true },
    });
    if (fresh?.metadata?.activated_at) {
        return;
    }

    const existing = await prisma.membership.findUnique({
        where: { user_id: payment.user_id },
    });

    // Extend from the later of (now, current expires_at) so we
    // never accidentally shrink a paid period when the webhook
    // races the sync endpoint.
    const base =
        existing && dayjs(existing.expires_at).isAfter(dayjs())
            ? existing.expires_at
            : new Date();
    const newExpiresAt = computeExpiresAt(billingCycle, base);

    // Read the workspace-overridden price so admin edits in
    // /admin/memberships/plans/:code are reflected on the membership.
    // Falls back to the static catalog price, then to the amount
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

    // Bump promo usage once the charge actually landed.
    if (meta.promo_id) {
        try {
            await prisma.promoCode.update({
                where: { id: meta.promo_id },
                data: { used_count: { increment: 1 } },
            });
        } catch (e) {
            fastify.log.warn(
                { err: e, promoId: meta.promo_id },
                '[activate-membership] failed to bump promo used_count',
            );
        }
    }

    // First-time inscription stamp — idempotent, only sets if null.
    if (meta.includes_inscription) {
        try {
            await prisma.user.updateMany({
                where: { id: payment.user_id, inscription_paid_at: null },
                data: { inscription_paid_at: new Date() },
            });
        } catch (e) {
            fastify.log.warn(
                { err: e, userId: payment.user_id, paymentId: payment.id },
                '[activate-membership] failed to mark inscription_paid_at',
            );
        }
    }

    // Stamp the payment so the second caller (sync vs webhook) bails
    // out at the idempotency check above. Stamp BEFORE firing the event
    // so a slow event handler can't widen the race window.
    try {
        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                metadata: { ...meta, activated_at: new Date().toISOString() },
            },
        });
    } catch (e) {
        fastify.log.warn(
            { err: e, paymentId: payment.id },
            '[activate-membership] failed to stamp activated_at',
        );
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
// Meal-plan add-on activation.
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
            '[activate-addon] meal_plan_addon row missing for payment',
        );
        return;
    }
    if (addon.status === 'ACTIVE' || addon.status === 'CONSUMED') {
        // Already activated (or already used) — idempotent.
        return;
    }

    const updated = await prisma.mealPlanAddon.update({
        where: { id: addon.id },
        data: {
            status: 'ACTIVE',
            activated_at: new Date(),
        },
    });

    if (meta.promo_id) {
        try {
            await prisma.promoCode.update({
                where: { id: meta.promo_id },
                data: { used_count: { increment: 1 } },
            });
        } catch (e) {
            fastify.log.warn(
                { err: e, promoId: meta.promo_id },
                '[activate-addon] failed to bump promo used_count',
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
