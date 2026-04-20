// ─────────────────────────────────────────────────────────────────
// Memberships routes.
//
// Public:
//   GET  /memberships/plans
//
// Authenticated (JWT):
//   GET  /memberships/me
//   POST /memberships/subscribe
//   POST /memberships/renew
//   GET  /memberships/history
//   POST /memberships/freeze
//   POST /memberships/cancel
//
// Admin (ADMIN / SUPERADMIN):
//   GET   /admin/memberships
//   PATCH /admin/memberships/:id
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import dayjs from 'dayjs';
import { err } from '../lib/errors.js';
import { fireEvent } from '../lib/events.js';
import {
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
} from '../lib/memberships.js';
import {
    createPreference,
    cancelSubscription,
} from '../lib/mercadopago.js';

// ─────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────
const subscribeBody = z.object({
    plan: z.enum(['STARTER', 'PRO', 'ELITE']),
    billing_cycle: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
    promo_code: z.string().trim().min(1).max(64).optional(),
    sport: z.string().optional(),
});

const renewBody = z.object({
    billing_cycle: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']).optional(),
    promo_code: z.string().trim().min(1).max(64).optional(),
});

const freezeBody = z.object({
    reason: z.string().trim().min(3).max(500),
    days: z.number().int().min(7).max(30),
});

const adminListQuery = z.object({
    status: z.enum(['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELED']).optional(),
    plan: z.enum(['STARTER', 'PRO', 'ELITE']).optional(),
    expires_before: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

const adminPatchBody = z.object({
    status: z.enum(['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELED']).optional(),
    plan: z.enum(['STARTER', 'PRO', 'ELITE']).optional(),
    expires_at: z.string().optional(),
    auto_renew: z.boolean().optional(),
    sport: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function apiPublicUrl() {
    return process.env.API_PUBLIC_URL || 'http://localhost:3001';
}

function webappPublicUrl() {
    return process.env.WEBAPP_PUBLIC_URL || 'http://localhost:3000';
}

// Build MP Checkout Pro arguments for a membership payment.
function buildMembershipPreferenceArgs({ user, plan, billingCycle, amount, paymentId }) {
    const planMeta = getPlanByCode(plan);
    return {
        userId: user.id,
        type: 'MEMBERSHIP',
        reference: `${plan}:${billingCycle}`,
        items: [
            {
                id: `${plan}_${billingCycle}`,
                title: `Membresía ${planMeta?.name || plan} — ${billingCycle}`,
                quantity: 1,
                unit_price: amount,
            },
        ],
        payer: { email: user.email, name: user.full_name || user.name },
        back_urls: {
            success: `${webappPublicUrl()}/membership/success?payment=${paymentId}`,
            failure: `${webappPublicUrl()}/membership/failed?payment=${paymentId}`,
            pending: `${webappPublicUrl()}/membership/pending?payment=${paymentId}`,
        },
        notification_url: `${apiPublicUrl()}/webhooks/mercadopago`,
        external_reference: paymentId,
        metadata: {
            plan,
            billing_cycle: billingCycle,
            workspace_id: user.workspace_id,
        },
    };
}

// ─────────────────────────────────────────────────────────────────
export default async function membershipsRoutes(fastify) {
    const { prisma } = fastify;

    // ─── GET /memberships/plans (public) ───────────────────────────
    fastify.get('/memberships/plans', async () => ({
        plans: PLAN_CATALOG,
        currency: 'MXN',
    }));

    // ─── GET /memberships/me ──────────────────────────────────────
    fastify.get(
        '/memberships/me',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const membership = await prisma.membership.findUnique({
                where: { user_id: userId },
            });
            if (!membership) {
                return { membership: null, days_remaining: 0 };
            }
            return {
                membership,
                days_remaining: daysRemaining(membership.expires_at),
            };
        }
    );

    // ─── POST /memberships/subscribe ──────────────────────────────
    fastify.post(
        '/memberships/subscribe',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const parsed = subscribeBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const { plan, billing_cycle, promo_code } = parsed.data;

            const basePrice = getPlanPrice(plan, billing_cycle);
            if (basePrice == null) {
                throw err('PLAN_INVALID', 'Plan o ciclo inválido', 400);
            }

            const userId = req.user.sub || req.user.id;
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw err('USER_NOT_FOUND', 'Usuario inexistente', 404);

            // Apply promo (if any) — we still charge the discounted amount.
            let amount = basePrice;
            let discount = 0;
            let promo = null;
            if (promo_code) {
                const found = await prisma.promoCode.findUnique({
                    where: { code: promo_code },
                });
                const res = applyPromoToAmount(found, basePrice, 'MEMBERSHIP');
                if (!res.valid) {
                    throw err('PROMO_INVALID', `Promo inválido: ${res.reason}`, 400);
                }
                amount = res.final_amount;
                discount = res.discount_mxn;
                promo = res.promo;
            }

            // Create the pending Payment first so we have a stable id
            // to use as MP's external_reference.
            const payment = await prisma.payment.create({
                data: {
                    workspace_id: user.workspace_id,
                    user_id: user.id,
                    amount,
                    type: 'MEMBERSHIP',
                    reference: `${plan}:${billing_cycle}`,
                    description: `Membresía ${plan} ${billing_cycle}`,
                    status: 'PENDING',
                    metadata: {
                        plan,
                        billing_cycle,
                        base_price: basePrice,
                        discount_mxn: discount,
                        promo_code: promo?.code || null,
                        promo_id: promo?.id || null,
                    },
                },
            });

            // Hand off to Mercado Pago and stash the preference id.
            const mpPref = await createPreference(
                buildMembershipPreferenceArgs({
                    user,
                    plan,
                    billingCycle: billing_cycle,
                    amount,
                    paymentId: payment.id,
                })
            );

            await prisma.payment.update({
                where: { id: payment.id },
                data: { mp_preference_id: mpPref.preferenceId },
            });

            return {
                payment_id: payment.id,
                amount,
                discount_mxn: discount,
                init_point: mpPref.init_point,
                sandbox_init_point: mpPref.sandbox_init_point,
            };
        }
    );

    // ─── POST /memberships/renew ──────────────────────────────────
    fastify.post(
        '/memberships/renew',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const parsed = renewBody.safeParse(req.body || {});
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const userId = req.user.sub || req.user.id;
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw err('USER_NOT_FOUND', 'Usuario inexistente', 404);

            const existing = await prisma.membership.findUnique({
                where: { user_id: userId },
            });
            if (!existing) {
                throw err('NO_MEMBERSHIP', 'No hay membresía para renovar', 404);
            }

            const billing_cycle = parsed.data.billing_cycle || existing.billing_cycle;
            const plan = existing.plan;
            const basePrice = getPlanPrice(plan, billing_cycle);
            if (basePrice == null) {
                throw err('PLAN_INVALID', 'Plan o ciclo inválido', 400);
            }

            // Early-renewal discount (≤8 days to expiry → −20 %)
            const earlyPrice = earlyRenewalDiscount(existing.expires_at, basePrice);
            const earlyDiscount = basePrice - earlyPrice;

            // Additional promo-code discount stacks on top.
            let amount = earlyPrice;
            let promoDiscount = 0;
            let promo = null;
            if (parsed.data.promo_code) {
                const found = await prisma.promoCode.findUnique({
                    where: { code: parsed.data.promo_code },
                });
                const res = applyPromoToAmount(found, earlyPrice, 'MEMBERSHIP');
                if (!res.valid) {
                    throw err('PROMO_INVALID', `Promo inválido: ${res.reason}`, 400);
                }
                amount = res.final_amount;
                promoDiscount = res.discount_mxn;
                promo = res.promo;
            }

            const payment = await prisma.payment.create({
                data: {
                    workspace_id: user.workspace_id,
                    user_id: user.id,
                    amount,
                    type: 'MEMBERSHIP',
                    reference: `${plan}:${billing_cycle}:RENEW`,
                    description: `Renovación ${plan} ${billing_cycle}`,
                    status: 'PENDING',
                    metadata: {
                        plan,
                        billing_cycle,
                        renewal: true,
                        base_price: basePrice,
                        early_discount_mxn: earlyDiscount,
                        promo_discount_mxn: promoDiscount,
                        promo_code: promo?.code || null,
                        promo_id: promo?.id || null,
                    },
                },
            });

            const mpPref = await createPreference(
                buildMembershipPreferenceArgs({
                    user,
                    plan,
                    billingCycle: billing_cycle,
                    amount,
                    paymentId: payment.id,
                })
            );

            await prisma.payment.update({
                where: { id: payment.id },
                data: { mp_preference_id: mpPref.preferenceId },
            });

            return {
                payment_id: payment.id,
                amount,
                early_discount_mxn: earlyDiscount,
                promo_discount_mxn: promoDiscount,
                init_point: mpPref.init_point,
                sandbox_init_point: mpPref.sandbox_init_point,
            };
        }
    );

    // ─── GET /memberships/history ─────────────────────────────────
    fastify.get(
        '/memberships/history',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const payments = await prisma.payment.findMany({
                where: { user_id: userId, type: 'MEMBERSHIP' },
                orderBy: { created_at: 'desc' },
                take: 100,
            });
            return { payments };
        }
    );

    // ─── POST /memberships/freeze ─────────────────────────────────
    //
    // Rules:
    //   • min 7 days, max 30 days.
    //   • Total frozen days per rolling 365 days ≤ 30.
    //   • PRO / ELITE → auto-approved, extends expires_at.
    //   • STARTER    → queued for admin approval (we still persist
    //                  the row but don't bump expires_at; admins flip
    //                  `approved_by` via the admin endpoint).
    //
    fastify.post(
        '/memberships/freeze',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const parsed = freezeBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const { reason, days } = parsed.data;
            const userId = req.user.sub || req.user.id;

            const membership = await prisma.membership.findUnique({
                where: { user_id: userId },
            });
            if (!membership) {
                throw err('NO_MEMBERSHIP', 'No hay membresía activa', 404);
            }
            if (membership.status !== 'ACTIVE') {
                throw err('NOT_ACTIVE', 'Solo membresías activas pueden congelarse', 400);
            }

            // Yearly quota — sum of days_frozen in the last 365 days.
            const yearAgo = dayjs().subtract(1, 'year').toDate();
            const freezes = await prisma.membershipFreeze.findMany({
                where: {
                    membership_id: membership.id,
                    created_at: { gte: yearAgo },
                },
            });
            const usedDays = freezes.reduce((sum, f) => sum + (f.days_frozen || 0), 0);
            if (usedDays + days > 30) {
                throw err(
                    'FREEZE_QUOTA',
                    `Cuota anual excedida: ya usaste ${usedDays}/30 días`,
                    400
                );
            }

            const autoApprove = PLAN_RANK[membership.plan] >= PLAN_RANK.PRO;
            const startsAt = new Date();
            const endsAt = dayjs(startsAt).add(days, 'day').toDate();

            const freeze = await prisma.membershipFreeze.create({
                data: {
                    membership_id: membership.id,
                    user_id: userId,
                    reason,
                    starts_at: startsAt,
                    ends_at: endsAt,
                    days_frozen: days,
                    approved_by: autoApprove ? 'auto' : null,
                },
            });

            let updatedMembership = membership;
            if (autoApprove) {
                const newExpires = dayjs(membership.expires_at).add(days, 'day').toDate();
                updatedMembership = await prisma.membership.update({
                    where: { id: membership.id },
                    data: { expires_at: newExpires },
                });
                await fireEvent('membership.frozen', {
                    workspaceId: membership.workspace_id,
                    userId,
                    membershipId: membership.id,
                    days,
                });
            } else {
                await fireEvent('membership.freeze_requested', {
                    workspaceId: membership.workspace_id,
                    userId,
                    membershipId: membership.id,
                    days,
                });
            }

            return {
                freeze,
                auto_approved: autoApprove,
                membership: updatedMembership,
            };
        }
    );

    // ─── POST /memberships/cancel ─────────────────────────────────
    //
    // We never wipe the membership — the user keeps access until
    // `expires_at`. We just flip auto_renew off and cancel any
    // active MP subscription so there's no surprise recharge.
    fastify.post(
        '/memberships/cancel',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const membership = await prisma.membership.findUnique({
                where: { user_id: userId },
            });
            if (!membership) {
                throw err('NO_MEMBERSHIP', 'No hay membresía', 404);
            }

            if (membership.mp_subscription_id) {
                try {
                    await cancelSubscription(membership.mp_subscription_id);
                } catch (e) {
                    fastify.log.error(
                        { err: e, subId: membership.mp_subscription_id },
                        '[memberships] MP cancelSubscription failed'
                    );
                    // fall through — we still toggle auto_renew locally
                }
            }

            const updated = await prisma.membership.update({
                where: { id: membership.id },
                data: { auto_renew: false, mp_subscription_id: null },
            });

            await fireEvent('membership.canceled', {
                workspaceId: membership.workspace_id,
                userId,
                membershipId: membership.id,
            });

            return { membership: updated };
        }
    );

    // ─── GET /admin/memberships ───────────────────────────────────
    fastify.get(
        '/admin/memberships',
        { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] },
        async (req) => {
            const parsed = adminListQuery.safeParse(req.query || {});
            if (!parsed.success) {
                throw err('BAD_QUERY', parsed.error.message, 400);
            }
            const { status, plan, expires_before, page, limit } = parsed.data;
            const where = {};
            if (status) where.status = status;
            if (plan) where.plan = plan;
            if (expires_before) where.expires_at = { lte: new Date(expires_before) };

            const [total, rows] = await Promise.all([
                prisma.membership.count({ where }),
                prisma.membership.findMany({
                    where,
                    orderBy: { expires_at: 'asc' },
                    skip: (page - 1) * limit,
                    take: limit,
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                full_name: true,
                                email: true,
                                phone: true,
                            },
                        },
                    },
                }),
            ]);

            return {
                total,
                page,
                limit,
                pages: Math.max(1, Math.ceil(total / limit)),
                memberships: rows,
            };
        }
    );

    // ─── PATCH /admin/memberships/:id ─────────────────────────────
    fastify.patch(
        '/admin/memberships/:id',
        { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] },
        async (req) => {
            const parsed = adminPatchBody.safeParse(req.body || {});
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const data = { ...parsed.data };
            if (data.expires_at) data.expires_at = new Date(data.expires_at);

            const updated = await prisma.membership.update({
                where: { id: req.params.id },
                data,
            });
            return { membership: updated };
        }
    );
}
