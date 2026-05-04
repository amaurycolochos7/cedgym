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
import { assertWorkspaceAccess } from '../lib/tenant-guard.js';
import { fireEvent } from '../lib/events.js';
import { audit, auditCtx } from '../lib/audit.js';
import {
    VALID_PLANS,
    PLAN_RANK,
    getEffectivePlanPrice,
    getPlanByCode,
    getMergedPublicPlanCatalog,
    computeExpiresAt,
    daysRemaining,
} from '../lib/memberships.js';
import { SETTING_KEYS, getWorkspaceSettings, setWorkspaceSetting } from '../lib/settings.js';
import { getStripe } from '../lib/stripe.js';
import { activateMembershipFromPayment } from '../lib/payment-activation.js';

// ─────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
// POST /admin/memberships/assign — manual assignment (cash /
// transfer / terminal / complimentary). No gateway involved.
// ────────────────────────────────────────────────────────────────
const adminAssignBody = z.object({
    user_id: z.string().min(1),
    plan: z.enum(['STARTER', 'PRO', 'ELITE']),
    cycle: z.enum(['monthly']).default('monthly'),
    starts_at: z.string().datetime().optional(),
    note: z.string().trim().max(500).optional(),
    method: z
        .enum(['CASH', 'TRANSFER', 'TERMINAL', 'COMPLIMENTARY'])
        .default('CASH'),
    // Explicit opt-in: when true, the endpoint replaces an existing
    // ACTIVE membership instead of refusing with MEMBERSHIP_ACTIVE.
    // The admin UI sends this when entering through "Renovar / cambiar
    // plan" — the button label IS the consent. Direct API callers must
    // pass it deliberately so they don't wipe a paid membership by
    // accident.
    replace_active: z.boolean().optional(),
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
export default async function membershipsRoutes(fastify) {
    const { prisma } = fastify;

    // ─── GET /memberships/plans (public) ───────────────────────────
    //
    // Canonical catalog: landing page + portal fetch this so copy,
    // prices and features come from ONE place. Now pulls admin-editable
    // price overrides from `workspace_settings` and overlays them on
    // the in-code catalog, so the admin UI drives what both the
    // landing and the portal show. Public = no auth; the default
    // workspace is resolved at boot (fastify.defaultWorkspaceId).
    fastify.get('/memberships/plans', async () => {
        const workspaceId = fastify.defaultWorkspaceId || null;
        const plans = await getMergedPublicPlanCatalog(prisma, workspaceId);
        return { plans, currency: 'MXN' };
    });

    // ─── PATCH /admin/memberships/plans/:code ──────────────────────
    //
    // Updates the admin-editable override for a single plan. Stores
    // the deltas in `workspace_settings[plan.overrides]`; the
    // in-code PLAN_CATALOG (lib/memberships.js) is never mutated so
    // "reset to default" is as simple as clearing a field.
    //
    // Body accepts any subset of: monthly_price_mxn, enabled.
    // Missing keys are left untouched.
    const planOverrideBody = z.object({
        monthly_price_mxn: z.number().int().min(0).max(1_000_000).optional(),
        enabled: z.boolean().optional(),
    });

    fastify.patch(
        '/admin/memberships/plans/:code',
        {
            preHandler: [
                fastify.authenticate,
                fastify.requireRole('ADMIN', 'SUPERADMIN'),
            ],
        },
        async (req) => {
            const code = String(req.params?.code || '').toUpperCase();
            if (!VALID_PLANS.includes(code)) {
                throw err('PLAN_INVALID', `Plan desconocido: ${code}`, 400);
            }
            const parsed = planOverrideBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const patch = parsed.data;
            if (Object.keys(patch).length === 0) {
                throw err(
                    'EMPTY_PATCH',
                    'Envía al menos un campo para actualizar.',
                    400,
                );
            }

            const workspaceId = assertWorkspaceAccess(req);
            if (!workspaceId) {
                throw err('WORKSPACE_MISSING', 'No se pudo resolver el workspace', 500);
            }

            const current = await getWorkspaceSettings(prisma, workspaceId, [
                SETTING_KEYS.PLAN_OVERRIDES,
            ]);
            const existing = current[SETTING_KEYS.PLAN_OVERRIDES] || {};
            const nextForCode = { ...(existing[code] || {}), ...patch };
            const nextAll = { ...existing, [code]: nextForCode };

            await setWorkspaceSetting(
                prisma,
                workspaceId,
                SETTING_KEYS.PLAN_OVERRIDES,
                nextAll,
                req.user.sub || req.user.id || null,
            );

            try {
                await audit(prisma, {
                    ...auditCtx(req),
                    action: 'ADMIN.MEMBERSHIP_PLAN_UPDATED',
                    entity_type: 'MembershipPlan',
                    entity_id: code,
                    metadata: { patch, override: nextForCode },
                });
            } catch {
                /* audit is best-effort */
            }

            const merged = await getMergedPublicPlanCatalog(prisma, workspaceId);
            const plan = merged.find((p) => p.id === code);
            return { success: true, plan };
        },
    );

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

    // POST /memberships/subscribe + /subscribe-card lived here (MP).
    // Replaced by POST /memberships/subscribe-stripe (memberships-stripe.js).

    // POST /memberships/renew lived here (MP Checkout Pro redirect).
    // Stripe Subscriptions auto-renew via invoice.payment_succeeded
    // webhook (see routes/webhooks-stripe.js), so a manual renew
    // endpoint is no longer required for the steady-state flow.

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

    // ─── PATCH /memberships/me/auto-renewal ───────────────────────
    //
    // Bidirectional toggle: lets the user turn auto-renewal off (so
    // the next cycle isn't charged) or back on (re-enable billing
    // after a previous cancellation, before the period actually ends).
    //
    // Mirrors `cancel_at_period_end` on the Stripe Subscription:
    //   enabled=false → cancel_at_period_end=true   (stop billing)
    //   enabled=true  → cancel_at_period_end=false  (resume billing)
    //
    // The local `auto_renew` flag is the source of truth surfaced to
    // the frontend; the webhook handler in webhooks-stripe.js mirrors
    // any out-of-band changes (e.g. customer cancelling via the Stripe
    // customer portal) back into this column.
    fastify.patch(
        '/memberships/me/auto-renewal',
        {
            preHandler: [fastify.authenticate],
            // Cap at 6 toggles/min — well above any legitimate
            // pattern, low enough to defang accidental loops.
            config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
        },
        async (req) => {
            const parsed = z
                .object({ enabled: z.boolean() })
                .safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const { enabled } = parsed.data;

            const userId = req.user.sub || req.user.id;
            const membership = await prisma.membership.findUnique({
                where: { user_id: userId },
            });
            if (!membership) {
                throw err('NO_MEMBERSHIP', 'No hay membresía', 404);
            }
            if (!membership.stripe_subscription_id) {
                // Manual / cash memberships have nothing to auto-renew.
                throw err(
                    'NO_SUBSCRIPTION',
                    'Esta membresía no tiene suscripción recurrente',
                    400,
                );
            }
            if (membership.auto_renew === enabled) {
                // Idempotent — no Stripe round-trip if state already matches.
                return { membership };
            }

            try {
                const stripe = getStripe();
                await stripe.subscriptions.update(
                    membership.stripe_subscription_id,
                    { cancel_at_period_end: !enabled },
                );
            } catch (e) {
                fastify.log.error(
                    { err: e, subId: membership.stripe_subscription_id, enabled },
                    '[memberships] Stripe auto-renewal toggle failed',
                );
                throw err(
                    'STRIPE_ERROR',
                    'No pudimos actualizar tu suscripción. Intenta de nuevo.',
                    502,
                );
            }

            const updated = await prisma.membership.update({
                where: { id: membership.id },
                data: { auto_renew: enabled },
            });

            await fireEvent(
                enabled ? 'membership.auto_renewal.enabled' : 'membership.canceled',
                {
                    workspaceId: membership.workspace_id,
                    userId,
                    membershipId: membership.id,
                },
            );

            return { membership: updated };
        },
    );

    // ─── POST /memberships/cancel ─────────────────────────────────
    //
    // Legacy endpoint — kept for any older callers. Equivalent to
    // PATCH /memberships/me/auto-renewal { enabled: false }. Prefer
    // the PATCH endpoint for new code.
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

            if (membership.stripe_subscription_id) {
                try {
                    const stripe = getStripe();
                    await stripe.subscriptions.update(
                        membership.stripe_subscription_id,
                        { cancel_at_period_end: true },
                    );
                } catch (e) {
                    fastify.log.error(
                        { err: e, subId: membership.stripe_subscription_id },
                        '[memberships] Stripe cancel_at_period_end failed',
                    );
                    // fall through — we still toggle auto_renew locally
                }
            }

            const updated = await prisma.membership.update({
                where: { id: membership.id },
                data: { auto_renew: false },
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
            const { user_id, plan, cycle, starts_at, note, method, replace_active } = parsed.data;
            const billingCycle = CYCLE_MAP[cycle];
            const adminWs = assertWorkspaceAccess(req);

            // Tenant guard via workspace-scoped findFirst. Pre-fix this
            // did findUnique then a `req.user.workspace_id && …` check
            // — the && short-circuited when workspace_id was missing
            // from the JWT, letting an admin with a broken token
            // assign memberships across workspaces. Mismatch is now a
            // 404 (existence-hiding) instead of a 403 that revealed
            // the user belonged elsewhere.
            const user = await prisma.user.findFirst({
                where: { id: user_id, workspace_id: adminWs },
            });
            if (!user) throw err('USER_NOT_FOUND', 'Socio no encontrado', 404);

            // Active membership → refuse UNLESS the admin explicitly
            // opted into replacement via `replace_active: true`. The
            // upsert below already handles the update path correctly;
            // this gate is just to prevent accidental overwrites from
            // direct API hits.
            const existing = await prisma.membership.findUnique({
                where: { user_id: user.id },
            });
            if (existing && existing.status === 'ACTIVE' && !replace_active) {
                throw err(
                    'MEMBERSHIP_ACTIVE',
                    'El socio ya tiene una membresía ACTIVA. Pasa replace_active=true para reemplazarla.',
                    409
                );
            }

            const basePrice = await getEffectivePlanPrice(prisma, user.workspace_id, plan, billingCycle);
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
                    // Trail for "what did this replace?" so audits can
                    // reconstruct plan changes without joining payments.
                    replaced_existing: !!(existing && existing.status === 'ACTIVE'),
                    previous_plan: existing?.plan || null,
                    previous_billing_cycle: existing?.billing_cycle || null,
                    previous_expires_at: existing?.expires_at || null,
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

            // Hard delete. We delete child rows explicitly first because
            // production schema came from `prisma db push` which doesn't
            // always recreate FKs with ON DELETE CASCADE — leaving an
            // orphan freeze that blocks the parent delete with a 23503.
            // Mirrors the cascade pattern in admin-members.js.
            try {
                await prisma.membershipFreeze.deleteMany({
                    where: { membership_id: membershipId },
                });
                await prisma.membership.delete({ where: { id: membershipId } });
            } catch (e) {
                fastify.log.error(
                    { err: e?.message, membershipId },
                    '[memberships.delete] failed'
                );
                throw err(
                    'DELETE_FAILED',
                    'No se pudo eliminar: hay datos referenciados que no pudimos limpiar. Contacta a soporte.',
                    409,
                    { reason: e?.message }
                );
            }

            return { ok: true, deleted_id: membershipId };
        }
    );
}
