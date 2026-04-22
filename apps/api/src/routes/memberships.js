// ─────────────────────────────────────────────────────────────────
// Memberships routes.
//
// Public:
//   GET  /memberships/plans
//
// Authenticated (JWT):
//   GET  /memberships/me
//   POST /memberships/subscribe       — Checkout Pro (redirect flow)
//   POST /memberships/subscribe-card  — Payment Bricks (embedded flow)
//   POST /memberships/renew
//   GET  /memberships/history
//   POST /memberships/freeze
//   POST /memberships/cancel
//
// Admin (ADMIN / SUPERADMIN):
//   GET    /admin/memberships
//   POST   /admin/memberships/assign  — manual (cash / transfer / etc.)
//   PATCH  /admin/memberships/:id
//   DELETE /admin/memberships/:id
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import dayjs from 'dayjs';
import { err } from '../lib/errors.js';
import { fireEvent } from '../lib/events.js';
import { audit, auditCtx } from '../lib/audit.js';
import {
    PLAN_CATALOG,
    VALID_PLANS,
    VALID_CYCLES,
    PLAN_RANK,
    getPlanPrice,
    getPlanByCode,
    getPublicPlanCatalog,
    computeExpiresAt,
    daysRemaining,
    earlyRenewalDiscount,
    applyPromoToAmount,
} from '../lib/memberships.js';
import {
    createPreference,
    cancelSubscription,
    createCardPayment,
    mapPaymentStatus,
} from '../lib/mercadopago.js';
import { activateMembershipFromPayment } from './webhooks.js';

// ─────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────
const subscribeBody = z.object({
    plan: z.enum(['STARTER', 'PRO', 'ELITE']),
    billing_cycle: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
    promo_code: z.string().trim().min(1).max(64).optional(),
    sport: z.string().optional(),
});

// ────────────────────────────────────────────────────────────────
// POST /memberships/subscribe-card — embedded Payment Bricks flow.
//
// The frontend uses the MP Payment Brick SDK to tokenize the card
// (PCI scope stays with MP) and hands us the one-time `token`.
// We charge synchronously and activate the membership in-request
// when MP returns `approved`. `cycle` is lowercase here because
// that's what the Brick emits; we normalize to the uppercase
// BillingCycle enum internally.
// ────────────────────────────────────────────────────────────────
const subscribeCardBody = z.object({
    plan: z.enum(['STARTER', 'PRO', 'ELITE']),
    cycle: z.enum(['monthly', 'quarterly', 'annual']),
    token: z.string().min(8),
    payment_method_id: z.string().min(1).max(32),
    installments: z.number().int().min(1).max(12).default(1),
    payer_email: z.string().email().optional(),
    promo_code: z.string().trim().min(1).max(64).optional(),
});

// Map Brick `cycle` → internal BillingCycle enum.
const CYCLE_MAP = {
    monthly: 'MONTHLY',
    quarterly: 'QUARTERLY',
    annual: 'ANNUAL',
};

// ────────────────────────────────────────────────────────────────
// POST /admin/memberships/assign — manual assignment (cash /
// transfer / terminal / complimentary). No MP involved.
// ────────────────────────────────────────────────────────────────
const adminAssignBody = z.object({
    user_id: z.string().min(1),
    plan: z.enum(['STARTER', 'PRO', 'ELITE']),
    cycle: z.enum(['monthly', 'quarterly', 'annual']),
    starts_at: z.string().datetime().optional(),
    note: z.string().trim().max(500).optional(),
    method: z
        .enum(['CASH', 'TRANSFER', 'TERMINAL', 'COMPLIMENTARY'])
        .default('CASH'),
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

// Motivo opcional: si el dueño quiere dejar constancia puede, pero
// el flujo debe ser 2 clics por defecto.
const adminDeleteBody = z.object({
    reason: z.string().trim().max(500).optional(),
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

// Resolve a promo code against a base amount. Throws the standard
// `err()` envelope on failure so callers can `await` without extra
// validation. Returns { amount, discount, promo } — promo may be null
// when no code was supplied. Shared between /subscribe, /renew and
// /subscribe-card so the discount math never drifts.
async function resolvePromo(prisma, promoCode, basePrice, appliesTo) {
    if (!promoCode) {
        return { amount: basePrice, discount: 0, promo: null };
    }
    const found = await prisma.promoCode.findUnique({
        where: { code: promoCode },
    });
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

// Copy shown in the welcome response for /subscribe-card. Kept in
// sync with the landing features; the frontend renders it as a
// post-payment celebration card.
function welcomeCopyFor(plan) {
    const meta = getPlanByCode(plan);
    return {
        title: `¡Bienvenid@ al plan ${meta?.name || plan}!`,
        benefits: meta?.features ? [...meta.features] : [],
    };
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
    //
    // Canonical catalog: landing page + portal fetch this so copy,
    // prices and features come from ONE place (apps/api/src/lib/memberships.js).
    // Public = no auth; responses are cacheable by shape.
    fastify.get('/memberships/plans', async () => ({
        plans: getPublicPlanCatalog(),
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

            // Gate: el usuario debe tener una selfie en su perfil antes de
            // pagar. El staff la usa para identificarlo en check-in. Los
            // endpoints admin (staff-register) crean membresía por su lado
            // y no pasan por aquí, así que el bypass es automático.
            if (!user.selfie_url) {
                throw err(
                    'SELFIE_REQUIRED',
                    'Debes subir una selfie antes de comprar tu membresía.',
                    400
                );
            }

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

    // ─── POST /memberships/subscribe-card ─────────────────────────
    //
    // Embedded MP Payment Bricks flow — no init_point redirect.
    // The frontend has already tokenized the card; we charge
    // synchronously and activate the membership in-request if MP
    // approves. Rejected / in_process responses return 402 so the
    // Brick can show the MP status_detail and let the user retry.
    //
    fastify.post(
        '/memberships/subscribe-card',
        {
            preHandler: [
                fastify.authenticate,
                fastify.requireRole('ATHLETE', 'TRAINER', 'RECEPTIONIST', 'ADMIN', 'SUPERADMIN'),
            ],
        },
        async (req, reply) => {
            const parsed = subscribeCardBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const {
                plan,
                cycle,
                token,
                payment_method_id,
                installments,
                payer_email,
                promo_code,
            } = parsed.data;
            const billingCycle = CYCLE_MAP[cycle];

            const basePrice = getPlanPrice(plan, billingCycle);
            if (basePrice == null) {
                throw err('PLAN_INVALID', 'Plan o ciclo inválido', 400);
            }

            const userId = req.user.sub || req.user.id;
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw err('USER_NOT_FOUND', 'Usuario inexistente', 404);

            // Selfie gate — same rule as /subscribe. Staff identifies
            // the member at check-in by the selfie.
            if (!user.selfie_url) {
                throw err(
                    'SELFIE_REQUIRED',
                    'Debes subir una selfie antes de comprar tu membresía.',
                    400
                );
            }

            const { amount, discount, promo } = await resolvePromo(
                prisma,
                promo_code,
                basePrice,
                'MEMBERSHIP'
            );

            const planMeta = getPlanByCode(plan);
            const description = `Membresía ${planMeta?.name || plan} — ${billingCycle}`;
            const effectivePayerEmail = payer_email || user.email || undefined;

            // 1) Create the local PENDING Payment first so we have a
            // stable id to hand MP as external_reference.
            const payment = await prisma.payment.create({
                data: {
                    workspace_id: user.workspace_id,
                    user_id: user.id,
                    amount,
                    type: 'MEMBERSHIP',
                    reference: `${plan}:${billingCycle}`,
                    description,
                    status: 'PENDING',
                    metadata: {
                        plan,
                        billing_cycle: billingCycle,
                        base_price: basePrice,
                        discount_mxn: discount,
                        promo_code: promo?.code || null,
                        promo_id: promo?.id || null,
                        flow: 'card_brick',
                        payment_method_id,
                        installments,
                    },
                },
            });

            // 1.5) Promo 100% bypass — if the resolved amount is 0 MXN
            // (e.g. a courtesy/test code that wipes the whole charge)
            // Mercado Pago will reject the transaction anyway. Mark the
            // Payment as APPROVED ourselves, activate the membership
            // synchronously via the shared helper, and short-circuit
            // before touching MP. The activation helper also bumps the
            // promo used_count via meta.promo_id, so we don't need to
            // bump it here.
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
                    await activateMembershipFromPayment(fastify, approvedPayment);
                } catch (e) {
                    req.log.error(
                        { err: e, paymentId: approvedPayment.id },
                        '[memberships/subscribe-card] promo_100 activation failed'
                    );
                }

                const membership = await prisma.membership.findUnique({
                    where: { user_id: user.id },
                });

                return {
                    success: true,
                    payment: {
                        id: approvedPayment.id,
                        amount: approvedPayment.amount,
                        status: approvedPayment.status,
                        mp_payment_id: null,
                        discount_mxn: discount,
                    },
                    membership,
                    welcome: welcomeCopyFor(plan),
                };
            }

            // 2) Charge MP via the Brick token.
            let mpResp;
            try {
                mpResp = await createCardPayment({
                    transaction_amount: amount,
                    token,
                    payment_method_id,
                    installments,
                    payer_email: effectivePayerEmail,
                    description,
                    external_reference: payment.id,
                    metadata: {
                        plan,
                        billing_cycle: billingCycle,
                        workspace_id: user.workspace_id,
                        user_id: user.id,
                    },
                });
            } catch (e) {
                // Network / auth / validation error from MP — mark the
                // Payment as REJECTED so admin dashboards don't show a
                // permanent PENDING ghost, and surface a generic 502.
                req.log.error(
                    { err: e, paymentId: payment.id },
                    '[memberships/subscribe-card] MP createCardPayment failed'
                );
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: {
                        status: 'REJECTED',
                        mp_status_detail: 'mp_sdk_error',
                        metadata: {
                            ...(payment.metadata || {}),
                            mp_error: e?.message || 'unknown',
                        },
                    },
                });
                throw err(
                    'MP_ERROR',
                    'No se pudo procesar el pago con Mercado Pago. Intenta de nuevo.',
                    502
                );
            }

            const mpStatus = mpResp?.status || 'rejected';
            const newStatus = mapPaymentStatus(mpStatus);

            // 3) Update the local Payment row with the MP result.
            const updatedPayment = await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    mp_payment_id: mpResp?.id ? String(mpResp.id) : null,
                    status: newStatus,
                    mp_status_detail: mpResp?.status_detail || null,
                    paid_at:
                        newStatus === 'APPROVED'
                            ? new Date(mpResp?.date_approved || Date.now())
                            : null,
                    metadata: {
                        ...(payment.metadata || {}),
                        mp_status: mpStatus,
                        mp_status_detail: mpResp?.status_detail || null,
                        mp_payment_method: mpResp?.payment_method_id || payment_method_id,
                        mp_payment_type: mpResp?.payment_type_id || null,
                        mp_installments: mpResp?.installments || installments,
                    },
                },
            });

            // 4) Approved → activate synchronously using the same helper
            // the webhook uses. The webhook will later idempotently re-run
            // on MP's own retry; activating here just removes the race.
            if (newStatus === 'APPROVED') {
                try {
                    await activateMembershipFromPayment(fastify, updatedPayment);
                } catch (e) {
                    // If activation blows up we still keep the Payment
                    // APPROVED; the webhook will retry. Log loud.
                    req.log.error(
                        { err: e, paymentId: updatedPayment.id },
                        '[memberships/subscribe-card] activateMembershipFromPayment failed'
                    );
                }

                // Bump promo used_count once the charge landed.
                if (promo?.id) {
                    try {
                        await prisma.promoCode.update({
                            where: { id: promo.id },
                            data: { used_count: { increment: 1 } },
                        });
                    } catch (e) {
                        req.log.warn(
                            { err: e, promoId: promo.id },
                            '[memberships/subscribe-card] promo used_count bump failed'
                        );
                    }
                }

                const membership = await prisma.membership.findUnique({
                    where: { user_id: user.id },
                });

                return {
                    success: true,
                    payment: {
                        id: updatedPayment.id,
                        amount: updatedPayment.amount,
                        status: updatedPayment.status,
                        mp_payment_id: updatedPayment.mp_payment_id,
                        discount_mxn: discount,
                    },
                    membership,
                    welcome: welcomeCopyFor(plan),
                };
            }

            // 5) Rejected / in-process → 402 so the Brick retries.
            if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
                return reply.code(402).send({
                    error: {
                        code: 'PAYMENT_DECLINED',
                        message:
                            mpResp?.status_detail ||
                            'El pago fue rechazado por el emisor. Verifica los datos o usa otra tarjeta.',
                        retry_allowed: true,
                    },
                    statusCode: 402,
                });
            }

            // in_process / pending / authorized-without-capture
            return reply.code(402).send({
                error: {
                    code: 'PAYMENT_DECLINED',
                    message:
                        mpResp?.status_detail ||
                        'Tu pago quedó en revisión. Recibirás confirmación en minutos.',
                    retry_allowed: true,
                },
                statusCode: 402,
            });
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

    // ─── POST /admin/memberships/assign ───────────────────────────
    //
    // Manual assignment (cash / transfer / terminal / complimentary).
    // Skips MP entirely: we write an APPROVED Payment + ACTIVE
    // Membership in one shot, leave an AuditLog row, and fire the
    // `membership.assigned_manually` event so WhatsApp welcome +
    // other automations kick in.
    //
    // Refuses if the user already has an ACTIVE membership — the
    // admin is expected to renew via PATCH (or use this flow after
    // the current one expires).
    //
    fastify.post(
        '/admin/memberships/assign',
        {
            preHandler: [
                fastify.authenticate,
                fastify.requireRole('ADMIN', 'SUPERADMIN'),
            ],
        },
        async (req) => {
            const parsed = adminAssignBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const { user_id, plan, cycle, starts_at, note, method } = parsed.data;
            const billingCycle = CYCLE_MAP[cycle];

            const user = await prisma.user.findUnique({ where: { id: user_id } });
            if (!user) throw err('USER_NOT_FOUND', 'Socio no encontrado', 404);

            // Workspace tenant guard — admin can only assign inside
            // their own workspace.
            if (req.user.workspace_id && user.workspace_id !== req.user.workspace_id) {
                throw err('FORBIDDEN', 'El socio pertenece a otro workspace', 403);
            }

            // Active membership → refuse with a clear hint.
            const existing = await prisma.membership.findUnique({
                where: { user_id: user.id },
            });
            if (existing && existing.status === 'ACTIVE') {
                throw err(
                    'MEMBERSHIP_ACTIVE',
                    'El socio ya tiene una membresía ACTIVA. Usa PATCH /admin/memberships/:id para renovar o editar.',
                    409
                );
            }

            const basePrice = getPlanPrice(plan, billingCycle);
            if (basePrice == null) {
                throw err('PLAN_INVALID', 'Plan o ciclo inválido', 400);
            }

            const startsAt = starts_at ? new Date(starts_at) : new Date();
            const expiresAt = computeExpiresAt(billingCycle, startsAt);

            // For COMPLIMENTARY (courtesy), record the price as 0 in
            // the Payment row — useful for revenue reports.
            const paymentAmount = method === 'COMPLIMENTARY' ? 0 : basePrice;

            // 1) Write Payment (APPROVED, method-specific metadata).
            const payment = await prisma.payment.create({
                data: {
                    workspace_id: user.workspace_id,
                    user_id: user.id,
                    amount: paymentAmount,
                    type: 'MEMBERSHIP',
                    reference: `${plan}:${billingCycle}:ADMIN_ASSIGN`,
                    description: `Asignación manual ${plan} ${billingCycle} (${method})`,
                    status: 'APPROVED',
                    paid_at: new Date(),
                    metadata: {
                        plan,
                        billing_cycle: billingCycle,
                        admin_assigned: true,
                        method,
                        note: note || null,
                        base_price: basePrice,
                        assigned_by: req.user.sub || req.user.id,
                        assigned_by_role: req.user.role,
                    },
                },
            });

            // 2) Upsert Membership — update if the user had an old
            // EXPIRED/CANCELED row, otherwise create fresh.
            let membership;
            if (existing) {
                membership = await prisma.membership.update({
                    where: { id: existing.id },
                    data: {
                        plan,
                        billing_cycle: billingCycle,
                        starts_at: startsAt,
                        expires_at: expiresAt,
                        status: 'ACTIVE',
                        price_mxn: basePrice,
                        // Manual assignment defaults to NO auto-renew —
                        // the gym will re-charge manually next cycle.
                        auto_renew: false,
                    },
                });
            } else {
                membership = await prisma.membership.create({
                    data: {
                        workspace_id: user.workspace_id,
                        user_id: user.id,
                        plan,
                        billing_cycle: billingCycle,
                        starts_at: startsAt,
                        expires_at: expiresAt,
                        status: 'ACTIVE',
                        price_mxn: basePrice,
                        auto_renew: false,
                    },
                });
            }

            // 3) AuditLog — LFPDPPP trail for "who granted what".
            await audit(fastify, {
                workspace_id: user.workspace_id,
                actor_id: req.user?.sub || req.user?.id || null,
                action: 'membership.assigned_manually',
                target_type: 'membership',
                target_id: membership.id,
                metadata: {
                    user_id: user.id,
                    user_name: user.full_name || user.name,
                    plan,
                    billing_cycle: billingCycle,
                    method,
                    note: note || null,
                    amount_mxn: paymentAmount,
                    payment_id: payment.id,
                    actor_role: req.user?.role || null,
                },
                ...auditCtx(req),
            });

            // 4) Fire the event (welcome drip, WhatsApp greet, etc.).
            await fireEvent('membership.assigned_manually', {
                workspaceId: user.workspace_id,
                userId: user.id,
                membershipId: membership.id,
                plan,
                billingCycle,
                method,
            });

            // Also fire member.verified so the existing welcome pipeline
            // (mirrors what the walk-in + webhook flows do) runs.
            await fireEvent('member.verified', {
                workspaceId: user.workspace_id,
                userId: user.id,
                membershipId: membership.id,
                plan,
                billingCycle,
            });

            return {
                membership,
                payment,
                welcome: welcomeCopyFor(plan),
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

            // Tenant guard: refuse to update a membership that doesn't
            // belong to the admin's workspace (IDOR defense).
            const existing = await prisma.membership.findFirst({
                where: {
                    id: req.params.id,
                    workspace_id: req.user.workspace_id,
                },
                select: { id: true },
            });
            if (!existing) {
                throw err('NOT_FOUND', 'Membresía no encontrada en este workspace', 404);
            }
            const updated = await prisma.membership.update({
                where: { id: req.params.id },
                data,
            });
            return { membership: updated };
        }
    );

    // ─── DELETE /admin/memberships/:id ────────────────────────────
    // Hard-delete con motivo obligatorio. Reception + admin pueden borrar;
    // el AuditLog queda como evidencia LFPDPPP de quién y por qué.
    fastify.delete(
        '/admin/memberships/:id',
        {
            preHandler: [
                fastify.authenticate,
                fastify.requireRole('ADMIN', 'SUPERADMIN', 'RECEPTIONIST'),
            ],
        },
        async (req) => {
            const parsed = adminDeleteBody.safeParse(req.body || {});
            if (!parsed.success) {
                throw err(
                    'BAD_BODY',
                    'Motivo inválido (opcional, máx 500 caracteres)',
                    400
                );
            }
            const { reason } = parsed.data;
            const membershipId = req.params.id;

            // Tenant guard: the membership must belong to the caller's
            // workspace; prevents cross-workspace deletion (IDOR).
            const membership = await prisma.membership.findFirst({
                where: {
                    id: membershipId,
                    workspace_id: req.user.workspace_id,
                },
                include: {
                    user: {
                        select: { id: true, name: true, full_name: true, email: true, phone: true },
                    },
                },
            });
            if (!membership) {
                throw err('MEMBERSHIP_NOT_FOUND', 'Membresía no encontrada', 404);
            }

            // Write audit first (best-effort, never throws).
            const actorId = req.user?.sub || req.user?.id || null;
            await audit(fastify, {
                workspace_id: membership.workspace_id,
                actor_id: actorId,
                action: 'membership.deleted',
                target_type: 'membership',
                target_id: membershipId,
                metadata: {
                    reason,
                    user_id: membership.user_id,
                    user_name: membership.user?.full_name || membership.user?.name || null,
                    user_email: membership.user?.email || null,
                    user_phone: membership.user?.phone || null,
                    plan: membership.plan,
                    billing_cycle: membership.billing_cycle,
                    status_at_delete: membership.status,
                    expires_at: membership.expires_at,
                    actor_role: req.user?.role || null,
                },
                ...auditCtx(req),
            });

            // Hard delete (Prisma will cascade to freezes via schema FKs).
            await prisma.membership.delete({ where: { id: membershipId } });

            return { ok: true, deleted_id: membershipId };
        }
    );
}
